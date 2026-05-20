from django.db import models
from django.conf import settings


class Loan(models.Model):
    """A single loan / debt instrument owned by a user."""

    LOAN_TYPES = [
        ('personal', 'Personal Loan'),
        ('mortgage', 'Mortgage'),
        ('auto', 'Auto Loan'),
        ('student', 'Student Loan'),
        ('credit_card', 'Credit Card'),
        ('business', 'Business Loan'),
        ('friend', 'Borrowed from Friend'),
        ('lent_to_friend', 'Lent to Friend'),
        ('other', 'Other'),
    ]

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('paid_off', 'Paid Off'),
        ('defaulted', 'Defaulted'),
        ('refinanced', 'Refinanced'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='loans',
    )

    # Identity
    name = models.CharField(max_length=255, help_text='E.g. "Chase Auto Loan"')
    loan_type = models.CharField(max_length=20, choices=LOAN_TYPES, default='personal')
    lender = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')

    # Core financial terms
    principal = models.DecimalField(
        max_digits=16, decimal_places=2, null=True, blank=True,
        help_text='Original loan amount (not applicable for credit cards)'
    )
    # Credit card specific
    credit_limit = models.DecimalField(
        max_digits=16, decimal_places=2, null=True, blank=True,
        help_text='Credit limit (credit cards only)'
    )
    current_balance = models.DecimalField(
        max_digits=16, decimal_places=2,
        help_text='Outstanding balance — updated as payments are recorded'
    )
    annual_interest_rate = models.DecimalField(
        max_digits=6, decimal_places=3,
        help_text='Annual interest rate / APR as a percentage, e.g. 24.990'
    )
    term_months = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Original loan duration in months (not applicable for credit cards)'
    )
    monthly_payment = models.DecimalField(
        max_digits=12, decimal_places=2,
        help_text='Scheduled minimum monthly payment'
    )

    # Dates
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(
        null=True, blank=True,
        help_text='Calculated or actual payoff date'
    )
    next_payment_date = models.DateField(null=True, blank=True)

    # Payment due day of month (1–31, optional)
    payment_due_day = models.PositiveSmallIntegerField(
        null=True, blank=True,
        help_text='Day of month payment is due, e.g. 2 means due on the 2nd'
    )

    # Extra payment tracking (for What-If simulator)
    extra_monthly_payment = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text='Additional amount paid each month beyond minimum'
    )

    # Link to a central Account record (credit card loans can be linked)
    account = models.OneToOneField(
        'accounts.Account',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='loan',
    )

    notes = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'loans'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} — {self.current_balance} remaining'

    @property
    def monthly_interest_rate(self):
        return self.annual_interest_rate / 100 / 12

    @property
    def interest_paid_to_date(self):
        return sum(p.interest_component for p in self.payments.all())

    @property
    def total_paid_to_date(self):
        return sum(p.amount for p in self.payments.all())


class LoanPayment(models.Model):
    """Records each payment made against a loan (for payment history & amortization)."""

    loan = models.ForeignKey(
        Loan,
        on_delete=models.CASCADE,
        related_name='payments',
    )
    payment_date = models.DateField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    principal_component = models.DecimalField(max_digits=12, decimal_places=2)
    interest_component = models.DecimalField(max_digits=12, decimal_places=2)
    balance_after = models.DecimalField(max_digits=16, decimal_places=2)
    is_extra_payment = models.BooleanField(default=False)
    notes = models.CharField(max_length=255, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'loan_payments'
        ordering = ['payment_date']

    def __str__(self):
        return f'Payment {self.amount} on {self.payment_date} → {self.loan.name}'
