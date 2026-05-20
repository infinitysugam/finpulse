from rest_framework import serializers
from .models import Portfolio, Holding, WealthProjection


class HoldingSerializer(serializers.ModelSerializer):
    current_value = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    cost_basis = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    unrealized_gain_loss = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    unrealized_gain_loss_pct = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)

    class Meta:
        model = Holding
        fields = [
            'id', 'asset_type', 'symbol', 'name',
            'quantity', 'average_cost_basis', 'current_price', 'price_last_updated',
            'current_value', 'cost_basis', 'unrealized_gain_loss', 'unrealized_gain_loss_pct',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'current_price', 'price_last_updated', 'created_at', 'updated_at']


class PortfolioSerializer(serializers.ModelSerializer):
    holdings = HoldingSerializer(many=True, read_only=True)
    total_value = serializers.SerializerMethodField()
    total_gain_loss = serializers.SerializerMethodField()

    class Meta:
        model = Portfolio
        fields = ['id', 'name', 'description', 'holdings', 'total_value', 'total_gain_loss', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_total_value(self, obj):
        return sum(h.current_value for h in obj.holdings.all())

    def get_total_gain_loss(self, obj):
        return sum(h.unrealized_gain_loss for h in obj.holdings.all())

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


class WealthProjectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WealthProjection
        fields = [
            'id', 'label',
            'current_age', 'retirement_age',
            'initial_investment', 'monthly_contribution', 'annual_return_rate',
            'target_wealth',
            'projection_data', 'years_to_goal', 'projected_final_value',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'projection_data', 'years_to_goal',
            'projected_final_value', 'created_at', 'updated_at',
        ]

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        instance = super().create(validated_data)
        # Compute projection immediately on create
        from .services import compute_wealth_projection
        compute_wealth_projection(instance)
        return instance
