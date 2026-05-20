from django.core.management.base import BaseCommand
from loans.models import Loan
from accounts.models import Account


class Command(BaseCommand):
    help = 'Create Account records for existing credit card loans that have no linked account.'

    def handle(self, *args, **options):
        loans = Loan.objects.filter(loan_type='credit_card', account__isnull=True).select_related('user')

        if not loans.exists():
            self.stdout.write('No unlinked credit card loans found.')
            return

        created = 0
        for loan in loans:
            account = Account.objects.create(
                user=loan.user,
                name=loan.name,
                account_type='credit_card',
                institution=loan.lender or '',
                balance=loan.current_balance,
                credit_limit=loan.credit_limit,
                annual_interest_rate=loan.annual_interest_rate,
                monthly_payment=loan.monthly_payment,
                notes=loan.notes or '',
            )
            loan.account = account
            loan.save(update_fields=['account'])
            created += 1
            self.stdout.write(f'  Created account "{account.name}" → linked to loan #{loan.id}')

        self.stdout.write(self.style.SUCCESS(f'\nDone. {created} account(s) created and linked.'))
