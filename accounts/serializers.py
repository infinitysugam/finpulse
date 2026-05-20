from rest_framework import serializers
from .models import Account


class LinkedLoanSerializer(serializers.Serializer):
    """Minimal loan info embedded in an Account when a credit card loan is linked."""
    id = serializers.IntegerField()
    name = serializers.CharField()
    current_balance = serializers.DecimalField(max_digits=16, decimal_places=2)
    credit_limit = serializers.DecimalField(max_digits=16, decimal_places=2, allow_null=True)
    annual_interest_rate = serializers.DecimalField(max_digits=6, decimal_places=3)
    monthly_payment = serializers.DecimalField(max_digits=12, decimal_places=2)
    utilization_pct = serializers.SerializerMethodField()
    status = serializers.CharField()
    payment_due_day = serializers.IntegerField(allow_null=True)

    def get_utilization_pct(self, obj):
        if obj.credit_limit and obj.current_balance is not None:
            return round(float(obj.current_balance) / float(obj.credit_limit) * 100, 1)
        return None


class AccountSerializer(serializers.ModelSerializer):
    loan = LinkedLoanSerializer(read_only=True)
    utilization_pct = serializers.SerializerMethodField()

    class Meta:
        model = Account
        fields = [
            'id', 'name', 'account_type', 'institution',
            'balance', 'credit_limit', 'annual_interest_rate', 'monthly_payment',
            'is_active', 'notes',
            'loan',
            'utilization_pct',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_utilization_pct(self, obj):
        if hasattr(obj, 'loan') and obj.loan is not None:
            loan = obj.loan
            if loan.credit_limit:
                return round(float(loan.current_balance) / float(loan.credit_limit) * 100, 1)
        if obj.account_type == 'credit_card' and obj.credit_limit and float(obj.credit_limit) > 0:
            return round(float(obj.balance) / float(obj.credit_limit) * 100, 1)
        return None

    def validate(self, attrs):
        account_type = attrs.get('account_type', getattr(self.instance, 'account_type', ''))
        if account_type == 'credit_card':
            if not attrs.get('credit_limit') and not getattr(self.instance, 'credit_limit', None):
                raise serializers.ValidationError(
                    {'credit_limit': 'Credit limit is required for credit card accounts.'}
                )
        return attrs

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        account = super().create(validated_data)
        if account.account_type == 'credit_card':
            self._sync_loan(account)
        return account

    def update(self, instance, validated_data):
        account = super().update(instance, validated_data)
        if account.account_type == 'credit_card':
            self._sync_loan(account)
        return account

    def _sync_loan(self, account):
        """Create or update the linked Loan record for a credit card account."""
        from loans.models import Loan

        loan_fields = dict(
            name=account.name,
            loan_type='credit_card',
            lender=account.institution or '',
            current_balance=account.balance,
            credit_limit=account.credit_limit,
            annual_interest_rate=account.annual_interest_rate or 0,
            monthly_payment=account.monthly_payment or 0,
            status='active',
        )

        if hasattr(account, 'loan') and account.loan is not None:
            # Update existing linked loan
            for k, v in loan_fields.items():
                setattr(account.loan, k, v)
            account.loan.save(update_fields=list(loan_fields.keys()))
        else:
            # Create a new loan and link it
            loan = Loan.objects.create(user=account.user, account=account, **loan_fields)
            # account.loan is now set via the reverse OneToOne
