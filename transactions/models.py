from django.db import models
from django.conf import settings


class Category(models.Model):
    """User-defined or AI-suggested budget category."""

    CATEGORY_TYPES = [
        ('income', 'Income'),
        ('expense', 'Expense'),
        ('transfer', 'Transfer'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='categories',
    )
    name = models.CharField(max_length=100)
    category_type = models.CharField(max_length=10, choices=CATEGORY_TYPES)
    icon = models.CharField(max_length=50, blank=True, default='')
    color = models.CharField(max_length=7, default='#6366f1', help_text='Hex color code')
    monthly_budget = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text='Optional monthly spending cap for this category'
    )
    is_system = models.BooleanField(
        default=False,
        help_text='True for default categories created on user registration'
    )

    class Meta:
        db_table = 'categories'
        unique_together = ('user', 'name')
        verbose_name_plural = 'Categories'

    def __str__(self):
        return f'{self.name} ({self.user.username})'


class Transaction(models.Model):
    """
    A single financial event — income, expense, or transfer.
    Amounts are always stored as positive values; direction is encoded by
    transaction_type.
    """

    TRANSACTION_TYPES = [
        ('income', 'Income'),
        ('expense', 'Expense'),
        ('transfer', 'Transfer'),
        ('investment', 'Investment'),
    ]

    SOURCE_CHOICES = [
        ('manual', 'Manual Entry'),
        ('csv_import', 'CSV Import'),
        ('bank_sync', 'Bank Sync'),
        ('loan_disbursement', 'Loan Disbursement'),
        ('loan_payment', 'Loan Payment'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='transactions',
    )
    account = models.ForeignKey(
        'accounts.Account',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='transactions',
        help_text='Source account (or account for income/expense)',
    )
    to_account = models.ForeignKey(
        'accounts.Account',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='incoming_transfers',
        help_text='Destination account for transfers (e.g. credit card being paid)',
    )
    loan = models.ForeignKey(
        'loans.Loan',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='repayment_transactions',
        help_text='Friend loan being repaid by this transaction',
    )
    portfolio = models.ForeignKey(
        'investments.Portfolio',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='transactions',
        help_text='Portfolio receiving cash when transaction_type=investment',
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transactions',
    )

    # Core fields
    title = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    transaction_type = models.CharField(max_length=10, choices=TRANSACTION_TYPES)
    date = models.DateField()
    notes = models.TextField(blank=True, default='')

    # Metadata
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='manual')
    merchant = models.CharField(max_length=255, blank=True, default='')
    location = models.CharField(max_length=255, blank=True, default='')

    # AI categorization
    ai_category_suggestion = models.CharField(max_length=100, blank=True, default='')
    ai_confidence_score = models.DecimalField(
        max_digits=4, decimal_places=3, null=True, blank=True,
        help_text='0.0 – 1.0 confidence from AI categorizer'
    )
    is_ai_categorized = models.BooleanField(default=False)

    # Recurring transaction support
    is_recurring = models.BooleanField(default=False)
    recurrence_rule = models.CharField(
        max_length=50, blank=True, default='',
        help_text='iCal RRULE string, e.g. FREQ=MONTHLY'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # AI readiness fields
    tags = models.JSONField(default=list, blank=True)
    ai_categorization_accepted = models.BooleanField(
        null=True, blank=True,
        help_text='True=user accepted AI category, False=rejected, None=not reviewed',
    )

    class Meta:
        db_table = 'transactions'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['user', 'date']),
            models.Index(fields=['user', 'transaction_type']),
            models.Index(fields=['user', 'category']),
            models.Index(fields=['user', 'date', 'transaction_type'], name='tx_user_date_type_idx'),
            models.Index(fields=['user', 'account', 'date'], name='tx_user_acct_date_idx'),
        ]

    def __str__(self):
        return f'{self.title} — {self.amount} ({self.date})'


class MonthlySnapshot(models.Model):
    """Pre-computed monthly financial summary — used by AI agents for fast context retrieval."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='monthly_snapshots',
    )
    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField()

    total_income = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_expenses = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    net_savings = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    savings_rate = models.DecimalField(
        max_digits=6, decimal_places=3, default=0,
        help_text='Savings as % of income (0.0–100.0)',
    )
    net_worth = models.DecimalField(
        max_digits=16, decimal_places=2, default=0,
        help_text='Net worth snapshot at end of month',
    )
    category_breakdown = models.JSONField(
        default=dict, blank=True,
        help_text='Maps category_name → total_amount for expenses',
    )
    top_income_sources = models.JSONField(
        default=list, blank=True,
        help_text='Top 5 income transactions for AI context',
    )
    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'monthly_snapshots'
        ordering = ['-year', '-month']
        unique_together = ('user', 'year', 'month')
        indexes = [
            models.Index(fields=['user', 'year', 'month'], name='snapshot_user_ym_idx'),
        ]

    def __str__(self):
        return f'Snapshot {self.year}-{self.month:02d} ({self.user.username})'

    @classmethod
    def compute_for(cls, user, year, month):
        """Recompute and upsert the snapshot for a given user/month."""
        from django.db.models import Sum
        from decimal import Decimal

        txns = cls._default_manager.model._default_manager.none()  # placeholder
        # Use the sibling Transaction model directly
        txns = Transaction.objects.filter(user=user, date__year=year, date__month=month)

        total_income = txns.filter(transaction_type='income').aggregate(s=Sum('amount'))['s'] or Decimal('0')
        total_expenses = txns.filter(transaction_type='expense').aggregate(s=Sum('amount'))['s'] or Decimal('0')
        net_savings = total_income - total_expenses
        savings_rate = (net_savings / total_income * 100) if total_income > 0 else Decimal('0')

        category_breakdown = {}
        for tx in txns.filter(transaction_type='expense').select_related('category'):
            name = tx.category.name if tx.category else 'Uncategorized'
            category_breakdown[name] = round(float(category_breakdown.get(name, 0)) + float(tx.amount), 2)

        top_income = []
        for tx in txns.filter(transaction_type='income').order_by('-amount')[:5]:
            top_income.append({'title': tx.title, 'amount': float(tx.amount), 'date': str(tx.date)})

        snapshot, _ = cls.objects.update_or_create(
            user=user, year=year, month=month,
            defaults={
                'total_income': total_income,
                'total_expenses': total_expenses,
                'net_savings': net_savings,
                'savings_rate': savings_rate,
                'net_worth': user.net_worth,
                'category_breakdown': category_breakdown,
                'top_income_sources': top_income,
            },
        )
        return snapshot


class CSVImportLog(models.Model):
    """Tracks every CSV upload for audit and re-processing purposes."""

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='csv_imports',
    )
    file_name = models.CharField(max_length=255)
    file_size_bytes = models.PositiveIntegerField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    rows_total = models.PositiveIntegerField(default=0)
    rows_imported = models.PositiveIntegerField(default=0)
    rows_failed = models.PositiveIntegerField(default=0)
    error_log = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'csv_import_logs'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.file_name} ({self.status}) — {self.user.username}'
