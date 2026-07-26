from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Budget, BudgetWeekPlan, OptimizerConfig, OptimizerCategoryParam, OptimizerLoanParam
from .serializers import BudgetSerializer, BudgetWeekPlanSerializer


def _week_bounds(d: date):
    monday = d - timedelta(days=d.weekday())
    return monday, monday + timedelta(days=6)


def _month_week_starts(year: int, month: int):
    """Return all Mondays whose week overlaps the given month."""
    first = date(year, month, 1)
    last = date(year, month + 1, 1) - timedelta(days=1) if month < 12 else date(year, 12, 31)
    monday = first - timedelta(days=first.weekday())
    weeks = []
    while monday <= last:
        weeks.append(monday)
        monday += timedelta(days=7)
    return weeks


class BudgetView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        budget = (
            Budget.objects.filter(user=request.user, status='active')
            .prefetch_related('category_limits', 'debt_targets', 'debt_overrides', 'week_plans')
            .order_by('-approved_at')
            .first()
        )
        draft = (
            Budget.objects.filter(user=request.user, status='draft')
            .prefetch_related('category_limits', 'debt_targets', 'debt_overrides', 'week_plans')
            .order_by('-drafted_at')
            .first()
        )
        return Response({
            'active': BudgetSerializer(budget).data if budget else None,
            'draft': BudgetSerializer(draft).data if draft else None,
        })


class BudgetApproveView(APIView):
    """POST /api/budget/<id>/approve/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            draft = Budget.objects.prefetch_related(
                'category_limits', 'debt_targets', 'debt_overrides', 'week_plans'
            ).get(pk=pk, user=request.user, status='draft')
        except Budget.DoesNotExist:
            return Response({'detail': 'Draft budget not found.'}, status=status.HTTP_404_NOT_FOUND)

        Budget.objects.filter(user=request.user, status='active').update(status='draft')
        draft.status = 'active'
        draft.approved_at = timezone.now()
        draft.save(update_fields=['status', 'approved_at'])
        BudgetWeekPlan.objects.filter(budget=draft, status='draft').update(
            status='active', approved_at=timezone.now(),
        )
        return Response(BudgetSerializer(draft).data)


class BudgetDraftRejectView(APIView):
    """DELETE /api/budget/<id>/"""
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            draft = Budget.objects.get(pk=pk, user=request.user, status='draft')
        except Budget.DoesNotExist:
            return Response({'detail': 'Draft budget not found.'}, status=status.HTTP_404_NOT_FOUND)
        draft.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CurrentMonthView(APIView):
    """GET /api/budget/current-month/ — 4-week grid with actuals."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = date.today()
        budget = Budget.objects.filter(user=request.user, status='active').order_by('-approved_at').first()
        if not budget:
            return Response({'detail': 'No active budget.'}, status=status.HTTP_404_NOT_FOUND)

        week_starts = _month_week_starts(today.year, today.month)
        week_plans = {
            wp.week_start: wp
            for wp in BudgetWeekPlan.objects.filter(budget=budget, week_start__in=week_starts)
        }

        from transactions.models import Transaction

        weeks = []
        for ws in week_starts:
            we = ws + timedelta(days=6)
            plan = week_plans.get(ws)

            txns = (
                Transaction.objects.filter(user=request.user, transaction_type='expense', date__gte=ws, date__lte=we)
                .values('category__name').annotate(total=Sum('amount'))
            )
            actuals = {row['category__name'] or 'Uncategorized': float(row['total']) for row in txns}

            income_actual = float(
                Transaction.objects.filter(user=request.user, transaction_type='income', date__gte=ws, date__lte=we)
                .aggregate(t=Sum('amount'))['t'] or 0
            )

            weeks.append({
                'week_start': str(ws),
                'week_end': str(we),
                'is_current': ws <= today <= we,
                'is_past': we < today,
                'plan': BudgetWeekPlanSerializer(plan).data if plan else None,
                'actuals': {
                    'spending_by_category': actuals,
                    'total_spending': sum(actuals.values()),
                    'income': income_actual,
                },
            })

        month_start = date(today.year, today.month, 1)
        month_end = date(today.year, today.month + 1, 1) - timedelta(days=1) if today.month < 12 else date(today.year, 12, 31)
        month_spending = (
            Transaction.objects.filter(user=request.user, transaction_type='expense', date__gte=month_start, date__lte=month_end)
            .values('category__name').annotate(total=Sum('amount'))
        )
        month_actuals = {row['category__name'] or 'Uncategorized': float(row['total']) for row in month_spending}

        return Response({
            'month': today.strftime('%B %Y'),
            'weeks': weeks,
            'month_actuals': month_actuals,
            'category_limits': [
                {'category_name': cl.category_name, 'weekly_limit': float(cl.weekly_limit) if cl.weekly_limit else None}
                for cl in budget.category_limits.all()
            ],
        })


class IncomeTriggerView(APIView):
    """GET /api/budget/income-trigger/ — paycheck landing card."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = date.today()
        monday, sunday = _week_bounds(today)

        budget = Budget.objects.filter(user=request.user, status='active').order_by('-approved_at').first()
        if not budget:
            return Response({'trigger': False, 'reason': 'No active budget'})

        from transactions.models import Transaction
        income_this_week = float(
            Transaction.objects.filter(user=request.user, transaction_type='income', date__gte=monday, date__lte=sunday)
            .aggregate(t=Sum('amount'))['t'] or 0
        )

        if income_this_week == 0:
            return Response({'trigger': False, 'reason': 'No income recorded this week yet'})

        week_plan = BudgetWeekPlan.objects.filter(budget=budget, week_start=monday, status='active').first()

        if week_plan:
            transfer = float(week_plan.transfer_to_savings)
            spending = float(week_plan.spending_budget)
            debt_payments = week_plan.debt_payments
        else:
            weekly_spending = float(
                budget.category_limits.filter(weekly_limit__isnull=False)
                .aggregate(t=Sum('weekly_limit'))['t'] or 0
            )
            transfer = max(0.0, income_this_week - weekly_spending)
            spending = weekly_spending
            debt_payments = []

        days_left = (sunday - today).days + 1

        return Response({
            'trigger': True,
            'income_received': income_this_week,
            'transfer_to_savings': transfer,
            'spending_budget': spending,
            'debt_payments': debt_payments,
            'savings_account_name': budget.savings_account.name if budget.savings_account else 'Chase',
            'spending_account_name': budget.spending_account.name if budget.spending_account else 'Wells Fargo',
            'week_start': str(monday),
            'week_end': str(sunday),
            'days_left_in_week': days_left,
            'has_week_plan': week_plan is not None,
        })


class WeekPlanUpdateView(APIView):
    """PATCH /api/budget/week-plan/<id>/ — update income_actual for a specific week."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            plan = BudgetWeekPlan.objects.get(pk=pk, budget__user=request.user)
        except BudgetWeekPlan.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        income_actual = request.data.get('income_actual')
        if income_actual is not None:
            from decimal import Decimal
            plan.income_actual = Decimal(str(income_actual))

        # Optionally recalculate split if income changed
        if income_actual is not None and plan.income_expected:
            ratio = plan.income_actual / plan.income_expected
            plan.transfer_to_savings = (plan.transfer_to_savings * ratio).quantize(Decimal('0.01'))
            plan.spending_budget      = (plan.spending_budget * ratio).quantize(Decimal('0.01'))

        plan.save()
        return Response(BudgetWeekPlanSerializer(plan).data)


class WeekActualsView(APIView):
    """GET /api/budget/week/<week_start>/ — category vs actual for one week."""
    permission_classes = [IsAuthenticated]

    def get(self, request, week_start):
        try:
            ws = date.fromisoformat(week_start)
        except ValueError:
            return Response({'detail': 'Invalid date.'}, status=status.HTTP_400_BAD_REQUEST)
        we = ws + timedelta(days=6)

        budget = Budget.objects.filter(user=request.user, status='active').order_by('-approved_at').first()
        if not budget:
            return Response({'detail': 'No active budget.'}, status=status.HTTP_404_NOT_FOUND)

        plan = BudgetWeekPlan.objects.filter(budget=budget, week_start=ws).first()

        from transactions.models import Transaction
        txns = (
            Transaction.objects.filter(user=request.user, transaction_type='expense', date__gte=ws, date__lte=we)
            .values('category__name').annotate(total=Sum('amount'))
        )
        actuals = {row['category__name'] or 'Uncategorized': float(row['total']) for row in txns}
        limits = {
            cl.category_name: float(cl.weekly_limit) if cl.weekly_limit else None
            for cl in budget.category_limits.all()
        }

        all_cats = sorted(set(list(limits.keys()) + list(actuals.keys())))
        rows = []
        for cat in all_cats:
            limit = limits.get(cat)
            actual = actuals.get(cat, 0.0)
            rows.append({
                'category': cat,
                'weekly_limit': limit,
                'actual': actual,
                'remaining': round(limit - actual, 2) if limit is not None else None,
                'over_budget': actual > limit if limit is not None else False,
            })

        return Response({
            'week_start': str(ws),
            'week_end': str(we),
            'plan': BudgetWeekPlanSerializer(plan).data if plan else None,
            'category_rows': rows,
            'total_actual': sum(actuals.values()),
            'total_budget': sum(v for v in limits.values() if v is not None),
        })


# ── Optimizer Views ────────────────────────────────────────────────────────────

class OptimizerDefaultsView(APIView):
    """
    GET /api/budget/optimizer/defaults/
    Returns suggested category floors/ceilings from last 3 months of transactions,
    plus all active loans pre-filled as 'attack'.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from transactions.models import Transaction
        from loans.models import Loan
        from django.db.models import Avg

        today = date.today()
        three_months_ago = date(today.year, today.month, 1) - timedelta(days=90)

        # Average monthly spending per category over last 3 months
        txns = (
            Transaction.objects.filter(
                user=request.user,
                transaction_type='expense',
                date__gte=three_months_ago,
            )
            .values('category__name')
            .annotate(total=Sum('amount'))
        )

        DEBT_KEYWORDS = ['debt payment', 'loan', 'transfer', 'investment']
        categories = []
        for row in txns:
            cat = row['category__name'] or 'Uncategorized'
            if any(k in cat.lower() for k in DEBT_KEYWORDS):
                continue
            monthly_avg = float(row['total']) / 3
            # Floor = 60% of average (minimum realistic spend)
            # Ceiling = 110% of average (max comfortable spend)
            categories.append({
                'category_name': cat,
                'floor_monthly': round(monthly_avg * 0.6, 2),
                'ceiling_monthly': round(monthly_avg * 1.1, 2),
                'avg_monthly': round(monthly_avg, 2),
                'is_fixed': False,
            })
        categories.sort(key=lambda c: -c['avg_monthly'])

        loans = Loan.objects.filter(user=request.user, status='active').order_by('annual_interest_rate').reverse()
        loan_params = []
        for loan in loans:
            loan_params.append({
                'loan_id': loan.pk,
                'loan_name': loan.name,
                'loan_type': loan.loan_type,
                'current_balance': float(loan.current_balance),
                'apr': float(loan.annual_interest_rate or 0),
                'monthly_minimum': float(loan.monthly_payment or 0),
                'strategy': 'attack',
                'exact_monthly_override': None,
            })

        return Response({
            'categories': categories,
            'loans': loan_params,
            'weekly_income': 1582.06,
            'savings_target_pct': 5.0,
            'strategy': 'avalanche',
        })


class OptimizerConfigView(APIView):
    """
    GET  /api/budget/optimizer/config/  — load saved config (or null)
    POST /api/budget/optimizer/config/  — save config
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        config = (
            OptimizerConfig.objects.filter(user=request.user)
            .prefetch_related('category_params', 'loan_params__loan')
            .order_by('-updated_at')
            .first()
        )
        if not config:
            return Response(None)
        return Response(self._serialize(config))

    def post(self, request):
        d = request.data
        config, _ = OptimizerConfig.objects.update_or_create(
            user=request.user,
            defaults={
                'name': d.get('name', 'My Optimizer'),
                'weekly_income': d.get('weekly_income', 1582.06),
                'income_variance_pct': d.get('income_variance_pct', 0),
                'savings_target_pct': d.get('savings_target_pct', 0),
                'strategy': d.get('strategy', 'avalanche'),
            },
        )

        # Replace category params
        config.category_params.all().delete()
        for cp in d.get('categories', []):
            OptimizerCategoryParam.objects.create(
                config=config,
                category_name=cp['category_name'],
                floor_monthly=cp['floor_monthly'],
                ceiling_monthly=cp['ceiling_monthly'],
                is_fixed=cp.get('is_fixed', False),
            )

        # Replace loan params
        config.loan_params.all().delete()
        from loans.models import Loan
        for lp in d.get('loans', []):
            try:
                loan = Loan.objects.get(pk=lp['loan_id'], user=request.user)
            except Loan.DoesNotExist:
                continue
            OptimizerLoanParam.objects.create(
                config=config,
                loan=loan,
                strategy=lp.get('strategy', 'attack'),
                exact_monthly_override=lp.get('exact_monthly_override') or None,
            )

        config.refresh_from_db()
        config = OptimizerConfig.objects.prefetch_related('category_params', 'loan_params__loan').get(pk=config.pk)
        return Response(self._serialize(config), status=status.HTTP_201_CREATED)

    @staticmethod
    def _serialize(config):
        return {
            'id': config.pk,
            'name': config.name,
            'weekly_income': float(config.weekly_income),
            'income_variance_pct': float(config.income_variance_pct),
            'savings_target_pct': float(config.savings_target_pct),
            'strategy': config.strategy,
            'categories': [
                {
                    'category_name': cp.category_name,
                    'floor_monthly': float(cp.floor_monthly),
                    'ceiling_monthly': float(cp.ceiling_monthly),
                    'is_fixed': cp.is_fixed,
                }
                for cp in config.category_params.all()
            ],
            'loans': [
                {
                    'loan_id': lp.loan.pk,
                    'loan_name': lp.loan.name,
                    'loan_type': lp.loan.loan_type,
                    'current_balance': float(lp.loan.current_balance),
                    'apr': float(lp.loan.annual_interest_rate or 0),
                    'monthly_minimum': float(lp.loan.monthly_payment or 0),
                    'strategy': lp.strategy,
                    'exact_monthly_override': float(lp.exact_monthly_override) if lp.exact_monthly_override else None,
                }
                for lp in config.loan_params.select_related('loan').all()
            ],
            'updated_at': config.updated_at.isoformat(),
        }


class RunOptimizerView(APIView):
    """POST /api/budget/optimizer/run/ — run optimizer with provided or saved config."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .optimizer import run_optimizer

        # Save config first (reuse OptimizerConfigView.post logic)
        save_view = OptimizerConfigView()
        save_view.request = request
        save_response = save_view.post(request)
        if save_response.status_code not in (200, 201):
            return save_response

        config = (
            OptimizerConfig.objects.prefetch_related('category_params', 'loan_params__loan')
            .get(user=request.user)
        )

        if not config.loan_params.exists():
            return Response({'detail': 'No loans configured.'}, status=status.HTTP_400_BAD_REQUEST)
        if not config.category_params.exists():
            return Response({'detail': 'No spending categories configured.'}, status=status.HTTP_400_BAD_REQUEST)

        result = run_optimizer(config)
        return Response(result)
