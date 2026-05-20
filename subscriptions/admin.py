from django.contrib import admin
from .models import Subscription


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display  = ['name', 'category', 'amount', 'billing_cycle', 'status', 'next_billing_date', 'user']
    list_filter   = ['category', 'billing_cycle', 'status']
    search_fields = ['name', 'user__username']
    ordering      = ['category', 'name']
