"""
Polymorphic Loan Math Engine
============================
Pure Python — no ORM calls. All monetary values are Decimal; dates are date objects.

Supports two interest-accrual methods:
  FIXED_MONTHLY  – interest = balance × APR / 12  (standard amortisation)
  TRUE_DAILY     – interest = balance × APR / 365 × days_since_last_payment
"""
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

from dateutil.relativedelta import relativedelta

CalcMethod = Literal['FIXED_MONTHLY', 'TRUE_DAILY']
TWO = Decimal('0.01')
MAX_MONTHS = 600  # safety cap (50 years)


def _r2(v: Decimal) -> Decimal:
    return v.quantize(TWO, rounding=ROUND_HALF_UP)


# ── 1. Standard monthly-payment formula ──────────────────────────────────────

def calc_monthly_payment(
    principal: Decimal,
    annual_rate: Decimal,
    term_months: int,
) -> Decimal:
    """
    M = P · r(1+r)^n / ((1+r)^n − 1)
    where r = APR/12, n = term_months
    Returns 0 if annual_rate == 0 → simple division.
    """
    r = annual_rate / 12
    if r == 0:
        return _r2(principal / Decimal(term_months))
    factor = (1 + r) ** term_months
    return _r2(principal * (r * factor) / (factor - 1))


# ── 2. Per-payment interest helpers ─────────────────────────────────────────

def _interest_fixed(balance: Decimal, annual_rate: Decimal) -> Decimal:
    return _r2(balance * annual_rate / 12)


def _interest_daily(balance: Decimal, annual_rate: Decimal, days: int) -> Decimal:
    return _r2(balance * annual_rate / 365 * Decimal(str(days)))


def payment_split(
    balance: Decimal,
    annual_rate: Decimal,
    payment: Decimal,
    method: CalcMethod,
    days_since_last: int = 30,
) -> dict:
    """
    Split a single payment into interest / principal components.
    Returns {interest, principal, payment_applied, new_balance}
    """
    if method == 'FIXED_MONTHLY':
        interest = _interest_fixed(balance, annual_rate)
    else:
        interest = _interest_daily(balance, annual_rate, days_since_last)

    applied = min(payment, balance + interest)
    principal_paid = _r2(max(Decimal('0'), applied - interest))
    new_balance = _r2(max(Decimal('0'), balance - principal_paid))

    return {
        'interest': interest,
        'principal': principal_paid,
        'payment_applied': _r2(applied),
        'new_balance': new_balance,
    }


# ── 3. Full amortisation schedule ────────────────────────────────────────────

def build_schedule(
    principal: Decimal,
    annual_rate: Decimal,
    term_months: int,
    monthly_payment: Decimal,
    start_date: date,
    method: CalcMethod = 'FIXED_MONTHLY',
    extra_monthly: Decimal = Decimal('0'),
    lump_sum: Decimal = Decimal('0'),
    lump_sum_date: date | None = None,
) -> list[dict]:
    """
    Generate a complete amortisation schedule.

    extra_monthly  – added to every scheduled payment (recurring extra)
    lump_sum       – one-time additional principal payment applied on lump_sum_date
    """
    balance = Decimal(str(principal))
    cum_interest = Decimal('0')
    cum_principal = Decimal('0')
    prev_date = start_date
    rows = []

    cap = max(term_months, MAX_MONTHS)
    for month in range(1, cap + 1):
        if balance <= Decimal('0.005'):
            break

        pdate = start_date + relativedelta(months=month)
        days = (pdate - prev_date).days

        # Apply lump sum if it falls within this period
        lump_applied = Decimal('0')
        if lump_sum > 0 and lump_sum_date and prev_date < lump_sum_date <= pdate:
            lump_applied = _r2(min(lump_sum, balance))
            balance = _r2(balance - lump_applied)
            cum_principal += lump_applied
            if balance <= Decimal('0.005'):
                balance = Decimal('0')
                rows.append({
                    'month': month,
                    'payment_date': str(pdate),
                    'days_in_period': days,
                    'payment': Decimal('0'),
                    'principal': Decimal('0'),
                    'interest': Decimal('0'),
                    'lump_sum_applied': lump_applied,
                    'balance': Decimal('0'),
                    'cumulative_interest': _r2(cum_interest),
                    'cumulative_principal': _r2(cum_principal),
                })
                break

        split = payment_split(
            balance, annual_rate, monthly_payment + extra_monthly, method, days
        )

        balance = split['new_balance']
        cum_interest += split['interest']
        cum_principal += split['principal']

        rows.append({
            'month': month,
            'payment_date': str(pdate),
            'days_in_period': days,
            'payment': split['payment_applied'],
            'principal': split['principal'],
            'interest': split['interest'],
            'lump_sum_applied': lump_applied,
            'balance': balance,
            'cumulative_interest': _r2(cum_interest),
            'cumulative_principal': _r2(cum_principal),
        })

        prev_date = pdate

    return rows


# ── 4. Aggregators ────────────────────────────────────────────────────────────

def total_interest_paid(payment_history: list) -> Decimal:
    """Sum of interest_component from LoanPayment records."""
    return _r2(sum(
        (Decimal(str(p.interest_component if hasattr(p, 'interest_component') else p.get('interest_component', 0)))
         for p in payment_history),
        Decimal('0'),
    ))


def current_payoff_amount(
    balance: Decimal,
    annual_rate: Decimal,
    method: CalcMethod,
    last_payment_date: date,
    as_of: date | None = None,
) -> dict:
    """
    Amount needed to pay off the loan in full today.
    = outstanding principal + interest accrued since last payment.
    """
    today = as_of or date.today()
    days = max(0, (today - last_payment_date).days)

    if method == 'FIXED_MONTHLY':
        # Pro-rate the monthly interest by days elapsed out of 30
        accrued = _r2(_interest_fixed(balance, annual_rate) * Decimal(str(days)) / 30)
    else:
        accrued = _interest_daily(balance, annual_rate, days)

    return {
        'principal_balance': _r2(balance),
        'accrued_interest': accrued,
        'payoff_amount': _r2(balance + accrued),
        'days_since_last_payment': days,
        'as_of_date': str(today),
    }


def effective_apr(
    principal: Decimal,
    start_date: date,
    payment_history: list,
) -> Decimal | None:
    """
    Compute the effective APR via Newton's method (daily IRR → annualise).
    Requires at least 2 recorded payments to be meaningful.
    """
    if len(payment_history) < 2:
        return None

    # Build (amount, days_from_start) cash-flow pairs
    flows: list[tuple[float, int]] = [(-float(principal), 0)]
    for p in payment_history:
        if hasattr(p, 'payment_date'):
            pdate = p.payment_date
            amt = float(p.amount)
        else:
            raw = p.get('payment_date') or p.get('date')
            if isinstance(raw, str):
                from datetime import datetime
                pdate = datetime.strptime(raw[:10], '%Y-%m-%d').date()
            else:
                pdate = raw
            amt = float(p.get('amount', 0))
        flows.append((amt, (pdate - start_date).days))

    # Newton's method — find daily rate r such that NPV = 0
    r = 0.0003  # ~11% APR starting guess
    for _ in range(200):
        npv  = sum(a / (1 + r) ** d for a, d in flows)
        dnpv = sum(-d * a / (1 + r) ** (d + 1) for a, d in flows)
        if abs(dnpv) < 1e-12:
            break
        delta = npv / dnpv
        r -= delta
        if abs(delta) < 1e-12:
            break

    if r <= 0 or r > 1:
        return None

    apr = Decimal(str((1 + r) ** 365 - 1)) * 100
    return _r2(apr)


# ── 5. What-If simulation ─────────────────────────────────────────────────────

def what_if_simulation(
    balance: Decimal,
    annual_rate: Decimal,
    term_months: int,
    monthly_payment: Decimal,
    start_date: date,
    method: CalcMethod = 'FIXED_MONTHLY',
    lump_sum: Decimal = Decimal('0'),
    recurring_extra: Decimal = Decimal('0'),
    lump_sum_date: date | None = None,
) -> dict:
    """
    Run baseline vs. what-if scenario and return a structured comparison.
    """
    def _summarise(rows: list[dict]) -> dict:
        if not rows:
            return {'months': 0, 'payoff_date': None,
                    'total_interest': Decimal('0'), 'total_paid': Decimal('0')}
        return {
            'months': len(rows),
            'payoff_date': rows[-1]['payment_date'],
            'total_interest': _r2(rows[-1]['cumulative_interest']),
            'total_paid': _r2(sum(r['payment'] for r in rows)),
        }

    baseline = build_schedule(
        balance, annual_rate, term_months, monthly_payment, start_date, method
    )
    scenario = build_schedule(
        balance, annual_rate, term_months, monthly_payment, start_date, method,
        extra_monthly=recurring_extra,
        lump_sum=lump_sum,
        lump_sum_date=lump_sum_date or (start_date + relativedelta(months=1)),
    )

    base = _summarise(baseline)
    scen = _summarise(scenario)
    months_saved = base['months'] - scen['months']

    def _time_label(n: int) -> str:
        if n <= 0:
            return 'No time saved'
        yrs, mos = divmod(abs(n), 12)
        parts = ([f'{yrs} yr'] if yrs else []) + ([f'{mos} mo'] if mos else [])
        return ' '.join(parts)

    return {
        'method': method,
        'baseline': base,
        'scenario': {**scen,
                     'lump_sum': _r2(lump_sum),
                     'recurring_extra': _r2(recurring_extra)},
        'savings': {
            'months_saved': months_saved,
            'interest_saved': _r2(base['total_interest'] - scen['total_interest']),
            'time_saved_label': _time_label(months_saved),
        },
        'baseline_schedule': [
            {'month': r['month'], 'payment_date': r['payment_date'],
             'balance': float(r['balance']),
             'cumulative_interest': float(r['cumulative_interest'])}
            for r in baseline
        ],
        'scenario_schedule': [
            {'month': r['month'], 'payment_date': r['payment_date'],
             'balance': float(r['balance']),
             'cumulative_interest': float(r['cumulative_interest'])}
            for r in scenario
        ],
    }
