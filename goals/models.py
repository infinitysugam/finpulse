from decimal import Decimal

from django.conf import settings
from django.db import models


class FinancialGoal(models.Model):
    GOAL_TYPES = [
        ('fire', 'Financial Independence / Retire Early'),
        ('emergency_fund', 'Emergency Fund'),
        ('debt_free', 'Debt Free'),
        ('savings', 'Savings Goal'),
        ('investment', 'Investment Target'),
        ('income', 'Passive Income Target'),
        ('custom', 'Custom'),
    ]

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('paused', 'Paused'),
        ('abandoned', 'Abandoned'),
    ]

    PRIORITY_CHOICES = [
        (1, 'Critical'),
        (2, 'High'),
        (3, 'Medium'),
        (4, 'Low'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='financial_goals',
    )
    goal_type = models.CharField(max_length=20, choices=GOAL_TYPES)
    name = models.CharField(max_length=255)

    # Numeric target (None for FIRE — computed from annual_expenses instead)
    target_amount = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)
    target_date = models.DateField(null=True, blank=True)
    current_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)

    # FIRE-specific
    annual_expenses = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True,
        help_text='Annual living expenses used to compute the FIRE number',
    )
    withdrawal_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=4,
        help_text='Safe withdrawal rate %, default 4.00',
    )
    fire_number = models.DecimalField(
        max_digits=16, decimal_places=2, null=True, blank=True,
        help_text='Auto-computed: annual_expenses / (withdrawal_rate / 100)',
    )

    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='active')
    priority = models.PositiveSmallIntegerField(choices=PRIORITY_CHOICES, default=3)

    # Optional links to specific accounts / portfolios
    linked_account = models.ForeignKey(
        'accounts.Account', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='goals',
    )
    linked_portfolio = models.ForeignKey(
        'investments.Portfolio', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='goals',
    )

    # AI-generated context written by agents
    ai_notes = models.TextField(
        blank=True, default='',
        help_text='AI-generated insights and recommendations for this goal',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'financial_goals'
        ordering = ['priority', '-created_at']
        indexes = [
            models.Index(fields=['user', 'status'], name='goal_user_status_idx'),
            models.Index(fields=['user', 'goal_type'], name='goal_user_type_idx'),
        ]

    def __str__(self):
        return f'{self.name} ({self.get_goal_type_display()}) — {self.user.username}'

    def save(self, *args, **kwargs):
        if self.goal_type == 'fire' and self.annual_expenses and self.withdrawal_rate:
            self.fire_number = self.annual_expenses / (self.withdrawal_rate / Decimal('100'))
        super().save(*args, **kwargs)

    @property
    def effective_target(self):
        return self.fire_number if self.goal_type == 'fire' else self.target_amount

    @property
    def progress_pct(self):
        target = self.effective_target
        if not target or target == 0:
            return 0
        return max(0, min(100, float(self.current_amount / target * 100)))

    @property
    def amount_remaining(self):
        target = self.effective_target
        if not target:
            return None
        return max(Decimal('0'), target - self.current_amount)
