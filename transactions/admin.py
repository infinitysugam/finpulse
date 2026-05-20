from django.contrib import admin
from .models import Category, Transaction, CSVImportLog


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'category_type', 'user', 'monthly_budget', 'is_system']
    list_filter = ['category_type', 'is_system']
    search_fields = ['name', 'user__username']


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ['title', 'amount', 'transaction_type', 'date', 'category', 'user', 'source']
    list_filter = ['transaction_type', 'source', 'is_ai_categorized', 'date']
    search_fields = ['title', 'merchant', 'user__username']
    date_hierarchy = 'date'
    ordering = ['-date']


@admin.register(CSVImportLog)
class CSVImportLogAdmin(admin.ModelAdmin):
    list_display = ['file_name', 'user', 'status', 'rows_imported', 'rows_failed', 'created_at']
    list_filter = ['status']
    readonly_fields = ['created_at', 'completed_at']
