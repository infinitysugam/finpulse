from django.contrib import admin
from django.urls import path, include
from .views import telegram_test

urlpatterns = [
    path('api/telegram/test/', telegram_test, name='telegram_test'),
    path('admin/', admin.site.urls),
    path('api/auth/', include('users.urls')),
    path('api/accounts/', include('accounts.urls')),
    path('api/transactions/', include('transactions.urls')),
    path('api/loans/', include('loans.urls')),
    path('api/investments/', include('investments.urls')),
    path('api/ai/', include('ai_agent.urls')),
    path('api/subscriptions/', include('subscriptions.urls')),
    path('api/goals/', include('goals.urls')),
    path('api/screener/', include('screener.urls')),
    path('api/budget/', include('budget.urls')),
    path('api/fitness/', include('fitness.urls')),
]
