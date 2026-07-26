"""
Debt payoff optimizer — pure Python simulation, no external solver needed.

Two passes:
  1. Optimized  — avalanche or snowball on attack loans, with user-defined floors/ceilings
  2. Minimums   — everyone pays minimums only (baseline comparison)

Returns structured month-by-month results + summary delta.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
import copy


# ── Data classes ───────────────────────────────────────────────────────────────

@dataclass
class LoanState:
    id: int
    name: str
    loan_type: str
    balance: float
    apr: float          # decimal, e.g. 0.2749 for 27.49%
    minimum: float      # required monthly payment
    strategy: str       # attack | minimum_only | exact | skip
    exact_override: float | None = None

    @property
    def monthly_interest(self) -> float:
        return self.balance * self.apr / 12

    def apply_payment(self, payment: float) -> float:
        """Apply payment, return actual interest charged."""
        interest = self.monthly_interest
        principal = max(0.0, payment - interest)
        self.balance = max(0.0, self.balance - principal)
        return interest


@dataclass
class MonthResult:
    month: str                  # "2026-06"
    income: float
    spending: float             # actual spending this month
    spending_budget: float      # ceiling (what we allowed)
    debt_payments: list         # [{name, payment, principal, interest, balance_after, is_extra}]
    total_debt_payment: float
    interest_paid: float
    savings: float
    cumulative_savings: float
    total_debt: float
    debt_free: bool = False


# ── Helpers ────────────────────────────────────────────────────────────────────

def _next_month(month_str: str) -> str:
    year, mo = int(month_str[:4]), int(month_str[5:])
    mo += 1
    if mo > 12:
        mo = 1
        year += 1
    return f'{year}-{mo:02d}'


def _simulate(
    loans: list[LoanState],
    monthly_income: float,
    spending_floor: float,
    spending_ceiling: float,
    savings_min: float,
    strategy: str,          # avalanche | snowball
    max_months: int = 60,
) -> list[MonthResult]:
    """Run one simulation pass. loans is mutated in place."""
    results: list[MonthResult] = []
    month = date.today().strftime('%Y-%m')
    cumulative_savings = 0.0

    for _ in range(max_months):
        active = [l for l in loans if l.balance > 0.01 and l.strategy != 'skip']

        if not active:
            # Debt-free phase — show remaining months with full savings
            savings = monthly_income - spending_ceiling
            cumulative_savings += savings
            results.append(MonthResult(
                month=month,
                income=monthly_income,
                spending=spending_ceiling,
                spending_budget=spending_ceiling,
                debt_payments=[],
                total_debt_payment=0.0,
                interest_paid=0.0,
                savings=round(savings, 2),
                cumulative_savings=round(cumulative_savings, 2),
                total_debt=0.0,
                debt_free=True,
            ))
            if len(results) > 3 and all(r.debt_free for r in results[-3:]):
                break
            month = _next_month(month)
            continue

        # ── Step 1: compute minimum payment per loan ──
        required: dict[int, float] = {}
        for loan in active:
            if loan.strategy == 'minimum_only':
                required[loan.id] = max(loan.minimum, loan.monthly_interest + 0.01)
            elif loan.strategy == 'exact' and loan.exact_override:
                required[loan.id] = min(loan.exact_override, loan.balance)
            else:  # attack
                required[loan.id] = max(loan.minimum, loan.monthly_interest + 0.01)

        total_required = sum(required.values())

        # ── Step 2: free money after floors + minimums + savings ──
        free = max(0.0, monthly_income - spending_floor - total_required - savings_min)

        # ── Step 3: allocate free money to attack loans ──
        extra: dict[int, float] = {l.id: 0.0 for l in active}
        remaining = free

        attack_loans = [l for l in active if l.strategy == 'attack']
        if strategy == 'avalanche':
            attack_loans.sort(key=lambda l: l.apr, reverse=True)
        else:  # snowball
            attack_loans.sort(key=lambda l: l.balance)

        for loan in attack_loans:
            if remaining <= 0:
                break
            payoff_extra = max(0.0, loan.balance - required[loan.id])
            give = min(remaining, payoff_extra)
            extra[loan.id] = give
            remaining -= give

        # ── Step 4: spending this month (floor + leftover up to ceiling) ──
        spending = spending_floor + min(remaining, spending_ceiling - spending_floor)
        remaining -= (spending - spending_floor)

        # ── Step 5: savings (target + anything left) ──
        savings = savings_min + max(0.0, remaining)
        cumulative_savings += savings

        # ── Step 6: apply payments and collect results ──
        payment_details = []
        total_interest = 0.0
        total_payment = 0.0

        for loan in active:
            payment = required.get(loan.id, 0.0) + extra.get(loan.id, 0.0)
            payment = min(payment, loan.balance + loan.monthly_interest)  # never overpay
            interest = loan.apply_payment(payment)
            total_interest += interest
            total_payment += payment
            payment_details.append({
                'name': loan.name,
                'payment': round(payment, 2),
                'interest': round(interest, 2),
                'principal': round(max(0.0, payment - interest), 2),
                'balance_after': round(loan.balance, 2),
                'is_extra': extra.get(loan.id, 0.0) > 0.01,
                'apr': loan.apr * 100,
            })

        total_debt = sum(l.balance for l in loans if l.strategy != 'skip')

        results.append(MonthResult(
            month=month,
            income=round(monthly_income, 2),
            spending=round(spending, 2),
            spending_budget=round(spending_ceiling, 2),
            debt_payments=payment_details,
            total_debt_payment=round(total_payment, 2),
            interest_paid=round(total_interest, 2),
            savings=round(savings, 2),
            cumulative_savings=round(cumulative_savings, 2),
            total_debt=round(total_debt, 2),
            debt_free=False,
        ))
        month = _next_month(month)

    return results


def _dataclass_to_dict(r: MonthResult) -> dict:
    return {
        'month': r.month,
        'income': r.income,
        'spending': r.spending,
        'spending_budget': r.spending_budget,
        'debt_payments': r.debt_payments,
        'total_debt_payment': r.total_debt_payment,
        'interest_paid': r.interest_paid,
        'savings': r.savings,
        'cumulative_savings': r.cumulative_savings,
        'total_debt': r.total_debt,
        'debt_free': r.debt_free,
    }


# ── Public API ─────────────────────────────────────────────────────────────────

def run_optimizer(config) -> dict:
    """
    config: OptimizerConfig ORM instance with prefetched category_params and loan_params.
    Returns: {optimized: {...}, minimums: {...}, delta: {...}}
    """
    monthly_income = float(config.weekly_income) * (52 / 12)
    savings_min = monthly_income * float(config.savings_target_pct) / 100

    # Build spending floor and ceiling from category params
    spending_floor   = sum(float(cp.floor_monthly)   for cp in config.category_params.all())
    spending_ceiling = sum(float(cp.ceiling_monthly) for cp in config.category_params.all())

    # Build loan states
    def build_loans(strategy_override: str | None = None) -> list[LoanState]:
        states = []
        for lp in config.loan_params.select_related('loan').all():
            loan = lp.loan
            if loan.status != 'active':
                continue
            states.append(LoanState(
                id=loan.pk,
                name=loan.name,
                loan_type=loan.loan_type,
                balance=float(loan.current_balance),
                apr=float(loan.annual_interest_rate or 0) / 100,
                minimum=float(loan.monthly_payment or 0),
                strategy=strategy_override or lp.strategy,
                exact_override=float(lp.exact_monthly_override) if lp.exact_monthly_override else None,
            ))
        return states

    # ── Pass 1: optimized ──
    opt_loans = build_loans()
    opt_results = _simulate(
        loans=opt_loans,
        monthly_income=monthly_income,
        spending_floor=spending_floor,
        spending_ceiling=spending_ceiling,
        savings_min=savings_min,
        strategy=config.strategy,
    )

    # ── Pass 2: minimums only baseline ──
    min_loans = build_loans(strategy_override='minimum_only')
    min_results = _simulate(
        loans=min_loans,
        monthly_income=monthly_income,
        spending_floor=spending_floor,
        spending_ceiling=spending_ceiling,
        savings_min=savings_min,
        strategy='avalanche',
    )

    def summarise(results: list[MonthResult]) -> dict:
        debt_months = [r for r in results if not r.debt_free]
        free_months = [r for r in results if r.debt_free]
        total_interest = sum(r.interest_paid for r in results)
        total_savings  = results[-1].cumulative_savings if results else 0
        debt_free_month = free_months[0].month if free_months else None
        months_to_free  = len(debt_months)
        return {
            'total_interest_paid': round(total_interest, 2),
            'total_savings': round(total_savings, 2),
            'debt_free_month': debt_free_month,
            'months_to_debt_free': months_to_free,
        }

    opt_summary = summarise(opt_results)
    min_summary = summarise(min_results)

    # ── Per-category recommended budget ──────────────────────────────────────
    # Use the average spending across the first 3 debt-months as the recommended level.
    # The optimizer already computed how much total spending is sustainable; now we
    # distribute that across categories proportionally between their floor and ceiling.
    debt_months = [r for r in opt_results if not r.debt_free]
    avg_spending = (
        sum(r.spending for r in debt_months[:3]) / min(3, len(debt_months))
        if debt_months else spending_floor
    )

    total_flex = spending_ceiling - spending_floor
    # How much flex the optimizer actually used on average
    flex_used = max(0.0, avg_spending - spending_floor)
    flex_ratio = flex_used / total_flex if total_flex > 0 else 0.0

    weeks_per_month = 52 / 12
    category_budget = []
    for cp in config.category_params.all():
        floor   = float(cp.floor_monthly)
        ceiling = float(cp.ceiling_monthly)
        cat_flex = ceiling - floor

        if cp.is_fixed or cat_flex < 0.01:
            recommended_monthly = floor
        else:
            recommended_monthly = floor + cat_flex * flex_ratio

        recommended_monthly = round(recommended_monthly, 2)
        recommended_weekly  = round(recommended_monthly / weeks_per_month, 2)

        tightness = 'fixed' if cp.is_fixed else (
            'tight'    if flex_ratio < 0.25 else
            'moderate' if flex_ratio < 0.70 else
            'relaxed'
        )

        category_budget.append({
            'category_name':       cp.category_name,
            'floor_monthly':       round(floor, 2),
            'ceiling_monthly':     round(ceiling, 2),
            'recommended_monthly': recommended_monthly,
            'recommended_weekly':  recommended_weekly,
            'is_fixed':            cp.is_fixed,
            'tightness':           tightness,
            'flex_pct_used':       round(flex_ratio * 100, 1),
        })

    category_budget.sort(key=lambda c: -c['recommended_monthly'])

    total_recommended_monthly = round(sum(c['recommended_monthly'] for c in category_budget), 2)
    total_recommended_weekly  = round(total_recommended_monthly / weeks_per_month, 2)

    # ── Monthly debt payment targets (from first debt month) ──────────────────
    debt_targets = []
    if debt_months:
        first = debt_months[0]
        for dp in first.debt_payments:
            debt_targets.append({
                'loan_name':   dp['name'],
                'monthly_payment': dp['payment'],
                'weekly_payment':  round(dp['payment'] / weeks_per_month, 2),
                'is_extra':    dp['is_extra'],
                'apr':         dp['apr'],
            })
        debt_targets.sort(key=lambda d: -d['monthly_payment'])

    # ── Transfer to savings (Chase) ───────────────────────────────────────────
    total_debt_monthly = sum(d['monthly_payment'] for d in debt_targets)
    transfer_to_savings_monthly = round(total_debt_monthly + savings_min, 2)
    transfer_to_savings_weekly  = round(transfer_to_savings_monthly / weeks_per_month, 2)

    # ── Delta ──
    interest_saved = round(min_summary['total_interest_paid'] - opt_summary['total_interest_paid'], 2)
    months_saved   = min_summary['months_to_debt_free'] - opt_summary['months_to_debt_free']
    extra_savings  = round(opt_summary['total_savings'] - min_summary['total_savings'], 2)

    return {
        'optimized': {
            'summary': opt_summary,
            'months': [_dataclass_to_dict(r) for r in opt_results],
        },
        'minimums': {
            'summary': min_summary,
            'months': [_dataclass_to_dict(r) for r in min_results],
        },
        'recommended_budget': {
            'categories': category_budget,
            'total_spending_monthly': total_recommended_monthly,
            'total_spending_weekly':  total_recommended_weekly,
            'transfer_to_savings_monthly': transfer_to_savings_monthly,
            'transfer_to_savings_weekly':  transfer_to_savings_weekly,
            'savings_monthly': round(savings_min, 2),
            'debt_payments_monthly': round(total_debt_monthly, 2),
            'debt_targets': debt_targets,
            'flex_ratio_pct': round(flex_ratio * 100, 1),
        },
        'delta': {
            'interest_saved': interest_saved,
            'months_saved': months_saved,
            'extra_savings': extra_savings,
            'strategy': config.strategy,
            'spending_floor': round(spending_floor, 2),
            'spending_ceiling': round(spending_ceiling, 2),
            'monthly_income': round(monthly_income, 2),
            'savings_min_monthly': round(savings_min, 2),
        },
    }
