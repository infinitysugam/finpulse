from rest_framework import serializers
from .models import Category, Transaction, CSVImportLog


class CategorySerializer(serializers.ModelSerializer):
    transactions_count = serializers.IntegerField(read_only=True)
    total_spent = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )

    class Meta:
        model = Category
        fields = [
            'id', 'name', 'category_type', 'icon', 'color',
            'monthly_budget', 'is_system',
            'transactions_count', 'total_spent',
        ]
        read_only_fields = ['id', 'is_system']

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


class TransactionAccountSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    account_type = serializers.CharField()
    institution = serializers.CharField()


class TransactionLoanSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    loan_type = serializers.CharField()
    current_balance = serializers.DecimalField(max_digits=16, decimal_places=2)


class TransactionPortfolioSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class TransactionSerializer(serializers.ModelSerializer):
    category_name    = serializers.CharField(source='category.name',   read_only=True)
    category_color   = serializers.CharField(source='category.color',  read_only=True)
    account_info     = TransactionAccountSerializer(source='account',    read_only=True)
    to_account_info  = TransactionAccountSerializer(source='to_account', read_only=True)
    loan_info        = TransactionLoanSerializer(source='loan',          read_only=True)
    portfolio_info   = TransactionPortfolioSerializer(source='portfolio', read_only=True)
    account_id       = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    to_account_id    = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    loan_id          = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    portfolio_id     = serializers.IntegerField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = Transaction
        fields = [
            'id', 'title', 'amount', 'transaction_type', 'date',
            'category', 'category_name', 'category_color',
            'account',    'account_id',    'account_info',
            'to_account', 'to_account_id', 'to_account_info',
            'loan',       'loan_id',       'loan_info',
            'portfolio',  'portfolio_id',  'portfolio_info',
            'notes', 'source', 'merchant', 'location',
            'ai_category_suggestion', 'ai_confidence_score', 'is_ai_categorized',
            'is_recurring', 'recurrence_rule',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'account', 'to_account', 'loan', 'portfolio',
            'ai_category_suggestion', 'ai_confidence_score',
            'is_ai_categorized', 'created_at', 'updated_at',
        ]

    def _check_account(self, value):
        if value is None:
            return value
        from accounts.models import Account
        if not Account.objects.filter(id=value, user=self.context['request'].user).exists():
            raise serializers.ValidationError('Account not found.')
        return value

    def validate_account_id(self, value):
        return self._check_account(value)

    def validate_to_account_id(self, value):
        return self._check_account(value)

    def validate_loan_id(self, value):
        if value is None:
            return value
        from loans.models import Loan
        if not Loan.objects.filter(id=value, user=self.context['request'].user).exists():
            raise serializers.ValidationError('Loan not found.')
        return value

    def validate_portfolio_id(self, value):
        if value is None:
            return value
        from investments.models import Portfolio
        if not Portfolio.objects.filter(id=value, user=self.context['request'].user).exists():
            raise serializers.ValidationError('Portfolio not found.')
        return value

    def _pop_fks(self, validated_data):
        return (
            validated_data.pop('account_id',    None),
            validated_data.pop('to_account_id', None),
            validated_data.pop('loan_id',       None),
            validated_data.pop('portfolio_id',  None),
        )

    def create(self, validated_data):
        account_id, to_account_id, loan_id, portfolio_id = self._pop_fks(validated_data)
        validated_data['user'] = self.context['request'].user
        if account_id    is not None: validated_data['account_id']    = account_id
        if to_account_id is not None: validated_data['to_account_id'] = to_account_id
        if loan_id       is not None: validated_data['loan_id']       = loan_id
        if portfolio_id  is not None: validated_data['portfolio_id']  = portfolio_id
        return super().create(validated_data)

    def update(self, instance, validated_data):
        account_id, to_account_id, loan_id, portfolio_id = self._pop_fks(validated_data)
        if account_id    is not None: validated_data['account_id']    = account_id
        if to_account_id is not None: validated_data['to_account_id'] = to_account_id
        if loan_id       is not None: validated_data['loan_id']       = loan_id
        if portfolio_id  is not None: validated_data['portfolio_id']  = portfolio_id
        return super().update(instance, validated_data)


class CSVImportLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = CSVImportLog
        fields = [
            'id', 'file_name', 'file_size_bytes', 'status',
            'rows_total', 'rows_imported', 'rows_failed',
            'error_log', 'created_at', 'completed_at',
        ]
        read_only_fields = ['__all__']


class CSVUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    date_format = serializers.CharField(default='%Y-%m-%d', required=False)
