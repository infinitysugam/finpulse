from django.urls import path
from .views import (
    BudgetView, BudgetApproveView, BudgetDraftRejectView,
    CurrentMonthView, IncomeTriggerView, WeekActualsView, WeekPlanUpdateView,
    OptimizerDefaultsView, OptimizerConfigView, RunOptimizerView,
)

urlpatterns = [
    path('',                             BudgetView.as_view(),            name='budget'),
    path('<int:pk>/approve/',            BudgetApproveView.as_view(),     name='budget-approve'),
    path('<int:pk>/',                    BudgetDraftRejectView.as_view(), name='budget-draft-delete'),
    path('current-month/',               CurrentMonthView.as_view(),      name='budget-current-month'),
    path('income-trigger/',              IncomeTriggerView.as_view(),     name='budget-income-trigger'),
    path('week/<str:week_start>/',       WeekActualsView.as_view(),       name='budget-week'),
    path('week-plan/<int:pk>/',          WeekPlanUpdateView.as_view(),    name='budget-week-plan-update'),
    path('optimizer/defaults/',          OptimizerDefaultsView.as_view(), name='optimizer-defaults'),
    path('optimizer/config/',            OptimizerConfigView.as_view(),   name='optimizer-config'),
    path('optimizer/run/',               RunOptimizerView.as_view(),      name='optimizer-run'),
]
