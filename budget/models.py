from django.db import models
from django.conf import settings


class Budget(models.Model):
    STATUS_CHOICES = [('draft', 'Draft'), ('active', 'Active')]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='budgets')
    name = models.CharField(max_length=200)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')

    spending_account = models.ForeignKey(
        'accounts.Account', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='budget_as_spending',
        help_text='Wells Fargo — weekly spending money stays here',
    )
    savings_account = models.ForeignKey(
        'accounts.Account', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='budget_as_savings',
        help_text='Chase — debt payments and savings go here',
    )

    weekly_income = models.DecimalField(
        max_digits=10, decimal_places=2, default=1582.06,
        help_text='Standard weekly gross pay (full 5-day week)',
    )

    created_from_conversation = models.ForeignKey(
        'ai_agent.Conversation', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='budgets',
    )

    notes = models.TextField(blank=True, default='')
    drafted_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'budgets'
        ordering = ['-drafted_at']

    def __str__(self):
        return f'{self.name} [{self.status}]'


class BudgetCategoryLimit(models.Model):
    budget = models.ForeignKey(Budget, on_delete=models.CASCADE, related_name='category_limits')
    category_name = models.CharField(max_length=100)
    weekly_limit = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text='null = no cap (need-basis spending)',
    )
    notes = models.CharField(max_length=200, blank=True, default='')

    class Meta:
        db_table = 'budget_category_limits'
        unique_together = ('budget', 'category_name')
        ordering = ['category_name']

    def __str__(self):
        limit = f'${self.weekly_limit}/wk' if self.weekly_limit is not None else 'no cap'
        return f'{self.category_name}: {limit}'


class BudgetDebtTarget(models.Model):
    budget = models.ForeignKey(Budget, on_delete=models.CASCADE, related_name='debt_targets')
    loan = models.ForeignKey('loans.Loan', on_delete=models.CASCADE, related_name='budget_targets')
    priority = models.PositiveSmallIntegerField(help_text='1 = highest priority')
    monthly_minimum = models.DecimalField(max_digits=10, decimal_places=2)
    default_monthly_target = models.DecimalField(
        max_digits=10, decimal_places=2,
        help_text='Default payment target when no month override exists',
    )

    class Meta:
        db_table = 'budget_debt_targets'
        unique_together = ('budget', 'loan')
        ordering = ['priority']

    def __str__(self):
        return f'Priority {self.priority}: {self.loan.name}'


class BudgetDebtMonthOverride(models.Model):
    OVERRIDE_TYPES = [
        ('minimum_only', 'Minimum payment only'),
        ('exact', 'Pay exactly this amount'),
        ('extra', 'Extra on top of default target'),
        ('skip', 'Skip this month'),
    ]

    budget = models.ForeignKey(Budget, on_delete=models.CASCADE, related_name='debt_overrides')
    loan = models.ForeignKey('loans.Loan', on_delete=models.CASCADE, related_name='budget_overrides')
    month = models.DateField(help_text='First day of the month this override applies to')
    override_type = models.CharField(max_length=15, choices=OVERRIDE_TYPES)
    amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    notes = models.CharField(max_length=300, blank=True, default='')

    class Meta:
        db_table = 'budget_debt_month_overrides'
        unique_together = ('budget', 'loan', 'month')

    def __str__(self):
        return f'{self.loan.name} — {self.month.strftime("%b %Y")}: {self.override_type}'


class BudgetWeekPlan(models.Model):
    STATUS_CHOICES = [('draft', 'Draft'), ('active', 'Active')]

    budget = models.ForeignKey(Budget, on_delete=models.CASCADE, related_name='week_plans')
    week_start = models.DateField(help_text='Monday of this week')
    week_end = models.DateField(help_text='Sunday of this week')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')

    income_expected = models.DecimalField(max_digits=10, decimal_places=2)
    income_actual = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    transfer_to_savings = models.DecimalField(
        max_digits=10, decimal_places=2,
        help_text='Move this to Chase (covers debt payments + any savings)',
    )
    spending_budget = models.DecimalField(
        max_digits=10, decimal_places=2,
        help_text='Stays in Wells Fargo for living expenses this week',
    )

    # [{loan_id, loan_name, amount, priority, note}]
    debt_payments = models.JSONField(default=list)

    notes = models.TextField(blank=True, default='')
    created_from_message = models.ForeignKey(
        'ai_agent.Message', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='week_plans',
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'budget_week_plans'
        unique_together = ('budget', 'week_start')
        ordering = ['week_start']

    def __str__(self):
        return f'Week of {self.week_start} [{self.status}]'


# ── Optimizer ──────────────────────────────────────────────────────────────────

class OptimizerConfig(models.Model):
    STRATEGY_CHOICES = [
        ('avalanche', 'Avalanche — highest APR first (min interest)'),
        ('snowball',  'Snowball — smallest balance first (fastest wins)'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='optimizer_configs')
    name = models.CharField(max_length=200, default='My Optimizer')
    weekly_income = models.DecimalField(max_digits=10, decimal_places=2, default=1582.06)
    income_variance_pct = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        help_text='Expected % income reduction for short weeks (e.g. 20 for holiday weeks)',
    )
    savings_target_pct = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        help_text='Minimum % of monthly income to always save before extra debt payments',
    )
    strategy = models.CharField(max_length=10, choices=STRATEGY_CHOICES, default='avalanche')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'optimizer_configs'
        ordering = ['-updated_at']

    def __str__(self):
        return f'{self.name} ({self.strategy})'


class OptimizerCategoryParam(models.Model):
    config = models.ForeignKey(OptimizerConfig, on_delete=models.CASCADE, related_name='category_params')
    category_name = models.CharField(max_length=100)
    floor_monthly = models.DecimalField(
        max_digits=10, decimal_places=2,
        help_text='Minimum you must spend per month — hard constraint',
    )
    ceiling_monthly = models.DecimalField(
        max_digits=10, decimal_places=2,
        help_text='Maximum you allow yourself to spend — soft ceiling',
    )
    is_fixed = models.BooleanField(
        default=False,
        help_text='True = floor equals ceiling (e.g. insurance, subscriptions)',
    )

    class Meta:
        db_table = 'optimizer_category_params'
        unique_together = ('config', 'category_name')
        ordering = ['-floor_monthly']

    def __str__(self):
        return f'{self.category_name}: ${self.floor_monthly}–${self.ceiling_monthly}/mo'


class OptimizerLoanParam(models.Model):
    STRATEGY_CHOICES = [
        ('attack',       'Attack — pay as much as possible (avalanche/snowball target)'),
        ('minimum_only', 'Minimum only — just the required payment'),
        ('exact',        'Exact amount — pay this specific amount each month'),
        ('skip',         'Skip — do not include in plan'),
    ]

    config = models.ForeignKey(OptimizerConfig, on_delete=models.CASCADE, related_name='loan_params')
    loan = models.ForeignKey('loans.Loan', on_delete=models.CASCADE, related_name='optimizer_params')
    strategy = models.CharField(max_length=15, choices=STRATEGY_CHOICES, default='attack')
    exact_monthly_override = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text='Required when strategy=exact',
    )

    class Meta:
        db_table = 'optimizer_loan_params'
        unique_together = ('config', 'loan')

    def __str__(self):
        return f'{self.loan.name}: {self.strategy}'
