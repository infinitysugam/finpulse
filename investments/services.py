"""Compound-interest wealth projection math."""
from decimal import Decimal, ROUND_HALF_UP
from .models import WealthProjection


TWO = Decimal('0.01')


def compute_wealth_projection(proj: WealthProjection) -> WealthProjection:
    """
    Run a month-by-month compound-interest simulation and persist the result.

    Formula per month:
        balance = balance * (1 + monthly_rate) + monthly_contribution
    """
    monthly_rate = Decimal(str(proj.annual_return_rate)) / 100 / 12
    balance = Decimal(str(proj.initial_investment))
    monthly_contribution = Decimal(str(proj.monthly_contribution))
    target = Decimal(str(proj.target_wealth))
    max_years = 100

    rows = []
    years_to_goal = None
    age = proj.current_age

    for month in range(1, max_years * 12 + 1):
        balance = balance * (1 + monthly_rate) + monthly_contribution
        if month % 12 == 0:
            year_num = month // 12
            age = proj.current_age + year_num
            rows.append({
                'year': year_num,
                'age': age,
                'balance': float(balance.quantize(TWO, rounding=ROUND_HALF_UP)),
            })
            if years_to_goal is None and balance >= target:
                years_to_goal = year_num

        if age >= proj.retirement_age and month % 12 == 0:
            break

    proj.projection_data = rows
    proj.years_to_goal = years_to_goal
    proj.projected_final_value = balance.quantize(TWO, rounding=ROUND_HALF_UP)
    proj.save()
    return proj
