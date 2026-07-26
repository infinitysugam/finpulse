from rest_framework import serializers
from .models import FinancialGoal


class FinancialGoalSerializer(serializers.ModelSerializer):
    progress_pct = serializers.ReadOnlyField()
    amount_remaining = serializers.ReadOnlyField()
    effective_target = serializers.ReadOnlyField()

    class Meta:
        model = FinancialGoal
        fields = [
            'id', 'goal_type', 'name', 'target_amount', 'target_date',
            'current_amount', 'annual_expenses', 'withdrawal_rate', 'fire_number',
            'status', 'priority', 'linked_account', 'linked_portfolio',
            'ai_notes', 'created_at', 'updated_at',
            'progress_pct', 'amount_remaining', 'effective_target',
        ]
        read_only_fields = ['id', 'fire_number', 'created_at', 'updated_at']
