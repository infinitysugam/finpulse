from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ScreenRun',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('universe', models.CharField(
                    choices=[('stocks', 'S&P 100 Stocks'), ('crypto', 'Top 20 Crypto'), ('all', 'Stocks + Crypto'), ('watchlist', 'My Watchlist')],
                    default='all', max_length=20,
                )),
                ('preset', models.CharField(
                    choices=[('momentum', 'Momentum'), ('value', 'Value'), ('growth', 'Growth'), ('golden_cross', 'Golden Cross'), ('technical', 'Technical Only'), ('all_around', 'All-Around')],
                    default='all_around', max_length=20,
                )),
                ('results', models.JSONField(default=list)),
                ('ai_summary', models.TextField(blank=True, default='')),
                ('duration_s', models.FloatField(default=0)),
                ('total_screened', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='screen_runs',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'screen_runs',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='WatchlistTicker',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('symbol', models.CharField(max_length=20)),
                ('asset_type', models.CharField(
                    choices=[('stock', 'Stock'), ('crypto', 'Crypto')],
                    default='stock', max_length=10,
                )),
                ('notes', models.CharField(blank=True, default='', max_length=255)),
                ('added_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='watchlist_tickers',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'watchlist_tickers',
                'unique_together': {('user', 'symbol')},
            },
        ),
        migrations.AddIndex(
            model_name='screenrun',
            index=models.Index(fields=['user', 'created_at'], name='screenrun_user_dt_idx'),
        ),
    ]
