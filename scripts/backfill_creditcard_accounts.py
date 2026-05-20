"""
Backfill linked Account records for credit card Loans that were created
directly from the Loans page (which skipped Account creation).

Usage:
    python manage.py runscript backfill_creditcard_accounts

    -- or --

    python manage.py shell < scripts/backfill_creditcard_accounts.py
"""
import os
import sys
import django

# Allow running as a plain script from the project root
if __name__ == '__main__':
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    django.setup()

from decimal import Decimal
from loans.models import Loan
from accounts.models import Account
from django.contrib.auth import get_user_model

User = get_user_model()
fixed = 0

for user in User.objects.all():
    orphaned = Loan.objects.filter(
        user=user,
        loan_type='credit_card',
        account__isnull=True,
    )
    for loan in orphaned:
        account = Account.objects.create(
            user=user,
            name=loan.name,
            account_type='credit_card',
            institution=loan.lender or '',
            balance=loan.current_balance,
            credit_limit=loan.credit_limit,
            annual_interest_rate=loan.annual_interest_rate,
            monthly_payment=loan.monthly_payment or Decimal('0'),
        )
        loan.account = account
        loan.save(update_fields=['account'])
        print(f'  [{user.username}] Linked loan "{loan.name}" → Account #{account.id}')
        fixed += 1

if fixed:
    print(f'\nDone — {fixed} credit card(s) backfilled into Accounts.')
else:
    print('Nothing to fix — all credit card loans already have linked accounts.')
