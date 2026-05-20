from rest_framework import serializers
from .models import Loan, LoanPayment


class LoanPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanPayment
        fields = [
            'id', 'payment_date', 'amount',
            'principal_component', 'interest_component',
            'balance_after', 'is_extra_payment', 'notes', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class LinkedAccountSerializer(serializers.Serializer):
    """Minimal account info embedded in a Loan response."""
    id = serializers.IntegerField()
    name = serializers.CharField()
    account_type = serializers.CharField()


class LoanSerializer(serializers.ModelSerializer):
    payments = LoanPaymentSerializer(many=True, read_only=True)
    interest_paid_to_date = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )
    total_paid_to_date = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )
    utilization_pct = serializers.SerializerMethodField()
    account = LinkedAccountSerializer(read_only=True)

    # Optional for friend/credit-card loans — defaults applied in validate()
    annual_interest_rate = serializers.DecimalField(
        max_digits=6, decimal_places=3, required=False, default=0
    )
    monthly_payment = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, default=0
    )

    class Meta:
        model = Loan
        fields = [
            'id', 'name', 'loan_type', 'lender', 'status',
            'principal', 'credit_limit', 'current_balance',
            'annual_interest_rate',
            'term_months', 'monthly_payment', 'extra_monthly_payment',
            'payment_due_day',
            'start_date', 'end_date', 'next_payment_date',
            'notes',
            'account',
            'interest_paid_to_date', 'total_paid_to_date',
            'utilization_pct', 'payments',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_utilization_pct(self, obj):
        if obj.loan_type == 'credit_card' and obj.credit_limit:
            return round(float(obj.current_balance) / float(obj.credit_limit) * 100, 1)
        return None

    def validate(self, attrs):
        loan_type = attrs.get('loan_type', getattr(self.instance, 'loan_type', ''))

        if loan_type == 'credit_card':
            if not attrs.get('credit_limit') and not getattr(self.instance, 'credit_limit', None):
                raise serializers.ValidationError({'credit_limit': 'Credit limit is required for credit cards.'})
            attrs.setdefault('principal', None)
            attrs.setdefault('term_months', None)
            attrs.setdefault('start_date', None)

        elif loan_type in ('friend', 'lent_to_friend'):
            # No interest, no term, no due date — zero out financial fields
            attrs.setdefault('annual_interest_rate', 0)
            attrs.setdefault('term_months', None)
            attrs.setdefault('start_date', None)
            attrs.setdefault('monthly_payment', 0)
            attrs.setdefault('credit_limit', None)
            attrs.setdefault('principal', attrs.get('current_balance', 0))

        else:
            if not attrs.get('principal') and not getattr(self.instance, 'principal', None):
                raise serializers.ValidationError({'principal': 'Principal is required for this loan type.'})
            if not attrs.get('term_months') and not getattr(self.instance, 'term_months', None):
                raise serializers.ValidationError({'term_months': 'Term is required for this loan type.'})

        return attrs

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


class AmortizationRowSerializer(serializers.Serializer):
    """Read-only schema for a single row in a generated amortization table."""
    month = serializers.IntegerField()
    payment_date = serializers.DateField()
    payment = serializers.DecimalField(max_digits=12, decimal_places=2)
    principal = serializers.DecimalField(max_digits=12, decimal_places=2)
    interest = serializers.DecimalField(max_digits=12, decimal_places=2)
    balance = serializers.DecimalField(max_digits=16, decimal_places=2)
    cumulative_interest = serializers.DecimalField(max_digits=16, decimal_places=2)


class WhatIfSimulatorSerializer(serializers.Serializer):
    """Input for the What-If extra-payment simulator."""
    extra_monthly_payment = serializers.DecimalField(max_digits=12, decimal_places=2)
