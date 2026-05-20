from rest_framework import generics, filters
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Subscription
from .serializers import SubscriptionSerializer


class SubscriptionListCreateView(generics.ListCreateAPIView):
    serializer_class   = SubscriptionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends    = [filters.SearchFilter, filters.OrderingFilter]
    search_fields      = ['name', 'notes']
    ordering_fields    = ['name', 'amount', 'next_billing_date']

    def get_queryset(self):
        qs = Subscription.objects.filter(user=self.request.user).select_related('account')
        if status := self.request.query_params.get('status'):
            qs = qs.filter(status=status)
        if category := self.request.query_params.get('category'):
            qs = qs.filter(category=category)
        return qs


class SubscriptionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class   = SubscriptionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Subscription.objects.filter(user=self.request.user).select_related('account')


class SubscriptionSummaryView(APIView):
    """GET /api/subscriptions/summary/ — aggregated spend stats."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        subs = Subscription.objects.filter(user=request.user, status='active')
        total_monthly = sum(s.monthly_cost for s in subs)
        total_annual  = total_monthly * 12

        by_category = {}
        for s in subs:
            by_category.setdefault(s.category, 0)
            by_category[s.category] += s.monthly_cost

        return Response({
            'active_count':   subs.count(),
            'total_monthly':  round(total_monthly, 2),
            'total_annual':   round(total_annual, 2),
            'by_category':    {k: round(v, 2) for k, v in sorted(by_category.items(), key=lambda x: -x[1])},
        })
