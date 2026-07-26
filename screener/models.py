from django.conf import settings
from django.db import models


class ScreenRun(models.Model):
    UNIVERSE_CHOICES = [
        ('stocks',  'S&P 100 Stocks'),
        ('crypto',  'Top 20 Crypto'),
        ('all',     'Stocks + Crypto'),
        ('watchlist', 'My Watchlist'),
    ]
    PRESET_CHOICES = [
        ('momentum',     'Momentum'),
        ('value',        'Value'),
        ('growth',       'Growth'),
        ('golden_cross', 'Golden Cross'),
        ('technical',    'Technical Only'),
        ('all_around',   'All-Around'),
    ]

    user        = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='screen_runs')
    universe    = models.CharField(max_length=20, choices=UNIVERSE_CHOICES, default='all')
    preset      = models.CharField(max_length=20, choices=PRESET_CHOICES, default='all_around')
    results     = models.JSONField(default=list)
    ai_summary  = models.TextField(blank=True, default='')
    duration_s  = models.FloatField(default=0)
    total_screened = models.PositiveIntegerField(default=0)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'screen_runs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'created_at'], name='screenrun_user_dt_idx'),
        ]

    def __str__(self):
        return f'{self.get_universe_display()} / {self.get_preset_display()} — {self.created_at:%Y-%m-%d %H:%M}'


class WatchlistTicker(models.Model):
    ASSET_TYPES = [('stock', 'Stock'), ('crypto', 'Crypto')]

    user       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='watchlist_tickers')
    symbol     = models.CharField(max_length=20)
    asset_type = models.CharField(max_length=10, choices=ASSET_TYPES, default='stock')
    notes      = models.CharField(max_length=255, blank=True, default='')
    added_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'watchlist_tickers'
        unique_together = ('user', 'symbol')

    def __str__(self):
        return f'{self.symbol} ({self.asset_type})'
