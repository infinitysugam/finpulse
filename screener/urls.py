from django.urls import path
from .views import (
    RunScreenView, ScreenHistoryView,
    WatchlistView, WatchlistDetailView,
    FearGreedView, AskAIView,
)

urlpatterns = [
    path('run/', RunScreenView.as_view()),
    path('history/', ScreenHistoryView.as_view()),
    path('watchlist/', WatchlistView.as_view()),
    path('watchlist/<int:pk>/', WatchlistDetailView.as_view()),
    path('fear-greed/', FearGreedView.as_view()),
    path('ask-ai/', AskAIView.as_view()),
]
