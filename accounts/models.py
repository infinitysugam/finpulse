from django.db import models
from django.conf import settings


class Account(models.Model):
    ACCOUNT_TYPES = [
        ('checking', 'Checking'),
        ('savings', 'Savings'),
        ('credit_card', 'Credit Card'),
        ('cash', 'Cash'),
        ('other', 'Other'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='accounts',
    )

    name = models.CharField(max_length=255, help_text='E.g. "Chase Checking"')
    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPES)
    institution = models.CharField(max_length=255, blank=True, default='')

    # Balance — manually managed for checking/savings/cash;
    # for credit_card accounts linked to a Loan, the Loan's current_balance is authoritative.
    balance = models.DecimalField(max_digits=16, decimal_places=2, default=0)

    # Credit card only
    credit_limit = models.DecimalField(
        max_digits=16, decimal_places=2, null=True, blank=True,
        help_text='Credit limit (credit card accounts only)'
    )
    annual_interest_rate = models.DecimalField(
        max_digits=6, decimal_places=3, null=True, blank=True,
        help_text='APR as a percentage, e.g. 24.990 (credit cards only)'
    )
    monthly_payment = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text='Minimum monthly payment (credit cards only)'
    )

    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'accounts'
        ordering = ['account_type', 'name']

    def __str__(self):
        return f'{self.name} ({self.get_account_type_display()})'
