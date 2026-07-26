from django.urls import path
from .views import FinancialGoalListCreateView, FinancialGoalDetailView

urlpatterns = [
    path('', FinancialGoalListCreateView.as_view(), name='goal-list'),
    path('<int:pk>/', FinancialGoalDetailView.as_view(), name='goal-detail'),
]
