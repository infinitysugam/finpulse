from django.urls import path
from .views import (
    PortfolioListCreateView, PortfolioDetailView,
    HoldingListCreateView, HoldingDetailView,
    TradeListCreateView, TradeDetailView,
    PriceRefreshView, CashDepositView,
    WealthProjectionListCreateView, WealthProjectionDetailView,
    RecalculateProjectionView,
)

urlpatterns = [
    path('portfolios/',                  PortfolioListCreateView.as_view(),  name='portfolio-list'),
    path('portfolios/<int:pk>/',         PortfolioDetailView.as_view(),      name='portfolio-detail'),
    path('portfolios/<int:pk>/refresh-prices/', PriceRefreshView.as_view(),  name='price-refresh'),
    path('portfolios/<int:pk>/deposit/', CashDepositView.as_view(),          name='cash-deposit'),

    path('portfolios/<int:portfolio_pk>/holdings/',
         HoldingListCreateView.as_view(), name='holding-list'),
    path('portfolios/<int:portfolio_pk>/holdings/<int:pk>/',
         HoldingDetailView.as_view(), name='holding-detail'),

    path('portfolios/<int:portfolio_pk>/holdings/<int:holding_pk>/trades/',
         TradeListCreateView.as_view(), name='trade-list'),
    path('portfolios/<int:portfolio_pk>/holdings/<int:holding_pk>/trades/<int:pk>/',
         TradeDetailView.as_view(), name='trade-detail'),

    path('projections/',              WealthProjectionListCreateView.as_view(), name='projection-list'),
    path('projections/<int:pk>/',     WealthProjectionDetailView.as_view(),     name='projection-detail'),
    path('projections/<int:pk>/recalculate/', RecalculateProjectionView.as_view(), name='projection-recalculate'),
]
