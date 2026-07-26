from decimal import Decimal
from django.db.models import Sum, F


def recompute_net_worth(user):
    """Recompute and persist user.net_worth from live account/portfolio/loan data."""
    from accounts.models import Account
    from investments.models import Holding
    from loans.models import Loan

    asset_types = ('checking', 'savings', 'cash', 'other')
    total_assets = (
        Account.objects.filter(user=user, account_type__in=asset_types, is_active=True)
        .aggregate(t=Sum('balance'))['t'] or Decimal('0')
    )
    portfolio_value = Decimal(str(
        Holding.objects.filter(portfolio__user=user)
        .aggregate(t=Sum(F('quantity') * F('current_price')))['t'] or 0
    ))
    receivables = (
        Loan.objects.filter(user=user, status='active', loan_type='lent_to_friend')
        .aggregate(t=Sum('current_balance'))['t'] or Decimal('0')
    )
    total_debt = (
        Loan.objects.filter(user=user, status='active')
        .exclude(loan_type='lent_to_friend')
        .aggregate(t=Sum('current_balance'))['t'] or Decimal('0')
    )
    nw = total_assets + portfolio_value + receivables - total_debt
    # Use update() to avoid triggering further signals
    type(user).objects.filter(pk=user.pk).update(net_worth=nw)
    user.net_worth = nw

    # Keep FIRE goals in sync — their "current amount" IS the user's net worth
    from goals.models import FinancialGoal
    FinancialGoal.objects.filter(user=user, goal_type='fire', status='active').update(
        current_amount=nw,
    )

    return nw
