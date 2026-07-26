"""
All tool implementations for the FinPulse AI Agent.
Each function takes `user` as the first argument, then the tool parameters.
"""
import json
import logging
from datetime import datetime, date
from decimal import Decimal

logger = logging.getLogger(__name__)


# ── serialisation ─────────────────────────────────────────────────────────────

class _Encoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, (date, datetime)):
            return str(obj)
        return super().default(obj)


def _dumps(data) -> str:
    return json.dumps(data, cls=_Encoder)


def _date(s: str) -> date:
    return datetime.strptime(s, '%Y-%m-%d').date()


# ── tools ─────────────────────────────────────────────────────────────────────

def get_transactions(user, from_date: str = None, to_date: str = None,
                     transaction_type: str = None, category_name: str = None,
                     description_search: str = None, limit: int = 50) -> dict:
    from transactions.models import Transaction
    qs = Transaction.objects.filter(user=user).select_related('category', 'account').order_by('-date')
    if from_date:
        qs = qs.filter(date__gte=_date(from_date))
    if to_date:
        qs = qs.filter(date__lte=_date(to_date))
    if transaction_type:
        qs = qs.filter(transaction_type=transaction_type)
    if category_name:
        qs = qs.filter(category__name__icontains=category_name)
    if description_search:
        qs = qs.filter(description__icontains=description_search)

    limit = min(limit or 50, 200)
    rows = []
    for tx in qs[:limit]:
        rows.append({
            'date': str(tx.date),
            'description': tx.description,
            'amount': float(tx.amount),
            'type': tx.transaction_type,
            'category': tx.category.name if tx.category else 'Uncategorized',
            'account': tx.account.name if tx.account else None,
        })
    return {'transactions': rows, 'count': len(rows)}


def get_spending_by_category(user, from_date: str = None, to_date: str = None) -> dict:
    from transactions.models import Transaction
    from django.db.models import Sum
    qs = Transaction.objects.filter(user=user, transaction_type='expense')
    if from_date:
        qs = qs.filter(date__gte=_date(from_date))
    if to_date:
        qs = qs.filter(date__lte=_date(to_date))
    rows = (
        qs.values('category__name')
        .annotate(total=Sum('amount'))
        .order_by('-total')
    )
    cats = [{'category': r['category__name'] or 'Uncategorized', 'total': float(r['total'])} for r in rows]
    return {'categories': cats, 'total_expenses': sum(c['total'] for c in cats)}


def get_account_balances(user) -> dict:
    from accounts.models import Account
    accounts = Account.objects.filter(user=user, is_active=True).select_related('loan').order_by('account_type', 'name')
    rows = []
    for a in accounts:
        # For credit cards, the linked Loan.current_balance is authoritative (updated by payments)
        balance = float(a.loan.current_balance) if a.account_type == 'credit_card' and hasattr(a, 'loan') and a.loan else float(a.balance)
        rows.append({'name': a.name, 'type': a.account_type, 'balance': balance})
    return {'accounts': rows, 'net_worth': float(user.net_worth)}


def get_loans(user, include_payments: bool = False) -> dict:
    from loans.models import Loan, LoanPayment
    loans = Loan.objects.filter(user=user).order_by('status', 'name')
    result = []
    for loan in loans:
        item = {
            'name': loan.name,
            'type': loan.loan_type,
            'status': loan.status,
            'principal': float(loan.principal) if loan.principal is not None else None,
            'current_balance': float(loan.current_balance),
            'interest_rate': float(loan.annual_interest_rate) if loan.annual_interest_rate is not None else None,
            'monthly_payment': float(loan.monthly_payment) if loan.monthly_payment else None,
            'next_payment_date': str(loan.next_payment_date) if loan.next_payment_date else None,
        }
        if include_payments:
            payments = LoanPayment.objects.filter(loan=loan).order_by('-payment_date')[:12]
            item['recent_payments'] = [
                {
                    'date': str(p.payment_date),
                    'amount': float(p.amount),
                    'principal': float(p.principal_component),
                    'interest': float(p.interest_component),
                }
                for p in payments
            ]
        result.append(item)
    total_debt = sum(float(l['current_balance']) for l in result if l['status'] == 'active')
    return {'loans': result, 'total_active_debt': total_debt}


def get_investments(user) -> dict:
    from investments.models import Portfolio, Holding
    portfolios = Portfolio.objects.filter(user=user).prefetch_related('holdings')
    result = []
    for p in portfolios:
        holdings = []
        for h in p.holdings.all():
            value = float(h.quantity * h.current_price)
            cost = float(h.quantity * h.average_cost_basis) if h.average_cost_basis else None
            pnl = round(value - cost, 2) if cost else None
            pnl_pct = round((value - cost) / cost * 100, 2) if cost and cost > 0 else None
            holdings.append({
                'symbol': h.symbol,
                'name': h.name,
                'type': h.asset_type,
                'quantity': float(h.quantity),
                'current_price': float(h.current_price),
                'value': value,
                'cost_basis': cost,
                'unrealized_pnl': pnl,
                'unrealized_pnl_pct': pnl_pct,
            })
        total_value = sum(h['value'] for h in holdings)
        total_cost = sum(h['cost_basis'] for h in holdings if h['cost_basis'] is not None)
        result.append({
            'portfolio': p.name,
            'total_value': total_value,
            'total_cost_basis': total_cost,
            'unrealized_pnl': round(total_value - total_cost, 2) if total_cost else None,
            'holdings': holdings,
        })
    return {'portfolios': result, 'total_invested': sum(p['total_value'] for p in result)}


def get_goals(user) -> dict:
    from goals.models import FinancialGoal
    goals = FinancialGoal.objects.filter(user=user).order_by('status', 'goal_type')
    result = []
    for g in goals:
        result.append({
            'name': g.name,
            'type': g.goal_type,
            'status': g.status,
            'target': float(g.effective_target),
            'current': float(g.current_amount),
            'progress_pct': float(g.progress_pct),
            'target_date': str(g.target_date) if g.target_date else None,
        })
    return {'goals': result}


def get_income_vs_expenses(user, from_date: str = None, to_date: str = None, group_by: str = None) -> dict:
    from transactions.models import Transaction
    from django.db.models import Sum
    qs = Transaction.objects.filter(user=user)
    if from_date:
        qs = qs.filter(date__gte=_date(from_date))
    if to_date:
        qs = qs.filter(date__lte=_date(to_date))

    income = float(qs.filter(transaction_type='income').aggregate(t=Sum('amount'))['t'] or 0)
    expenses = float(qs.filter(transaction_type='expense').aggregate(t=Sum('amount'))['t'] or 0)
    result = {
        'income': income,
        'expenses': expenses,
        'net_cash_flow': round(income - expenses, 2),
        'savings_rate_pct': round((income - expenses) / income * 100, 1) if income > 0 else None,
    }

    if group_by in ('day', 'week', 'month'):
        from django.db.models.functions import TruncDay, TruncWeek, TruncMonth
        trunc = {'day': TruncDay, 'week': TruncWeek, 'month': TruncMonth}[group_by]
        rows = (
            qs.annotate(period=trunc('date'))
            .values('period', 'transaction_type')
            .annotate(total=Sum('amount'))
            .order_by('period')
        )
        by_period: dict = {}
        for row in rows:
            p = str(row['period'].date()) if hasattr(row['period'], 'date') else str(row['period'])
            if p not in by_period:
                by_period[p] = {'period': p, 'income': 0.0, 'expenses': 0.0}
            if row['transaction_type'] == 'income':
                by_period[p]['income'] = float(row['total'])
            elif row['transaction_type'] == 'expense':
                by_period[p]['expenses'] = float(row['total'])
        for v in by_period.values():
            v['net'] = round(v['income'] - v['expenses'], 2)
        result['by_period'] = list(by_period.values())

    return result


def get_subscriptions(user) -> dict:
    from subscriptions.models import Subscription
    subs = Subscription.objects.filter(user=user).order_by('status', 'name')
    rows = []
    for s in subs:
        rows.append({
            'name': s.name,
            'category': s.category,
            'amount': float(s.amount),
            'billing_cycle': s.billing_cycle,
            'status': s.status,
            'next_billing_date': str(s.next_billing_date) if s.next_billing_date else None,
        })
    active = [r for r in rows if r['status'] == 'active']
    monthly = sum(r['amount'] for r in active if r['billing_cycle'] == 'monthly')
    annual = sum(r['amount'] for r in active if r['billing_cycle'] == 'annual')
    return {
        'subscriptions': rows,
        'monthly_recurring': round(monthly, 2),
        'annual_charges': round(annual, 2),
        'monthly_equivalent': round(monthly + annual / 12, 2),
    }


def get_net_worth_history(user, months: int = 12) -> dict:
    from transactions.models import MonthlySnapshot
    from django.utils import timezone
    from dateutil.relativedelta import relativedelta
    cutoff = timezone.now() - relativedelta(months=months)
    snapshots = (
        MonthlySnapshot.objects
        .filter(user=user)
        .filter(year__gte=cutoff.year)
        .order_by('year', 'month')
    )
    rows = []
    for s in snapshots:
        rows.append({
            'period': f'{s.year}-{s.month:02d}',
            'net_worth': float(s.net_worth) if s.net_worth is not None else None,
            'income': float(s.total_income),
            'expenses': float(s.total_expenses),
            'savings_rate_pct': float(s.savings_rate),
        })
    return {'history': rows, 'months_requested': months}


# ── tool registry ─────────────────────────────────────────────────────────────

TOOL_DEFINITIONS = [
    {
        'name': 'get_transactions',
        'description': (
            'Fetch individual transactions with optional filters. '
            'Use for: specific merchant lookups, category drill-downs, date range lists, '
            'income source breakdown, finding specific payments.'
        ),
        'input_schema': {
            'type': 'object',
            'properties': {
                'from_date':          {'type': 'string', 'description': 'Start date YYYY-MM-DD'},
                'to_date':            {'type': 'string', 'description': 'End date YYYY-MM-DD'},
                'transaction_type':   {'type': 'string', 'enum': ['income', 'expense', 'transfer']},
                'category_name':      {'type': 'string', 'description': 'Filter by category name (partial match, e.g. "food", "rent")'},
                'description_search': {'type': 'string', 'description': 'Search in description/merchant name'},
                'limit':              {'type': 'integer', 'description': 'Max rows (default 50, max 200)'},
            },
        },
    },
    {
        'name': 'get_spending_by_category',
        'description': (
            'Get expense totals grouped by category for a period. '
            'Use for: "how much did I spend on X", budget analysis, spending breakdowns.'
        ),
        'input_schema': {
            'type': 'object',
            'properties': {
                'from_date': {'type': 'string', 'description': 'Start date YYYY-MM-DD'},
                'to_date':   {'type': 'string', 'description': 'End date YYYY-MM-DD'},
            },
        },
    },
    {
        'name': 'get_account_balances',
        'description': 'Get all bank and credit account balances plus current net worth.',
        'input_schema': {'type': 'object', 'properties': {}},
    },
    {
        'name': 'get_loans',
        'description': 'Get all loans — balances, interest rates, monthly payments. Optionally include payment history.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'include_payments': {'type': 'boolean', 'description': 'Include last 12 payments per loan (default false)'},
            },
        },
    },
    {
        'name': 'get_investments',
        'description': 'Get investment portfolios and holdings with current values, cost basis, and unrealized P&L.',
        'input_schema': {'type': 'object', 'properties': {}},
    },
    {
        'name': 'get_goals',
        'description': 'Get all financial goals (FIRE, savings, debt-free, etc.) with current progress.',
        'input_schema': {'type': 'object', 'properties': {}},
    },
    {
        'name': 'get_income_vs_expenses',
        'description': (
            'Get income, expenses, net cash flow and savings rate for a period. '
            'Can group by day/week/month for trend analysis.'
        ),
        'input_schema': {
            'type': 'object',
            'properties': {
                'from_date': {'type': 'string', 'description': 'Start date YYYY-MM-DD'},
                'to_date':   {'type': 'string', 'description': 'End date YYYY-MM-DD'},
                'group_by':  {'type': 'string', 'enum': ['day', 'week', 'month'], 'description': 'Break results into time buckets'},
            },
        },
    },
    {
        'name': 'get_subscriptions',
        'description': 'Get all subscriptions with monthly/annual costs and next billing dates.',
        'input_schema': {'type': 'object', 'properties': {}},
    },
    {
        'name': 'get_net_worth_history',
        'description': 'Get monthly net worth, income, expenses, and savings rate snapshots over time.',
        'input_schema': {
            'type': 'object',
            'properties': {
                'months': {'type': 'integer', 'description': 'How many months back (default 12)'},
            },
        },
    },
    {
        'name': 'propose_budget_update',
        'description': (
            'Save a budget plan as a draft for the user to review and approve. '
            'Use this when the user asks you to create or update their budget. '
            'Always fetch current loan balances and spending history first, then call this tool. '
            'The user will see a diff on the Budget page and click Approve to make it live.'
        ),
        'input_schema': {
            'type': 'object',
            'required': ['budget_name', 'weekly_income', 'category_limits', 'debt_targets', 'week_plans'],
            'properties': {
                'budget_name': {'type': 'string', 'description': 'Short name, e.g. "Debt Payoff Plan — July 2026"'},
                'weekly_income': {'type': 'number', 'description': 'Standard weekly take-home pay'},
                'spending_account_name': {'type': 'string', 'description': 'Name of the spending account (e.g. "Wells Fargo")'},
                'savings_account_name': {'type': 'string', 'description': 'Name of the savings/debt account (e.g. "Chase")'},
                'notes': {'type': 'string', 'description': 'High-level plan summary shown on Budget page'},
                'conversation_id': {'type': 'integer', 'description': 'ID of the current conversation (for traceability)'},
                'category_limits': {
                    'type': 'array',
                    'description': 'Weekly spending limit per category',
                    'items': {
                        'type': 'object',
                        'required': ['category_name'],
                        'properties': {
                            'category_name': {'type': 'string'},
                            'weekly_limit': {'type': 'number', 'description': 'null/omit = no cap (need-basis)'},
                            'notes': {'type': 'string'},
                        },
                    },
                },
                'debt_targets': {
                    'type': 'array',
                    'description': 'Debt payoff priority and monthly targets',
                    'items': {
                        'type': 'object',
                        'required': ['loan_name', 'priority', 'monthly_minimum', 'default_monthly_target'],
                        'properties': {
                            'loan_name': {'type': 'string', 'description': 'Partial match of loan name'},
                            'priority': {'type': 'integer', 'description': '1 = highest priority'},
                            'monthly_minimum': {'type': 'number'},
                            'default_monthly_target': {'type': 'number', 'description': 'Total including minimum'},
                        },
                    },
                },
                'week_plans': {
                    'type': 'array',
                    'description': '4-week detailed plan for the current month',
                    'items': {
                        'type': 'object',
                        'required': ['week_start', 'income_expected', 'transfer_to_savings', 'spending_budget'],
                        'properties': {
                            'week_start': {'type': 'string', 'description': 'Monday date YYYY-MM-DD'},
                            'income_expected': {'type': 'number'},
                            'transfer_to_savings': {'type': 'number', 'description': 'Move to Chase this week'},
                            'spending_budget': {'type': 'number', 'description': 'Stays in Wells Fargo'},
                            'notes': {'type': 'string', 'description': 'e.g. "Kill Citi CC this week"'},
                            'debt_payments': {
                                'type': 'array',
                                'items': {
                                    'type': 'object',
                                    'properties': {
                                        'loan_name': {'type': 'string'},
                                        'amount': {'type': 'number'},
                                        'priority': {'type': 'integer'},
                                        'note': {'type': 'string'},
                                    },
                                },
                            },
                        },
                    },
                },
                'debt_month_overrides': {
                    'type': 'array',
                    'description': 'Month-specific overrides (minimum only, exact amount, extra, skip)',
                    'items': {
                        'type': 'object',
                        'required': ['loan_name', 'month', 'override_type'],
                        'properties': {
                            'loan_name': {'type': 'string'},
                            'month': {'type': 'string', 'description': 'First day of month YYYY-MM-DD'},
                            'override_type': {'type': 'string', 'enum': ['minimum_only', 'exact', 'extra', 'skip']},
                            'amount': {'type': 'number', 'description': 'Required for exact/extra types'},
                            'notes': {'type': 'string'},
                        },
                    },
                },
            },
        },
    },
]

def propose_budget_update(
    user,
    budget_name: str,
    weekly_income: float,
    category_limits: list,
    debt_targets: list,
    week_plans: list,
    debt_month_overrides: list = None,
    spending_account_name: str = None,
    savings_account_name: str = None,
    notes: str = '',
    conversation_id: int = None,
) -> dict:
    """
    Save a budget proposal as a draft.
    The user must approve it on the Budget page before it goes live.

    category_limits: [{category_name, weekly_limit (null = no cap)}]
    debt_targets: [{loan_name, priority, monthly_minimum, default_monthly_target}]
    week_plans: [{week_start (YYYY-MM-DD), income_expected, transfer_to_savings,
                  spending_budget, debt_payments: [{loan_name, amount, priority, note}], notes}]
    debt_month_overrides: [{loan_name, month (YYYY-MM-DD), override_type, amount, notes}]
    """
    from budget.models import Budget, BudgetCategoryLimit, BudgetDebtTarget, BudgetDebtMonthOverride, BudgetWeekPlan
    from accounts.models import Account
    from loans.models import Loan
    from ai_agent.models import Conversation
    from datetime import timedelta

    # Resolve accounts by name
    spending_account = None
    savings_account = None
    if spending_account_name:
        spending_account = Account.objects.filter(user=user, name__icontains=spending_account_name, is_active=True).first()
    if savings_account_name:
        savings_account = Account.objects.filter(user=user, name__icontains=savings_account_name, is_active=True).first()

    conversation = None
    if conversation_id:
        conversation = Conversation.objects.filter(pk=conversation_id, user=user).first()

    # Create the draft Budget
    budget = Budget.objects.create(
        user=user,
        name=budget_name,
        status='draft',
        weekly_income=weekly_income,
        spending_account=spending_account,
        savings_account=savings_account,
        created_from_conversation=conversation,
        notes=notes,
    )

    # Category limits
    for cl in category_limits:
        BudgetCategoryLimit.objects.create(
            budget=budget,
            category_name=cl['category_name'],
            weekly_limit=cl.get('weekly_limit'),
            notes=cl.get('notes', ''),
        )

    # Debt targets — resolve loan by name
    loan_map = {}
    for dt in debt_targets:
        loan = Loan.objects.filter(user=user, name__icontains=dt['loan_name'], status='active').first()
        if not loan:
            continue
        loan_map[dt['loan_name'].lower()] = loan.pk
        BudgetDebtTarget.objects.create(
            budget=budget,
            loan=loan,
            priority=dt['priority'],
            monthly_minimum=dt['monthly_minimum'],
            default_monthly_target=dt['default_monthly_target'],
        )

    # Month overrides
    for ov in (debt_month_overrides or []):
        loan = Loan.objects.filter(user=user, name__icontains=ov['loan_name'], status='active').first()
        if not loan:
            continue
        try:
            month = datetime.strptime(str(ov['month'])[:10], '%Y-%m-%d').date().replace(day=1)
        except ValueError:
            continue
        BudgetDebtMonthOverride.objects.create(
            budget=budget,
            loan=loan,
            month=month,
            override_type=ov['override_type'],
            amount=ov.get('amount'),
            notes=ov.get('notes', ''),
        )

    # Week plans
    for wp in week_plans:
        try:
            ws = datetime.strptime(str(wp['week_start'])[:10], '%Y-%m-%d').date()
            # Snap to Monday
            ws = ws - timedelta(days=ws.weekday())
        except (KeyError, ValueError):
            continue
        we = ws + timedelta(days=6)
        BudgetWeekPlan.objects.create(
            budget=budget,
            week_start=ws,
            week_end=we,
            status='draft',
            income_expected=wp['income_expected'],
            transfer_to_savings=wp['transfer_to_savings'],
            spending_budget=wp['spending_budget'],
            debt_payments=wp.get('debt_payments', []),
            notes=wp.get('notes', ''),
        )

    return {
        'draft_id': budget.pk,
        'status': 'draft',
        'message': (
            f'Budget "{budget_name}" saved as draft (id={budget.pk}). '
            'The user must approve it on the Budget page before it goes live.'
        ),
        'weeks_planned': len(week_plans),
        'categories': len(category_limits),
        'debt_targets': len(debt_targets),
    }


_REGISTRY = {
    'get_transactions':         get_transactions,
    'get_spending_by_category': get_spending_by_category,
    'get_account_balances':     get_account_balances,
    'get_loans':                get_loans,
    'get_investments':          get_investments,
    'get_goals':                get_goals,
    'get_income_vs_expenses':   get_income_vs_expenses,
    'get_subscriptions':        get_subscriptions,
    'get_net_worth_history':    get_net_worth_history,
    'propose_budget_update':    propose_budget_update,
}


def execute_tool(tool_name: str, tool_input: dict, user) -> str:
    fn = _REGISTRY.get(tool_name)
    if not fn:
        return json.dumps({'error': f'Unknown tool: {tool_name}'})
    try:
        return _dumps(fn(user, **tool_input))
    except Exception as exc:
        logger.error('Tool %s failed: %s', tool_name, exc)
        return json.dumps({'error': str(exc)})
