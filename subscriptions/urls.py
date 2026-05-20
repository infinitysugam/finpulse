from django.urls import path
from .views import SubscriptionListCreateView, SubscriptionDetailView, SubscriptionSummaryView

urlpatterns = [
    path('',          SubscriptionListCreateView.as_view(), name='subscription-list'),
    path('summary/',  SubscriptionSummaryView.as_view(),    name='subscription-summary'),
    path('<int:pk>/', SubscriptionDetailView.as_view(),     name='subscription-detail'),
]
