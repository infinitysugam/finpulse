from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Financial Profile', {
            'fields': (
                'date_of_birth', 'currency', 'profile_picture',
                'monthly_income', 'net_worth',
                'millionaire_goal', 'expected_annual_return',
                'monthly_investment_contribution',
            )
        }),
    )
    list_display = ['username', 'email', 'currency', 'net_worth', 'is_staff']
