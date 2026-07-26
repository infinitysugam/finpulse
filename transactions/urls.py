from django.urls import path
from .views import (
    CategoryListCreateView, CategoryDetailView,
    TransactionListCreateView, TransactionDetailView,
    DashboardSummaryView, NetWorthHistoryView, CategoryTrendsView, CashFlowView,
    DebtHistoryView, CategorySummaryView, CSVUploadView,
    MonthlySnapshotListView, ExpenseTimeseriesView,
)

urlpatterns = [
    path('dashboard/', DashboardSummaryView.as_view(), name='dashboard-summary'),
    path('dashboard/networth-history/', NetWorthHistoryView.as_view(), name='networth-history'),
    path('dashboard/category-trends/', CategoryTrendsView.as_view(), name='category-trends'),
    path('dashboard/cashflow/', CashFlowView.as_view(), name='cashflow'),
    path('dashboard/debt-history/', DebtHistoryView.as_view(), name='debt-history'),
    path('dashboard/category-summary/', CategorySummaryView.as_view(), name='category-summary'),
    path('snapshots/', MonthlySnapshotListView.as_view(), name='monthly-snapshots'),
    path('dashboard/expense-timeseries/', ExpenseTimeseriesView.as_view(), name='expense-timeseries'),
    path('categories/', CategoryListCreateView.as_view(), name='category-list'),
    path('categories/<int:pk>/', CategoryDetailView.as_view(), name='category-detail'),
    path('', TransactionListCreateView.as_view(), name='transaction-list'),
    path('<int:pk>/', TransactionDetailView.as_view(), name='transaction-detail'),
    path('import/csv/', CSVUploadView.as_view(), name='csv-upload'),
]
