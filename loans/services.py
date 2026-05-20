"""
Pure-Python financial math for loans.
No Django ORM calls here — keeps it testable in isolation.
"""
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from dateutil.relativedelta import relativedelta

TWO = Decimal('0.01')
MAX_REVOLVING_MONTHS = 360  # 30-year safety cap for credit cards / no-term loans


def _round(value: Decimal) -> Decimal:
    return value.quantize(TWO, rounding=ROUND_HALF_UP)


def build_amortization_table(
    principal: Decimal,
    annual_rate: Decimal,
    term_months: int | None,
    monthly_payment: Decimal,
    start_date: date | None,
    extra_monthly: Decimal = Decimal('0'),
) -> list[dict]:
    """
    Generate a full amortization schedule.

    For revolving debt (credit cards) pass term_months=None — the loop runs
    until the balance reaches zero or MAX_REVOLVING_MONTHS, whichever comes first.
    start_date=None defaults to today.
    """
    monthly_rate = annual_rate / 100 / 12
    balance = Decimal(str(principal))
    cumulative_interest = Decimal('0')
    effective_start = start_date or date.today()
    cap = term_months if term_months is not None else MAX_REVOLVING_MONTHS
    rows = []

    for month in range(1, cap + 1):
        if balance <= 0:
            break

        interest = _round(balance * monthly_rate)

        # Guard: if minimum payment doesn't even cover interest the balance
        # would grow forever — cap the simulation and surface the problem.
        total_payment = monthly_payment + extra_monthly
        if total_payment <= interest and extra_monthly == Decimal('0'):
            # Minimum payment too low — just record interest-only and break
            rows.append({
                'month': month,
                'payment_date': effective_start + relativedelta(months=month),
                'payment': _round(total_payment),
                'principal': Decimal('0'),
                'interest': interest,
                'balance': _round(balance + interest - total_payment),
                'cumulative_interest': cumulative_interest + interest,
                'warning': 'minimum_payment_below_interest',
            })
            break

        payment = min(total_payment, balance + interest)
        principal_payment = _round(payment - interest)
        balance = _round(balance - principal_payment)
        cumulative_interest += interest

        rows.append({
            'month': month,
            'payment_date': effective_start + relativedelta(months=month),
            'payment': _round(payment),
            'principal': principal_payment,
            'interest': interest,
            'balance': max(balance, Decimal('0')),
            'cumulative_interest': cumulative_interest,
        })

    return rows


def what_if_analysis(
    principal: Decimal,
    annual_rate: Decimal,
    term_months: int | None,
    monthly_payment: Decimal,
    start_date: date | None,
    extra_monthly: Decimal,
) -> dict:
    """
    Compare baseline vs. extra-payment scenarios.
    Works for both fixed-term loans and revolving credit (term_months=None).
    """
    baseline = build_amortization_table(
        principal, annual_rate, term_months, monthly_payment, start_date, Decimal('0')
    )
    accelerated = build_amortization_table(
        principal, annual_rate, term_months, monthly_payment, start_date, extra_monthly
    )

    baseline_interest    = baseline[-1]['cumulative_interest']    if baseline    else Decimal('0')
    accelerated_interest = accelerated[-1]['cumulative_interest'] if accelerated else Decimal('0')

    return {
        'baseline_months':            len(baseline),
        'accelerated_months':         len(accelerated),
        'months_saved':               len(baseline) - len(accelerated),
        'baseline_total_interest':    baseline_interest,
        'accelerated_total_interest': accelerated_interest,
        'interest_saved':             _round(baseline_interest - accelerated_interest),
        'payoff_date_baseline':       baseline[-1]['payment_date']    if baseline    else None,
        'payoff_date_accelerated':    accelerated[-1]['payment_date'] if accelerated else None,
    }
