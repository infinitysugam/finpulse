from django.urls import path
from .views import (
    LoanListCreateView, LoanDetailView,
    LoanPaymentListCreateView, LoanPaymentDetailView,
    AmortizationTableView, WhatIfSimulatorView,
    MathEngineView, MathEngineSimulateView,
    RecordPaymentView,
)

urlpatterns = [
    path('', LoanListCreateView.as_view(), name='loan-list'),
    path('<int:pk>/', LoanDetailView.as_view(), name='loan-detail'),
    path('<int:loan_pk>/payments/', LoanPaymentListCreateView.as_view(), name='loan-payments'),
    path('<int:loan_pk>/payments/<int:pk>/', LoanPaymentDetailView.as_view(), name='loan-payment-detail'),
    path('<int:pk>/record-payment/', RecordPaymentView.as_view(), name='record-payment'),
    path('<int:pk>/amortization/', AmortizationTableView.as_view(), name='amortization-table'),
    path('<int:pk>/what-if/', WhatIfSimulatorView.as_view(), name='what-if-simulator'),
    path('<int:pk>/math-engine/', MathEngineView.as_view(), name='math-engine'),
    path('<int:pk>/math-engine/simulate/', MathEngineSimulateView.as_view(), name='math-engine-simulate'),
]
