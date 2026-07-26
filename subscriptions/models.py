from django.db import models
from django.conf import settings


class Subscription(models.Model):
    BILLING_CYCLES = [
        ('weekly',      'Weekly'),
        ('monthly',     'Monthly'),
        ('quarterly',   'Quarterly'),
        ('semi_annual', 'Semi-Annual'),
        ('yearly',      'Yearly'),
    ]

    CATEGORIES = [
        ('streaming',  'Streaming'),
        ('music',      'Music'),
        ('gaming',     'Gaming'),
        ('software',   'Software / SaaS'),
        ('phone',      'Phone / Mobile'),
        ('insurance',  'Insurance'),
        ('utilities',  'Utilities'),
        ('fitness',    'Fitness / Gym'),
        ('news',       'News / Media'),
        ('education',  'Education'),
        ('food',       'Food / Delivery'),
        ('other',      'Other'),
    ]

    STATUS_CHOICES = [
        ('active',    'Active'),
        ('paused',    'Paused'),
        ('cancelled', 'Cancelled'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='subscriptions',
    )
    account = models.ForeignKey(
        'accounts.Account',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='subscriptions',
        help_text='Account this subscription is charged to',
    )

    name            = models.CharField(max_length=255)
    category        = models.CharField(max_length=20, choices=CATEGORIES, default='other')
    amount          = models.DecimalField(max_digits=10, decimal_places=2)
    billing_cycle   = models.CharField(max_length=15, choices=BILLING_CYCLES, default='monthly')
    next_billing_date = models.DateField(null=True, blank=True)
    start_date      = models.DateField(null=True, blank=True)
    status          = models.CharField(max_length=10, choices=STATUS_CHOICES, default='active')
    notes           = models.TextField(blank=True, default='')
    website         = models.URLField(blank=True, default='')
    # Color for the card (auto-assigned by category on frontend, overridable)
    color           = models.CharField(max_length=7, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'subscriptions'
        ordering = ['category', 'name']
        indexes = [
            models.Index(fields=['user', 'status'], name='sub_user_status_idx'),
            models.Index(fields=['user', 'next_billing_date'], name='sub_user_billing_idx'),
        ]

    def __str__(self):
        return f'{self.name} ({self.billing_cycle})'

    # Normalised monthly cost regardless of billing cycle
    CYCLE_TO_MONTHS = {
        'weekly':      52 / 12,
        'monthly':     1,
        'quarterly':   1 / 3,
        'semi_annual': 1 / 6,
        'yearly':      1 / 12,
    }

    @property
    def monthly_cost(self):
        factor = self.CYCLE_TO_MONTHS.get(self.billing_cycle, 1)
        return float(self.amount) * factor

    @property
    def annual_cost(self):
        return self.monthly_cost * 12
