from django.contrib import admin
from .models import Portfolio, Holding, WealthProjection


class HoldingInline(admin.TabularInline):
    model = Holding
    extra = 0
    readonly_fields = ['current_price', 'price_last_updated', 'created_at', 'updated_at']


@admin.register(Portfolio)
class PortfolioAdmin(admin.ModelAdmin):
    list_display = ['name', 'user', 'created_at']
    search_fields = ['name', 'user__username']
    inlines = [HoldingInline]


@admin.register(Holding)
class HoldingAdmin(admin.ModelAdmin):
    list_display = ['symbol', 'name', 'asset_type', 'quantity', 'current_price', 'portfolio']
    list_filter = ['asset_type']
    search_fields = ['symbol', 'name']


@admin.register(WealthProjection)
class WealthProjectionAdmin(admin.ModelAdmin):
    list_display = ['label', 'user', 'current_age', 'monthly_contribution', 'annual_return_rate', 'years_to_goal']
    readonly_fields = ['projection_data', 'years_to_goal', 'projected_final_value', 'created_at', 'updated_at']
