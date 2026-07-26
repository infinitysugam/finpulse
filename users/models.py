from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Extended user model.  Sensitive balance/income values are DecimalFields;
    the encryption utility (utils/encryption.py) handles at-rest encryption
    via AES-256 before writing to the DB in production.
    """

    CURRENCY_CHOICES = [
        ('USD', 'US Dollar'),
        ('EUR', 'Euro'),
        ('GBP', 'British Pound'),
        ('INR', 'Indian Rupee'),
    ]

    # Profile
    date_of_birth = models.DateField(null=True, blank=True)
    profile_picture = models.ImageField(
        upload_to='profile_pics/', null=True, blank=True
    )
    currency = models.CharField(
        max_length=3, choices=CURRENCY_CHOICES, default='USD'
    )

    # Financial snapshot (recomputed by background tasks / signal handlers)
    monthly_income = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        help_text='Primary take-home income per month'
    )
    net_worth = models.DecimalField(
        max_digits=16, decimal_places=2, default=0,
        help_text='Assets minus liabilities — updated on save of related models'
    )

    # AI agent profile
    RISK_TOLERANCE_CHOICES = [
        ('conservative', 'Conservative'),
        ('moderate', 'Moderate'),
        ('aggressive', 'Aggressive'),
        ('very_aggressive', 'Very Aggressive'),
    ]
    risk_tolerance = models.CharField(
        max_length=20, choices=RISK_TOLERANCE_CHOICES, default='moderate',
        help_text='Investment risk tolerance used by AI recommendations',
    )
    savings_rate_target = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text='Target savings rate as % of income, e.g. 20.00 means 20%',
    )

    # Millionaire goal / wealth planner settings
    millionaire_goal = models.DecimalField(
        max_digits=16, decimal_places=2, default=1_000_000
    )
    expected_annual_return = models.DecimalField(
        max_digits=5, decimal_places=2, default=7.00,
        help_text='Annual % return assumed for compound-interest projections'
    )
    monthly_investment_contribution = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'users'
        verbose_name = 'User'

    def __str__(self):
        return f'{self.username} ({self.email})'
