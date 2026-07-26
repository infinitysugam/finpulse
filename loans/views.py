from decimal import Decimal
from datetime import date, datetime

from django.db import transaction as db_transaction
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Account
from transactions.models import Transaction
from .models import Loan, LoanPayment


def _sync_account_balance(loan):
    """Keep the linked credit-card Account.balance in step with Loan.current_balance."""
    if loan.loan_type == 'credit_card' and loan.account_id:
        Account.objects.filter(pk=loan.account_id).update(balance=loan.current_balance)
from .serializers import (
    LoanSerializer, LoanPaymentSerializer,
    AmortizationRowSerializer, WhatIfSimulatorSerializer,
)
from .services import build_amortization_table, what_if_analysis
from . import math_engine as me


class LoanListCreateView(generics.ListCreateAPIView):
    serializer_class = LoanSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Loan.objects.filter(user=self.request.user).select_related('account').prefetch_related('payments')

    def perform_create(self, serializer):
        loan = serializer.save()

        # Credit card loans created from the Loans page need a linked Account
        # so they appear in the Accounts section and the transaction form.
        if loan.loan_type == 'credit_card' and loan.account_id is None:
            account = Account.objects.create(
                user=self.request.user,
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

        # For lent_to_friend loans, debit the source account if provided
        source_account_id = self.request.data.get('source_account_id')
        if loan.loan_type == 'lent_to_friend' and source_account_id:
            try:
                account = Account.objects.get(pk=source_account_id, user=self.request.user)
                amount = loan.current_balance
                with db_transaction.atomic():
                    account.balance = max(Decimal('0'), account.balance - amount)
                    account.save(update_fields=['balance'])
                    Transaction.objects.create(
                        user=self.request.user,
                        account=account,
                        transaction_type='expense',
                        title=f'Lent to {loan.name}',
                        amount=amount,
                        date=loan.start_date or date.today(),
                        notes=loan.notes or '',
                        source='loan_disbursement',
                    )
            except Account.DoesNotExist:
                pass


class LoanDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = LoanSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Loan.objects.filter(user=self.request.user)

    def perform_update(self, serializer):
        instance = self.get_object()
        new_status = serializer.validated_data.get('status', instance.status)
        # When marking a loan as paid_off, zero out the balance automatically
        if new_status == 'paid_off' and instance.status != 'paid_off':
            serializer.save(current_balance=Decimal('0'))
        else:
            serializer.save()


class LendMoreView(APIView):
    """Add more money to an existing lent_to_friend loan, optionally debiting an account."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            loan = Loan.objects.get(pk=pk, user=request.user, loan_type='lent_to_friend')
        except Loan.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        amount = Decimal(str(request.data.get('amount', 0)))
        if amount <= 0:
            return Response({'detail': 'Amount must be positive.'}, status=status.HTTP_400_BAD_REQUEST)

        account_id = request.data.get('account_id')

        with db_transaction.atomic():
            loan.principal = loan.principal + amount
            loan.current_balance = loan.current_balance + amount
            loan.save(update_fields=['principal', 'current_balance'])

            if account_id:
                try:
                    account = Account.objects.get(pk=account_id, user=request.user)
                    account.balance = max(Decimal('0'), account.balance - amount)
                    account.save(update_fields=['balance'])
                    Transaction.objects.create(
                        user=request.user,
                        account=account,
                        transaction_type='expense',
                        title=f'Lent more to {loan.name}',
                        amount=amount,
                        date=date.today(),
                        source='loan_disbursement',
                    )
                except Account.DoesNotExist:
                    pass

        return Response({
            'principal': str(loan.principal),
            'current_balance': str(loan.current_balance),
        })


class LoanPaymentListCreateView(generics.ListCreateAPIView):
    serializer_class = LoanPaymentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return LoanPayment.objects.filter(loan__user=self.request.user, loan_id=self.kwargs['loan_pk'])

    def perform_create(self, serializer):
        loan = Loan.objects.get(pk=self.kwargs['loan_pk'], user=self.request.user)
        payment = serializer.save(loan=loan)
        # Update loan's current balance
        loan.current_balance = max(Decimal('0'), loan.current_balance - payment.principal_component)
        if loan.current_balance == 0:
            loan.status = 'paid_off'
        loan.save()
        _sync_account_balance(loan)


class LoanPaymentDetailView(APIView):
    """DELETE /api/loans/<loan_pk>/payments/<pk>/ — reverse a recorded payment."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, loan_pk, pk):
        try:
            payment = LoanPayment.objects.select_related('loan').get(
                pk=pk, loan_id=loan_pk, loan__user=request.user
            )
        except LoanPayment.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        loan = payment.loan
        with db_transaction.atomic():
            loan.current_balance = min(
                loan.principal or payment.balance_after + payment.principal_component,
                loan.current_balance + payment.principal_component,
            )
            if loan.status == 'paid_off' and loan.current_balance > 0:
                loan.status = 'active'
            loan.save(update_fields=['current_balance', 'status'])
            _sync_account_balance(loan)
            payment.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class AmortizationTableView(APIView):
    """GET /api/loans/<pk>/amortization/ — returns the full schedule."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        loan = Loan.objects.filter(pk=pk, user=request.user).first()
        if not loan:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        table = build_amortization_table(
            principal=loan.principal,
            annual_rate=loan.annual_interest_rate,
            term_months=loan.term_months,
            monthly_payment=loan.monthly_payment,
            start_date=loan.start_date,
            extra_monthly=loan.extra_monthly_payment,
        )
        return Response(AmortizationRowSerializer(table, many=True).data)


class WhatIfSimulatorView(APIView):
    """POST /api/loans/<pk>/what-if/ — simulate extra monthly payment savings."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        loan = Loan.objects.filter(pk=pk, user=request.user).first()
        if not loan:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = WhatIfSimulatorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        extra = serializer.validated_data['extra_monthly_payment']

        result = what_if_analysis(
            principal=loan.current_balance,
            annual_rate=loan.annual_interest_rate,
            term_months=loan.term_months,
            monthly_payment=loan.monthly_payment,
            start_date=loan.next_payment_date or loan.start_date,
            extra_monthly=extra,
        )
        return Response(result)


class MathEngineView(APIView):
    """
    GET /api/loans/<pk>/math-engine/?method=FIXED_MONTHLY
    Full math-engine report: aggregators + amortisation schedule.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        loan = Loan.objects.filter(pk=pk, user=request.user).prefetch_related('payments').first()
        if not loan:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        method = request.query_params.get('method', 'FIXED_MONTHLY')
        if method not in ('FIXED_MONTHLY', 'TRUE_DAILY'):
            method = 'FIXED_MONTHLY'

        balance = loan.current_balance
        annual_rate = loan.annual_interest_rate / 100
        principal = loan.principal or balance
        term = loan.term_months or 360
        monthly_payment = loan.monthly_payment or me.calc_monthly_payment(principal, annual_rate, term)
        start = loan.start_date or loan.next_payment_date or date.today()

        # Anchor schedule dates to the user-defined payment due day
        if loan.payment_due_day:
            import calendar
            max_day = calendar.monthrange(start.year, start.month)[1]
            start = start.replace(day=min(loan.payment_due_day, max_day))

        payments = list(loan.payments.all())

        # Aggregators
        interest_paid = me.total_interest_paid(payments)
        payoff = me.current_payoff_amount(balance, annual_rate, method, start)
        eff_apr = me.effective_apr(principal, start, payments) if len(payments) >= 2 else None

        # Projected schedule from current balance
        schedule = me.build_schedule(
            principal=balance,
            annual_rate=annual_rate,
            term_months=term,
            monthly_payment=monthly_payment,
            start_date=start,
            method=method,
        )

        # Computed monthly payment if not set
        computed_payment = me.calc_monthly_payment(principal, annual_rate, term)

        return Response({
            'loan': {
                'id': loan.id,
                'name': loan.name,
                'loan_type': loan.loan_type,
                'principal': str(principal),
                'current_balance': str(balance),
                'annual_rate_pct': str(loan.annual_interest_rate),
                'term_months': term,
                'monthly_payment': str(monthly_payment),
                'computed_payment': str(computed_payment),
                'start_date': str(start),
            },
            'method': method,
            'aggregators': {
                'total_interest_paid': str(interest_paid),
                'current_payoff': {k: str(v) if isinstance(v, Decimal) else v for k, v in payoff.items()},
                'effective_apr': str(eff_apr) if eff_apr is not None else None,
                'payments_made': len(payments),
            },
            'schedule': [
                {k: str(v) if isinstance(v, Decimal) else v for k, v in row.items()}
                for row in schedule
            ],
        })


class MathEngineSimulateView(APIView):
    """
    POST /api/loans/<pk>/math-engine/simulate/
    Body: {method, lump_sum, lump_sum_date, recurring_extra}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        loan = Loan.objects.filter(pk=pk, user=request.user).first()
        if not loan:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        method = data.get('method', 'FIXED_MONTHLY')
        if method not in ('FIXED_MONTHLY', 'TRUE_DAILY'):
            method = 'FIXED_MONTHLY'

        annual_rate = loan.annual_interest_rate / 100
        balance = loan.current_balance
        principal = loan.principal or balance
        term = loan.term_months or 360
        monthly_payment = loan.monthly_payment or me.calc_monthly_payment(principal, annual_rate, term)
        start = loan.start_date or date.today()

        # Anchor schedule dates to the user-defined payment due day
        if loan.payment_due_day:
            import calendar
            max_day = calendar.monthrange(start.year, start.month)[1]
            start = start.replace(day=min(loan.payment_due_day, max_day))

        lump_sum = Decimal(str(data.get('lump_sum') or 0))
        recurring_extra = Decimal(str(data.get('recurring_extra') or 0))

        raw_lump_date = data.get('lump_sum_date')
        if raw_lump_date:
            from datetime import datetime as dt
            lump_sum_date = dt.strptime(raw_lump_date[:10], '%Y-%m-%d').date()
        else:
            lump_sum_date = None

        result = me.what_if_simulation(
            balance=balance,
            annual_rate=annual_rate,
            term_months=term,
            monthly_payment=monthly_payment,
            start_date=start,
            method=method,
            lump_sum=lump_sum,
            recurring_extra=recurring_extra,
            lump_sum_date=lump_sum_date,
        )

        # Serialise Decimal fields
        def _serial(obj):
            if isinstance(obj, Decimal):
                return str(obj)
            if isinstance(obj, dict):
                return {k: _serial(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [_serial(i) for i in obj]
            return obj

        return Response(_serial(result))


class RecordPaymentView(APIView):
    """
    POST /api/loans/<pk>/record-payment/

    Body:
        amount          – total payment (required)
        payment_date    – ISO date string, defaults to today
        account_id      – if provided, debits this account and creates a Transaction
        notes           – optional string

    Accrual method (auto-selected by loan type, overridable):
        auto/personal/mortgage/student/business → TRUE_DAILY by default
        (days computed from last LoanPayment date, or loan.start_date if first payment)

    Atomically:
      1. Computes actual days since last payment
      2. Splits payment into principal + interest via TRUE_DAILY math engine
      3. Creates a LoanPayment record
      4. Reduces Loan.current_balance by principal_component
      5. Optionally debits account + creates expense Transaction
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        loan = Loan.objects.prefetch_related('payments').filter(pk=pk, user=request.user).first()
        if not loan:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        try:
            amount = Decimal(str(data['amount']))
        except (KeyError, Exception):
            return Response({'detail': 'amount is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if amount <= 0:
            return Response({'detail': 'amount must be positive.'}, status=status.HTTP_400_BAD_REQUEST)

        raw_date = data.get('payment_date')
        if raw_date:
            try:
                payment_date = datetime.strptime(str(raw_date)[:10], '%Y-%m-%d').date()
            except ValueError:
                return Response({'detail': 'Invalid payment_date format.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            payment_date = date.today()

        account_id = data.get('account_id')
        account = None
        if account_id:
            try:
                account = Account.objects.get(pk=account_id, user=request.user)
            except Account.DoesNotExist:
                return Response({'detail': 'Account not found.'}, status=status.HTTP_400_BAD_REQUEST)

        # Determine actual days since last payment (TRUE_DAILY accrual).
        # Use the latest payment that is strictly before payment_date so that
        # out-of-order (backdated) entries use the correct preceding anchor.
        last_payment = (
            loan.payments
            .filter(payment_date__lt=payment_date)
            .order_by('-payment_date')
            .first()
        )
        if last_payment:
            anchor_date = last_payment.payment_date
        elif loan.start_date:
            anchor_date = loan.start_date
        else:
            anchor_date = None

        if anchor_date and anchor_date < payment_date:
            days_since = max(1, (payment_date - anchor_date).days)
        else:
            days_since = 30  # first payment or anchor on/after payment date

        # Compute principal / interest split using TRUE_DAILY
        annual_rate = loan.annual_interest_rate / Decimal('100')
        split = me.payment_split(
            balance=loan.current_balance,
            annual_rate=annual_rate,
            payment=amount,
            method='TRUE_DAILY',
            days_since_last=days_since,
        )
        principal_component = split['principal']
        interest_component  = split['interest']
        balance_after       = split['new_balance']
        is_extra = amount > loan.monthly_payment if loan.monthly_payment else False

        with db_transaction.atomic():
            # 1. Create LoanPayment record
            LoanPayment.objects.create(
                loan=loan,
                payment_date=payment_date,
                amount=split['payment_applied'],
                principal_component=principal_component,
                interest_component=interest_component,
                balance_after=balance_after,
                is_extra_payment=is_extra,
                notes=data.get('notes', ''),
            )

            # 2. Update loan balance
            loan.current_balance = balance_after
            if loan.current_balance == 0:
                loan.status = 'paid_off'
            loan.save(update_fields=['current_balance', 'status'])
            _sync_account_balance(loan)

            # 3. Credit/debit account + create transaction
            if account:
                is_receivable = loan.loan_type == 'lent_to_friend'
                if is_receivable:
                    # Friend paying us back — credit the account
                    account.balance = account.balance + amount
                else:
                    # We are paying a loan — debit the account
                    account.balance = max(Decimal('0'), account.balance - amount)
                account.save(update_fields=['balance'])

                Transaction.objects.create(
                    user=request.user,
                    account=account,
                    transaction_type='income' if is_receivable else 'expense',
                    title=f'{loan.name} — {"repayment received" if is_receivable else "payment"}',
                    amount=amount,
                    date=payment_date,
                    notes=data.get('notes', ''),
                    source='loan_payment',
                )

        return Response({
            'principal':      str(principal_component),
            'interest':       str(interest_component),
            'amount_applied': str(split['payment_applied']),
            'balance_after':  str(balance_after),
            'days_used':      days_since,
            'loan_status':    loan.status,
        }, status=status.HTTP_201_CREATED)
