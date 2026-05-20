from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Portfolio, Holding, WealthProjection
from .serializers import PortfolioSerializer, HoldingSerializer, WealthProjectionSerializer
from .services import compute_wealth_projection


class PortfolioListCreateView(generics.ListCreateAPIView):
    serializer_class = PortfolioSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Portfolio.objects.filter(user=self.request.user).prefetch_related('holdings')


class PortfolioDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PortfolioSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Portfolio.objects.filter(user=self.request.user)


class HoldingListCreateView(generics.ListCreateAPIView):
    serializer_class = HoldingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Holding.objects.filter(
            portfolio__user=self.request.user,
            portfolio_id=self.kwargs['portfolio_pk'],
        )

    def perform_create(self, serializer):
        portfolio = Portfolio.objects.get(pk=self.kwargs['portfolio_pk'], user=self.request.user)
        serializer.save(portfolio=portfolio)


class HoldingDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = HoldingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Holding.objects.filter(portfolio__user=self.request.user)


class WealthProjectionListCreateView(generics.ListCreateAPIView):
    serializer_class = WealthProjectionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return WealthProjection.objects.filter(user=self.request.user)


class WealthProjectionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = WealthProjectionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return WealthProjection.objects.filter(user=self.request.user)


class RecalculateProjectionView(APIView):
    """POST /api/investments/projections/<pk>/recalculate/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        proj = WealthProjection.objects.filter(pk=pk, user=request.user).first()
        if not proj:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        proj = compute_wealth_projection(proj)
        return Response(WealthProjectionSerializer(proj).data)
