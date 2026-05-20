from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('users.urls')),
    path('api/accounts/', include('accounts.urls')),
    path('api/transactions/', include('transactions.urls')),
    path('api/loans/', include('loans.urls')),
    path('api/investments/', include('investments.urls')),
    path('api/ai/', include('ai_agent.urls')),
    path('api/subscriptions/', include('subscriptions.urls')),
]
