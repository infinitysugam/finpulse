import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('transactions', '0007_add_performance_indexes_and_ai_fields'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='MonthlySnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('year', models.PositiveSmallIntegerField()),
                ('month', models.PositiveSmallIntegerField()),
                ('total_income', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('total_expenses', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('net_savings', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('savings_rate', models.DecimalField(
                    decimal_places=3, default=0, max_digits=6,
                    help_text='Savings as % of income (0.0–100.0)',
                )),
                ('net_worth', models.DecimalField(
                    decimal_places=2, default=0, max_digits=16,
                    help_text='Net worth snapshot at end of month',
                )),
                ('category_breakdown', models.JSONField(
                    blank=True, default=dict,
                    help_text='Maps category_name → total_amount for expenses',
                )),
                ('top_income_sources', models.JSONField(
                    blank=True, default=list,
                    help_text='Top 5 income transactions for AI context',
                )),
                ('computed_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='monthly_snapshots',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'monthly_snapshots',
                'ordering': ['-year', '-month'],
            },
        ),
        migrations.AlterUniqueTogether(
            name='monthlysnapshot',
            unique_together={('user', 'year', 'month')},
        ),
        migrations.AddIndex(
            model_name='monthlysnapshot',
            index=models.Index(fields=['user', 'year', 'month'], name='snapshot_user_ym_idx'),
        ),
    ]
