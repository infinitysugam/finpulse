import csv
import io
from decimal import Decimal
from datetime import datetime, date

from django.db.models import Sum, Count, Q
from django.db.models.functions import TruncDay, TruncWeek, TruncMonth
from dateutil.relativedelta import relativedelta
from rest_framework import generics, status, filters
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Account
from loans.models import Loan
from investments.models import Portfolio, Holding
from .models import Category, Transaction, CSVImportLog
from .serializers import (
    CategorySerializer, TransactionSerializer,
    CSVImportLogSerializer, CSVUploadSerializer,
)


# ─── Balance helpers ──────────────────────────────────────────────────────────

def _save_account(account, delta_on_balance):
    """Apply a signed delta to an account and sync its linked loan if it's a credit card.

    The loan receives the same delta (not an absolute overwrite) so that mixed
    usage patterns — expenses through the transaction system AND payments through
    LoanPaymentListCreateView — cannot cause the two balances to drift and then
    snap unexpectedly on the next transfer.
    """
    account.balance += delta_on_balance
    if account.account_type == 'credit_card':
        account.balance = max(Decimal('0'), account.balance)
    account.save(update_fields=['balance'])
    if account.account_type == 'credit_card' and hasattr(account, 'loan') and account.loan is not None:
        account.loan.current_balance = max(
            Decimal('0'),
            account.loan.current_balance + delta_on_balance,
        )
        account.loan.status = 'paid_off' if account.loan.current_balance == 0 else 'active'
        account.loan.save(update_fields=['current_balance', 'status'])


def _adjust_account(account_id, tx_type, amount, reverse=False):
    """Handle income/expense on a single account.

    Credit cards are inverted: expense → debt increases, income → debt decreases.
    Transfers are handled separately by _adjust_transfer.
    """
    try:
        account = Account.objects.select_related('loan').get(pk=account_id)
    except Account.DoesNotExist:
        return
    delta = Decimal(str(amount)) * (-1 if reverse else 1)

    if account.account_type == 'credit_card':
        # expense = spending on card = debt up; income = payment = debt down
        signed = delta if tx_type == 'expense' else -delta if tx_type == 'income' else Decimal('0')
    else:
        signed = delta if tx_type == 'income' else -delta if tx_type == 'expense' else Decimal('0')

    if signed != 0:
        _save_account(account, signed)


def _adjust_transfer(from_account_id, to_account_id, amount, reverse=False):
    """Handle a transfer between two accounts.

    Money leaves the source (from_account) and arrives at the destination (to_account).
    If the destination is a credit card the incoming money reduces the debt.
    If the source is a credit card the outgoing money increases the debt (balance transfer scenario).
    """
    delta = Decimal(str(amount)) * (-1 if reverse else 1)

    if from_account_id:
        try:
            src = Account.objects.select_related('loan').get(pk=from_account_id)
            # Money leaving source
            signed = delta if src.account_type == 'credit_card' else -delta
            _save_account(src, signed)
        except Account.DoesNotExist:
            pass

    if to_account_id:
        try:
            dst = Account.objects.select_related('loan').get(pk=to_account_id)
            # Money arriving at destination
            signed = -delta if dst.account_type == 'credit_card' else delta
            _save_account(dst, signed)
        except Account.DoesNotExist:
            pass


def _adjust_loan(loan_id, amount, reverse=False):
    """Adjust a loan's balance and flip status when fully paid."""
    try:
        loan = Loan.objects.get(pk=loan_id)
    except Loan.DoesNotExist:
        return
    delta = Decimal(str(amount))
    if reverse:
        loan.current_balance += delta
        if loan.status == 'paid_off' and loan.current_balance > 0:
            loan.status = 'active'
    else:
        loan.current_balance = max(Decimal('0'), loan.current_balance - delta)
        if loan.current_balance == 0:
            loan.status = 'paid_off'
    loan.save(update_fields=['current_balance', 'status'])


def _adjust_portfolio_cash(portfolio_id, amount, reverse=False):
    """Add or remove cash from a portfolio's Cash holding (quantity += amount at price 1.0)."""
    try:
        portfolio = Portfolio.objects.get(pk=portfolio_id)
    except Portfolio.DoesNotExist:
        return
    delta = Decimal(str(amount)) * (-1 if reverse else 1)
    holding, _ = Holding.objects.get_or_create(
        portfolio=portfolio,
        asset_type='cash',
        symbol='CASH',
        defaults={
            'name': 'Cash',
            'quantity': Decimal('0'),
            'average_cost_basis': Decimal('1'),
            'current_price': Decimal('1'),
        },
    )
    holding.quantity = max(Decimal('0'), holding.quantity + delta)
    holding.current_price = Decimal('1')
    holding.average_cost_basis = Decimal('1')
    holding.save(update_fields=['quantity', 'current_price', 'average_cost_basis'])


class CategoryListCreateView(generics.ListCreateAPIView):
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Category.objects.filter(user=self.request.user)
            .annotate(
                transactions_count=Count('transactions'),
                total_spent=Sum(
                    'transactions__amount',
                    filter=Q(transactions__transaction_type='expense'),
                ),
            )
        )


class CategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Category.objects.filter(user=self.request.user)


class TransactionListCreateView(generics.ListCreateAPIView):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.OrderingFilter, filters.SearchFilter]
    search_fields = ['title', 'merchant', 'notes']
    ordering_fields = ['date', 'amount', 'created_at']
    ordering = ['-date']

    def get_queryset(self):
        qs = Transaction.objects.filter(user=self.request.user).select_related('category', 'account', 'to_account', 'loan')
        params = self.request.query_params
        if t := params.get('transaction_type'):
            qs = qs.filter(transaction_type=t)
        if cat := params.get('category'):
            qs = qs.filter(category_id=cat)
        if date_from := params.get('date_from'):
            qs = qs.filter(date__gte=date_from)
        if date_to := params.get('date_to'):
            qs = qs.filter(date__lte=date_to)
        if min_amount := params.get('min_amount'):
            qs = qs.filter(amount__gte=min_amount)
        if max_amount := params.get('max_amount'):
            qs = qs.filter(amount__lte=max_amount)
        if account := params.get('account'):
            qs = qs.filter(account_id=account)
        return qs

    def perform_create(self, serializer):
        tx = serializer.save()
        if tx.transaction_type == 'transfer':
            _adjust_transfer(tx.account_id, tx.to_account_id, tx.amount)
        elif tx.transaction_type == 'investment':
            if tx.account_id:
                _adjust_account(tx.account_id, 'expense', tx.amount)
            if tx.portfolio_id:
                _adjust_portfolio_cash(tx.portfolio_id, tx.amount)
        else:
            if tx.account_id:
                _adjust_account(tx.account_id, tx.transaction_type, tx.amount)
            if tx.loan_id:
                _adjust_loan(tx.loan_id, tx.amount)


class TransactionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Transaction.objects.filter(user=self.request.user).select_related('account', 'to_account', 'loan')

    def perform_update(self, serializer):
        old = serializer.instance
        old_type         = old.transaction_type
        old_amount       = old.amount
        old_account_id   = old.account_id
        old_to_id        = old.to_account_id
        old_loan_id      = old.loan_id
        old_portfolio_id = old.portfolio_id

        tx = serializer.save()

        # Reverse old effect
        if old_type == 'transfer':
            _adjust_transfer(old_account_id, old_to_id, old_amount, reverse=True)
        elif old_type == 'investment':
            if old_account_id:
                _adjust_account(old_account_id, 'expense', old_amount, reverse=True)
            if old_portfolio_id:
                _adjust_portfolio_cash(old_portfolio_id, old_amount, reverse=True)
        else:
            if old_account_id:
                _adjust_account(old_account_id, old_type, old_amount, reverse=True)
            if old_loan_id:
                _adjust_loan(old_loan_id, old_amount, reverse=True)

        # Apply new effect
        if tx.transaction_type == 'transfer':
            _adjust_transfer(tx.account_id, tx.to_account_id, tx.amount)
        elif tx.transaction_type == 'investment':
            if tx.account_id:
                _adjust_account(tx.account_id, 'expense', tx.amount)
            if tx.portfolio_id:
                _adjust_portfolio_cash(tx.portfolio_id, tx.amount)
        else:
            if tx.account_id:
                _adjust_account(tx.account_id, tx.transaction_type, tx.amount)
            if tx.loan_id:
                _adjust_loan(tx.loan_id, tx.amount)

    def perform_destroy(self, instance):
        tx_type      = instance.transaction_type
        account_id   = instance.account_id
        to_id        = instance.to_account_id
        loan_id      = instance.loan_id
        portfolio_id = instance.portfolio_id
        amount       = instance.amount
        instance.delete()
        if tx_type == 'transfer':
            _adjust_transfer(account_id, to_id, amount, reverse=True)
        elif tx_type == 'investment':
            if account_id:
                _adjust_account(account_id, 'expense', amount, reverse=True)
            if portfolio_id:
                _adjust_portfolio_cash(portfolio_id, amount, reverse=True)
        else:
            if account_id:
                _adjust_account(account_id, tx_type, amount, reverse=True)
            if loan_id:
                _adjust_loan(loan_id, amount, reverse=True)


class CategoryTrendsView(APIView):
    """
    GET /api/transactions/dashboard/category-trends/?range=3m|6m|1y
    Monthly expense totals broken down by category, recharts-ready.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        date_range = request.query_params.get('range', '6m')
        today = date.today()
        from_date = {
            '3m': today - relativedelta(months=3),
            '6m': today - relativedelta(months=6),
            '1y': today - relativedelta(years=1),
        }.get(date_range, today - relativedelta(months=6))

        rows = (
            Transaction.objects
            .filter(user=user, transaction_type='expense', date__gte=from_date)
            .annotate(month=TruncMonth('date'))
            .values('month', 'category__name', 'category__color')
            .annotate(total=Sum('amount'))
            .order_by('month', 'category__name')
        )

        categories_meta = {}  # name → color
        months_data = {}      # label → {month, cat: val}

        for row in rows:
            label = row['month'].strftime('%b %y')
            cat   = row['category__name'] or 'Uncategorized'
            color = row['category__color'] or '#6b7280'
            categories_meta.setdefault(cat, color)
            months_data.setdefault(label, {'month': label})
            months_data[label][cat] = float(row['total'])

        # Fill every calendar month in range so the chart has no gaps
        series = []
        cursor = from_date.replace(day=1)
        while cursor <= today:
            label = cursor.strftime('%b %y')
            point = months_data.get(label, {'month': label})
            for cat in categories_meta:
                point.setdefault(cat, 0)
            series.append(point)
            cursor += relativedelta(months=1)

        return Response({
            'series':     series,
            'categories': [{'name': k, 'color': v} for k, v in categories_meta.items()],
        })


class CashFlowView(APIView):
    """
    GET /api/transactions/dashboard/cashflow/?range=3m|6m|1y
    Proper monthly income vs expense split (not approximated from net-change).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        date_range = request.query_params.get('range', '6m')
        today = date.today()
        from_date = {
            '3m': today - relativedelta(months=3),
            '6m': today - relativedelta(months=6),
            '1y': today - relativedelta(years=1),
        }.get(date_range, today - relativedelta(months=6))

        rows = (
            Transaction.objects
            .filter(user=user, date__gte=from_date)
            .exclude(transaction_type='transfer')
            .annotate(month=TruncMonth('date'))
            .values('month')
            .annotate(
                income=Sum('amount', filter=Q(transaction_type='income')),
                expenses=Sum('amount', filter=Q(transaction_type='expense')),
            )
            .order_by('month')
        )
        by_month = {r['month'].strftime('%b %y'): r for r in rows}

        series = []
        cursor = from_date.replace(day=1)
        while cursor <= today:
            label = cursor.strftime('%b %y')
            r = by_month.get(label, {})
            income   = float(r.get('income')   or 0)
            expenses = float(r.get('expenses') or 0)
            savings_rate = round((income - expenses) / income * 100, 1) if income > 0 else 0
            series.append({'month': label, 'income': income, 'expenses': expenses, 'savings_rate': savings_rate})
            cursor += relativedelta(months=1)

        return Response({'series': series})


class NetWorthHistoryView(APIView):
    """
    GET /api/transactions/dashboard/networth-history/
    ?granularity=daily|weekly|monthly  (default: monthly)
    ?range=3m|6m|1y|2y|all            (default: 1y)

    Reconstructs net worth over time from transaction history.
    Anchors to today's known net worth (accounts − loans) and
    replays income/expense transactions forward from the earliest date.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from loans.models import LoanPayment
        from django.db.models import F

        user = request.user
        granularity = request.query_params.get('granularity', 'monthly')
        date_range  = request.query_params.get('range', '1y')

        trunc_fn = {'daily': TruncDay, 'weekly': TruncWeek, 'monthly': TruncMonth}.get(granularity, TruncMonth)

        # ── Anchor: today's net worth ────────────────────────────────────────
        asset_types = ('checking', 'savings', 'cash', 'other')
        total_assets = (
            Account.objects.filter(user=user, account_type__in=asset_types, is_active=True)
            .aggregate(t=Sum('balance'))['t'] or Decimal('0')
        )
        portfolio_value = Decimal(str(
            Holding.objects.filter(portfolio__user=user)
            .aggregate(t=Sum(F('quantity') * F('current_price')))['t'] or 0
        ))
        receivables = (
            Loan.objects.filter(user=user, status='active', loan_type='lent_to_friend')
            .aggregate(t=Sum('current_balance'))['t'] or Decimal('0')
        )
        total_debt = (
            Loan.objects.filter(user=user, status='active')
            .exclude(loan_type='lent_to_friend')
            .aggregate(t=Sum('current_balance'))['t'] or Decimal('0')
        )
        current_nw = total_assets + portfolio_value + receivables - total_debt

        # ── Loan principal offsets (all-time, for start_nw accuracy) ─────────
        # Paying a loan: cash ↓ AND debt ↓ equally → NW unchanged.
        # Only the interest portion is real wealth loss.  Add principal back.
        regular_principal_rows = (
            LoanPayment.objects
            .filter(loan__user=user)
            .exclude(loan__loan_type='lent_to_friend')
            .annotate(period=trunc_fn('payment_date'))
            .values('period')
            .annotate(total=Sum('principal_component'))
        )
        regular_principal = {r['period']: Decimal(str(r['total'] or 0)) for r in regular_principal_rows}

        # Receiving a friend's repayment: receivable ↓ AND cash ↑ equally → NW unchanged.
        # Only interest received is real wealth gain.  Subtract principal back.
        friend_principal_rows = (
            LoanPayment.objects
            .filter(loan__user=user, loan__loan_type='lent_to_friend')
            .annotate(period=trunc_fn('payment_date'))
            .values('period')
            .annotate(total=Sum('principal_component'))
        )
        friend_principal = {r['period']: Decimal(str(r['total'] or 0)) for r in friend_principal_rows}

        # Lending to a friend: cash ↓ AND receivable ↑ equally → NW unchanged.
        # Subtract back the disbursement expense (tagged source='loan_disbursement').
        disbursement_rows = (
            Transaction.objects
            .filter(user=user, source='loan_disbursement', transaction_type='expense')
            .annotate(period=trunc_fn('date'))
            .values('period')
            .annotate(total=Sum('amount'))
        )
        disbursements = {r['period']: Decimal(str(r['total'] or 0)) for r in disbursement_rows}

        # ── All non-transfer transactions grouped by period ──────────────────
        base_qs = Transaction.objects.filter(user=user).exclude(transaction_type='transfer')

        def _period_qs(qs):
            return (
                qs.annotate(period=trunc_fn('date'))
                  .values('period')
                  .annotate(
                      income=Sum('amount', filter=Q(transaction_type='income')),
                      expense=Sum('amount', filter=Q(transaction_type='expense')),
                  )
                  .order_by('period')
            )

        def _net(p):
            period = p['period']
            income  = Decimal(str(p['income']  or 0))
            expense = Decimal(str(p['expense'] or 0))
            # Add back principal paid on loans (not real wealth loss)
            income  -= friend_principal.get(period, Decimal('0'))
            expense -= regular_principal.get(period, Decimal('0'))
            expense -= disbursements.get(period, Decimal('0'))
            return income - expense

        # Starting net worth = current - sum of every transaction ever recorded
        all_periods = list(_period_qs(base_qs))
        total_net   = sum(_net(p) for p in all_periods)
        start_nw    = current_nw - total_net

        # ── Determine date window ────────────────────────────────────────────
        today = date.today()
        from_date = {
            '3m':  today - relativedelta(months=3),
            '6m':  today - relativedelta(months=6),
            '1y':  today - relativedelta(years=1),
            '2y':  today - relativedelta(years=2),
        }.get(date_range)

        # Net worth at the start of the visible window
        if from_date:
            pre = _period_qs(base_qs.filter(date__lt=from_date))
            window_start_nw = start_nw + sum(_net(p) for p in pre)
            series_qs = base_qs.filter(date__gte=from_date)
        else:
            window_start_nw = start_nw
            series_qs = base_qs

        # ── Build series ─────────────────────────────────────────────────────
        series = []
        running = window_start_nw
        for p in _period_qs(series_qs):
            net = _net(p)
            running += net
            series.append({
                'date':      p['period'].strftime('%Y-%m-%d'),
                'net_worth': float(running),
                'net_change': float(net),
            })

        # Ensure the last point is always today's actual net worth
        today_str = str(today)
        if series and series[-1]['date'] != today_str:
            series.append({'date': today_str, 'net_worth': float(current_nw), 'net_change': 0})
        elif not series:
            series.append({'date': today_str, 'net_worth': float(current_nw), 'net_change': 0})

        return Response({
            'granularity':       granularity,
            'range':             date_range,
            'current_net_worth': float(current_nw),
            'series':            series,
        })


class DashboardSummaryView(APIView):
    """Aggregated stats for the Unified Dashboard."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        params = request.query_params
        month = params.get('month')  # e.g. 2025-03

        # Default to current month so stat cards always show this month's totals
        today = date.today()
        if month:
            try:
                dt = datetime.strptime(month, '%Y-%m')
            except ValueError:
                dt = today
        else:
            dt = today

        qs = Transaction.objects.filter(
            user=user, date__year=dt.year, date__month=dt.month
        )

        income = qs.filter(transaction_type='income').aggregate(total=Sum('amount'))['total'] or 0
        expenses = qs.filter(transaction_type='expense').aggregate(total=Sum('amount'))['total'] or 0
        net_cash_flow = income - expenses

        # Per-category breakdown
        category_breakdown = (
            qs.filter(transaction_type='expense')
            .values('category__name', 'category__color', 'category__monthly_budget')
            .annotate(total=Sum('amount'))
            .order_by('-total')
        )

        # Net worth = liquid account balances + portfolio value + receivables − total loan debt
        asset_types = ('checking', 'savings', 'cash', 'other')
        total_assets = (
            Account.objects.filter(user=user, account_type__in=asset_types, is_active=True)
            .aggregate(total=Sum('balance'))['total'] or 0
        )
        from django.db.models import F
        portfolio_value = (
            Holding.objects.filter(portfolio__user=user)
            .aggregate(total=Sum(F('quantity') * F('current_price')))['total'] or 0
        )
        receivables = (
            Loan.objects.filter(user=user, status='active', loan_type='lent_to_friend')
            .aggregate(total=Sum('current_balance'))['total'] or 0
        )
        total_debt = (
            Loan.objects.filter(user=user, status='active')
            .exclude(loan_type='lent_to_friend')
            .aggregate(total=Sum('current_balance'))['total'] or 0
        )
        net_worth = total_assets + portfolio_value + receivables - total_debt

        return Response({
            'net_worth': net_worth,
            'total_assets': total_assets,
            'portfolio_value': portfolio_value,
            'total_debt': total_debt,
            'monthly_income': income,
            'monthly_expenses': expenses,
            'net_cash_flow': net_cash_flow,
            'millionaire_goal': user.millionaire_goal,
            'current_month': dt.strftime('%B %Y'),
            'category_breakdown': list(category_breakdown),
        })


class DebtHistoryView(APIView):
    """
    GET /api/transactions/dashboard/debt-history/?range=3m|6m|1y|2y
    Reconstructs total debt per month by anchoring to today's balances
    and replaying principal payments backwards.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from loans.models import LoanPayment

        user = request.user
        date_range = request.query_params.get('range', '1y')
        today = date.today()

        from_date = {
            '3m': today - relativedelta(months=3),
            '6m': today - relativedelta(months=6),
            '1y': today - relativedelta(years=1),
            '2y': today - relativedelta(years=2),
        }.get(date_range, today - relativedelta(years=1))

        # Anchor: today's total debt across all non-receivable loans
        current_debt = Decimal(str(
            Loan.objects.filter(user=user)
            .exclude(loan_type='lent_to_friend')
            .aggregate(t=Sum('current_balance'))['t'] or 0
        ))

        # Monthly principal paid (grouped by month)
        payment_rows = (
            LoanPayment.objects
            .filter(loan__user=user)
            .exclude(loan__loan_type='lent_to_friend')
            .annotate(month=TruncMonth('payment_date'))
            .values('month')
            .annotate(principal_paid=Sum('principal_component'))
            .order_by('month')
        )
        by_month = {
            p['month'].strftime('%Y-%m'): Decimal(str(p['principal_paid']))
            for p in payment_rows
        }

        # Starting debt at window start = current_debt + all principal paid inside window
        window_key = from_date.strftime('%Y-%m')
        paid_in_window = sum(v for k, v in by_month.items() if k >= window_key)
        window_start_debt = current_debt + paid_in_window

        # Walk forward month-by-month, subtracting principal paid each month
        series = []
        running = window_start_debt
        cursor = from_date.replace(day=1)
        while cursor <= today:
            key = cursor.strftime('%Y-%m')
            paid = by_month.get(key, Decimal('0'))
            running = max(Decimal('0'), running - paid)
            series.append({
                'date':       cursor.strftime('%Y-%m-%d'),
                'total_debt': float(running),
                'paid':       float(paid),
            })
            cursor += relativedelta(months=1)

        # Pin the last point to the real current balance
        if series:
            series[-1]['total_debt'] = float(current_debt)

        return Response({
            'range':        date_range,
            'current_debt': float(current_debt),
            'series':       series,
        })


class CategorySummaryView(APIView):
    """
    GET /api/transactions/dashboard/category-summary/
    ?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&type=expense|income|all

    Returns per-category totals for the selected date range and transaction type.
    Defaults to current month, expense only.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        today = date.today()

        raw_from = request.query_params.get('date_from')
        raw_to   = request.query_params.get('date_to')
        tx_type  = request.query_params.get('type', 'expense')  # expense | income | all

        try:
            date_from = datetime.strptime(raw_from, '%Y-%m-%d').date() if raw_from else today.replace(day=1)
        except ValueError:
            date_from = today.replace(day=1)

        try:
            date_to = datetime.strptime(raw_to, '%Y-%m-%d').date() if raw_to else today
        except ValueError:
            date_to = today

        qs = Transaction.objects.filter(user=user, date__gte=date_from, date__lte=date_to)
        if tx_type in ('expense', 'income'):
            qs = qs.filter(transaction_type=tx_type)
        else:
            qs = qs.exclude(transaction_type='transfer')

        rows = (
            qs.values('category__name', 'category__color', 'transaction_type')
            .annotate(total=Sum('amount'), count=Count('id'))
            .order_by('-total')
        )

        grand_total = sum(r['total'] for r in rows) or 1  # avoid div/0

        items = [
            {
                'name':  r['category__name'] or 'Uncategorized',
                'color': r['category__color'] or '#6b7280',
                'type':  r['transaction_type'],
                'total': float(r['total']),
                'count': r['count'],
                'pct':   round(float(r['total']) / float(grand_total) * 100, 1),
            }
            for r in rows
        ]

        return Response({
            'date_from': str(date_from),
            'date_to':   str(date_to),
            'type':      tx_type,
            'total':     float(grand_total) if grand_total != 1 else 0,
            'items':     items,
        })


class CSVUploadView(APIView):
    """Accept a CSV file and bulk-import transactions."""
    permission_classes = [IsAuthenticated]

    REQUIRED_COLUMNS = {'date', 'title', 'amount', 'transaction_type'}

    def post(self, request):
        serializer = CSVUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uploaded_file = serializer.validated_data['file']
        date_format = serializer.validated_data.get('date_format', '%Y-%m-%d')

        log = CSVImportLog.objects.create(
            user=request.user,
            file_name=uploaded_file.name,
            file_size_bytes=uploaded_file.size,
            status='processing',
        )

        try:
            decoded = uploaded_file.read().decode('utf-8-sig')
            reader = csv.DictReader(io.StringIO(decoded))
            headers = {h.strip().lower() for h in (reader.fieldnames or [])}

            if not self.REQUIRED_COLUMNS.issubset(headers):
                missing = self.REQUIRED_COLUMNS - headers
                log.status = 'failed'
                log.error_log = [f'Missing columns: {", ".join(missing)}']
                log.save()
                return Response({'detail': log.error_log[0]}, status=status.HTTP_400_BAD_REQUEST)

            transactions, errors = [], []
            for idx, row in enumerate(reader, start=2):
                try:
                    transactions.append(Transaction(
                        user=request.user,
                        title=row.get('title', '').strip(),
                        amount=row.get('amount', '0').strip(),
                        transaction_type=row.get('transaction_type', 'expense').strip().lower(),
                        date=datetime.strptime(row.get('date', '').strip(), date_format).date(),
                        merchant=row.get('merchant', '').strip(),
                        notes=row.get('notes', '').strip(),
                        source='csv_import',
                    ))
                except Exception as e:
                    errors.append(f'Row {idx}: {e}')

            Transaction.objects.bulk_create(transactions)

            log.status = 'completed'
            log.rows_total = idx if transactions or errors else 0
            log.rows_imported = len(transactions)
            log.rows_failed = len(errors)
            log.error_log = errors
            log.save()

        except Exception as e:
            log.status = 'failed'
            log.error_log = [str(e)]
            log.save()
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(CSVImportLogSerializer(log).data, status=status.HTTP_201_CREATED)
