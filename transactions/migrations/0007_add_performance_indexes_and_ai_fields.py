from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('transactions', '0006_add_investment_type_and_portfolio_fk'),
    ]

    operations = [
        migrations.AddField(
            model_name='transaction',
            name='tags',
            field=models.JSONField(default=list, blank=True),
        ),
        migrations.AddField(
            model_name='transaction',
            name='ai_categorization_accepted',
            field=models.BooleanField(
                null=True, blank=True,
                help_text='True=user accepted AI category, False=rejected, None=not reviewed',
            ),
        ),
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(
                fields=['user', 'date', 'transaction_type'],
                name='tx_user_date_type_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(
                fields=['user', 'account', 'date'],
                name='tx_user_acct_date_idx',
            ),
        ),
    ]
