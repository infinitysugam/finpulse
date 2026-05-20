from django.db import models
from django.conf import settings


class Portfolio(models.Model):
    """A named collection of holdings (e.g. 'Retirement', 'Crypto', 'Taxable')."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='portfolios',
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'portfolios'
        unique_together = ('user', 'name')

    def __str__(self):
        return f'{self.name} ({self.user.username})'


class Holding(models.Model):
    """A single asset position inside a portfolio."""

    ASSET_TYPES = [
        ('stock', 'Stock'),
        ('etf', 'ETF'),
        ('mutual_fund', 'Mutual Fund'),
        ('crypto', 'Cryptocurrency'),
        ('bond', 'Bond'),
        ('real_estate', 'Real Estate'),
        ('cash', 'Cash / Money Market'),
        ('commodity', 'Commodity'),
        ('other', 'Other'),
    ]

    portfolio = models.ForeignKey(
        Portfolio,
        on_delete=models.CASCADE,
        related_name='holdings',
    )
    asset_type = models.CharField(max_length=20, choices=ASSET_TYPES)
    symbol = models.CharField(
        max_length=20, blank=True, default='',
        help_text='Ticker or crypto symbol, e.g. AAPL or BTC'
    )
    name = models.CharField(max_length=255, help_text='Human-readable asset name')

    # Position
    quantity = models.DecimalField(max_digits=20, decimal_places=8)
    average_cost_basis = models.DecimalField(
        max_digits=16, decimal_places=6,
        help_text='Average purchase price per unit'
    )
    current_price = models.DecimalField(
        max_digits=16, decimal_places=6, default=0,
        help_text='Last fetched market price — updated by price-sync task'
    )
    price_last_updated = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'holdings'
        ordering = ['asset_type', 'symbol']

    def __str__(self):
        return f'{self.symbol or self.name} × {self.quantity}'

    @property
    def current_value(self):
        return self.quantity * self.current_price

    @property
    def cost_basis(self):
        return self.quantity * self.average_cost_basis

    @property
    def unrealized_gain_loss(self):
        return self.current_value - self.cost_basis

    @property
    def unrealized_gain_loss_pct(self):
        if self.cost_basis == 0:
            return 0
        return (self.unrealized_gain_loss / self.cost_basis) * 100


class WealthProjection(models.Model):
    """
    Saved compound-interest scenario from the Millionaire Calculator.
    Storing snapshots lets the user compare different contribution strategies.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='wealth_projections',
    )
    label = models.CharField(max_length=100, default='My Projection')
    current_age = models.PositiveSmallIntegerField()
    retirement_age = models.PositiveSmallIntegerField(default=65)
    initial_investment = models.DecimalField(max_digits=14, decimal_places=2)
    monthly_contribution = models.DecimalField(max_digits=12, decimal_places=2)
    annual_return_rate = models.DecimalField(
        max_digits=5, decimal_places=2,
        help_text='Expected annual return %'
    )
    target_wealth = models.DecimalField(max_digits=16, decimal_places=2, default=1_000_000)
    # Computed result cache (JSON list of {year, age, balance})
    projection_data = models.JSONField(default=list, blank=True)
    years_to_goal = models.PositiveSmallIntegerField(null=True, blank=True)
    projected_final_value = models.DecimalField(
        max_digits=18, decimal_places=2, null=True, blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'wealth_projections'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.label} — {self.user.username}'
