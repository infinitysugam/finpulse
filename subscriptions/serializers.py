from rest_framework import serializers
from .models import Subscription


class SubscriptionAccountSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    account_type = serializers.CharField()
    institution = serializers.CharField()


class SubscriptionSerializer(serializers.ModelSerializer):
    monthly_cost = serializers.FloatField(read_only=True)
    annual_cost  = serializers.FloatField(read_only=True)
    account      = SubscriptionAccountSerializer(read_only=True)
    account_id   = serializers.IntegerField(write_only=True, required=False, allow_null=True)

    class Meta:
        model  = Subscription
        fields = [
            'id', 'name', 'category', 'amount', 'billing_cycle',
            'next_billing_date', 'start_date', 'status',
            'notes', 'website', 'color',
            'account', 'account_id',
            'monthly_cost', 'annual_cost',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_account_id(self, value):
        if value is None:
            return value
        from accounts.models import Account
        user = self.context['request'].user
        if not Account.objects.filter(id=value, user=user).exists():
            raise serializers.ValidationError('Account not found.')
        return value

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
