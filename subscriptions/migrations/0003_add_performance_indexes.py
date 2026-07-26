from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0002_add_account_fk'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='subscription',
            index=models.Index(
                fields=['user', 'status'],
                name='sub_user_status_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='subscription',
            index=models.Index(
                fields=['user', 'next_billing_date'],
                name='sub_user_billing_idx',
            ),
        ),
    ]
