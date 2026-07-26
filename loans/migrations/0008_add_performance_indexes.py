from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('loans', '0007_add_lent_to_friend_type'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='loanpayment',
            index=models.Index(
                fields=['loan', 'payment_date'],
                name='loanpay_loan_date_idx',
            ),
        ),
    ]
