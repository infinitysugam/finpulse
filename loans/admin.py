from django.contrib import admin
from .models import Loan, LoanPayment


class LoanPaymentInline(admin.TabularInline):
    model = LoanPayment
    extra = 0
    readonly_fields = ['created_at']


@admin.register(Loan)
class LoanAdmin(admin.ModelAdmin):
    list_display = ['name', 'loan_type', 'user', 'principal', 'current_balance', 'annual_interest_rate', 'status']
    list_filter = ['loan_type', 'status']
    search_fields = ['name', 'lender', 'user__username']
    inlines = [LoanPaymentInline]


@admin.register(LoanPayment)
class LoanPaymentAdmin(admin.ModelAdmin):
    list_display = ['loan', 'payment_date', 'amount', 'principal_component', 'interest_component', 'balance_after']
    list_filter = ['is_extra_payment']
    ordering = ['-payment_date']
