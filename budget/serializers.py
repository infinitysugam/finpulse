from rest_framework import serializers
from .models import Budget, BudgetCategoryLimit, BudgetDebtTarget, BudgetDebtMonthOverride, BudgetWeekPlan


class BudgetCategoryLimitSerializer(serializers.ModelSerializer):
    class Meta:
        model = BudgetCategoryLimit
        fields = ['id', 'category_name', 'weekly_limit', 'notes']


class BudgetDebtTargetSerializer(serializers.ModelSerializer):
    loan_name = serializers.CharField(source='loan.name', read_only=True)
    loan_type = serializers.CharField(source='loan.loan_type', read_only=True)
    current_balance = serializers.DecimalField(source='loan.current_balance', max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = BudgetDebtTarget
        fields = ['id', 'loan', 'loan_name', 'loan_type', 'current_balance', 'priority', 'monthly_minimum', 'default_monthly_target']


class BudgetDebtMonthOverrideSerializer(serializers.ModelSerializer):
    loan_name = serializers.CharField(source='loan.name', read_only=True)

    class Meta:
        model = BudgetDebtMonthOverride
        fields = ['id', 'loan', 'loan_name', 'month', 'override_type', 'amount', 'notes']


class BudgetWeekPlanSerializer(serializers.ModelSerializer):
    is_current_week = serializers.SerializerMethodField()
    is_past = serializers.SerializerMethodField()

    class Meta:
        model = BudgetWeekPlan
        fields = [
            'id', 'week_start', 'week_end', 'status',
            'income_expected', 'income_actual',
            'transfer_to_savings', 'spending_budget',
            'debt_payments', 'notes',
            'approved_at', 'is_current_week', 'is_past',
        ]
        read_only_fields = ['id', 'approved_at']

    def get_is_current_week(self, obj):
        from datetime import date
        today = date.today()
        return obj.week_start <= today <= obj.week_end

    def get_is_past(self, obj):
        from datetime import date
        return obj.week_end < date.today()


class BudgetSerializer(serializers.ModelSerializer):
    category_limits = BudgetCategoryLimitSerializer(many=True, read_only=True)
    debt_targets = BudgetDebtTargetSerializer(many=True, read_only=True)
    debt_overrides = BudgetDebtMonthOverrideSerializer(many=True, read_only=True)
    week_plans = BudgetWeekPlanSerializer(many=True, read_only=True)
    spending_account_name = serializers.CharField(source='spending_account.name', read_only=True, default=None)
    savings_account_name = serializers.CharField(source='savings_account.name', read_only=True, default=None)

    class Meta:
        model = Budget
        fields = [
            'id', 'name', 'status', 'weekly_income',
            'spending_account', 'spending_account_name',
            'savings_account', 'savings_account_name',
            'notes', 'drafted_at', 'approved_at', 'updated_at',
            'category_limits', 'debt_targets', 'debt_overrides', 'week_plans',
        ]
        read_only_fields = ['id', 'drafted_at', 'approved_at', 'updated_at']
