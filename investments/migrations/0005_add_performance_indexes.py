from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('investments', '0004_increase_price_decimal_places'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='holding',
            index=models.Index(
                fields=['portfolio', 'asset_type'],
                name='holding_portfolio_type_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='holding',
            index=models.Index(
                fields=['portfolio', 'symbol'],
                name='holding_portfolio_symbol_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='trade',
            index=models.Index(
                fields=['holding', 'date'],
                name='trade_holding_date_idx',
            ),
        ),
    ]
