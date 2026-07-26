from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from .models import FinancialGoal
from .serializers import FinancialGoalSerializer


class FinancialGoalListCreateView(generics.ListCreateAPIView):
    serializer_class = FinancialGoalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = FinancialGoal.objects.filter(user=self.request.user)
        status = self.request.query_params.get('status')
        if status:
            qs = qs.filter(status=status)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class FinancialGoalDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FinancialGoalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return FinancialGoal.objects.filter(user=self.request.user)
