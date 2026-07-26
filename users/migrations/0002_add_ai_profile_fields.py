from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='risk_tolerance',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('conservative', 'Conservative'),
                    ('moderate', 'Moderate'),
                    ('aggressive', 'Aggressive'),
                    ('very_aggressive', 'Very Aggressive'),
                ],
                default='moderate',
                help_text='Investment risk tolerance used by AI recommendations',
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='savings_rate_target',
            field=models.DecimalField(
                max_digits=5, decimal_places=2, null=True, blank=True,
                help_text='Target savings rate as % of income, e.g. 20.00 means 20%',
            ),
        ),
    ]
