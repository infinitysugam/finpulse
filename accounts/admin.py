from django.contrib import admin
from .models import Account


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ['name', 'account_type', 'institution', 'balance', 'is_active', 'user']
    list_filter = ['account_type', 'is_active']
    search_fields = ['name', 'institution', 'user__username']
