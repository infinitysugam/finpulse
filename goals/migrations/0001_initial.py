import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('accounts', '0001_initial'),
        ('investments', '0005_add_performance_indexes'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='FinancialGoal',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('goal_type', models.CharField(
                    max_length=20,
                    choices=[
                        ('fire', 'Financial Independence / Retire Early'),
                        ('emergency_fund', 'Emergency Fund'),
                        ('debt_free', 'Debt Free'),
                        ('savings', 'Savings Goal'),
                        ('investment', 'Investment Target'),
                        ('income', 'Passive Income Target'),
                        ('custom', 'Custom'),
                    ],
                )),
                ('name', models.CharField(max_length=255)),
                ('target_amount', models.DecimalField(decimal_places=2, max_digits=16, null=True, blank=True)),
                ('target_date', models.DateField(null=True, blank=True)),
                ('current_amount', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('annual_expenses', models.DecimalField(
                    decimal_places=2, max_digits=14, null=True, blank=True,
                    help_text='Annual living expenses used to compute the FIRE number',
                )),
                ('withdrawal_rate', models.DecimalField(
                    decimal_places=2, default=4, max_digits=5,
                    help_text='Safe withdrawal rate %, default 4.00',
                )),
                ('fire_number', models.DecimalField(
                    decimal_places=2, max_digits=16, null=True, blank=True,
                    help_text='Auto-computed: annual_expenses / (withdrawal_rate / 100)',
                )),
                ('status', models.CharField(
                    max_length=15, default='active',
                    choices=[
                        ('active', 'Active'),
                        ('completed', 'Completed'),
                        ('paused', 'Paused'),
                        ('abandoned', 'Abandoned'),
                    ],
                )),
                ('priority', models.PositiveSmallIntegerField(
                    default=3,
                    choices=[(1, 'Critical'), (2, 'High'), (3, 'Medium'), (4, 'Low')],
                )),
                ('ai_notes', models.TextField(
                    blank=True, default='',
                    help_text='AI-generated insights and recommendations for this goal',
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='financial_goals',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('linked_account', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='goals',
                    to='accounts.account',
                )),
                ('linked_portfolio', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='goals',
                    to='investments.portfolio',
                )),
            ],
            options={
                'db_table': 'financial_goals',
                'ordering': ['priority', '-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='financialgoal',
            index=models.Index(fields=['user', 'status'], name='goal_user_status_idx'),
        ),
        migrations.AddIndex(
            model_name='financialgoal',
            index=models.Index(fields=['user', 'goal_type'], name='goal_user_type_idx'),
        ),
    ]
