from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from datetime import date
from .models import WorkoutDay, PlannedExercise, FitnessGoal, DailyLog, ExerciseLog
from .serializers import (
    WorkoutDaySerializer, PlannedExerciseSerializer,
    FitnessGoalSerializer, DailyLogSerializer, ExerciseLogSerializer,
)


class WorkoutDayViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = WorkoutDaySerializer

    def get_queryset(self):
        return WorkoutDay.objects.filter(user=self.request.user).prefetch_related('exercises')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'])
    def add_exercise(self, request, pk=None):
        workout_day = self.get_object()
        serializer = PlannedExerciseSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(workout_day=workout_day)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def today(self, request):
        dow = date.today().weekday()
        try:
            day = WorkoutDay.objects.prefetch_related('exercises').get(user=request.user, day_of_week=dow)
            return Response(WorkoutDaySerializer(day).data)
        except WorkoutDay.DoesNotExist:
            return Response(None)


class PlannedExerciseViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PlannedExerciseSerializer

    def get_queryset(self):
        return PlannedExercise.objects.filter(workout_day__user=self.request.user)


class FitnessGoalViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        goal, _ = FitnessGoal.objects.get_or_create(user=request.user)
        return Response(FitnessGoalSerializer(goal).data)

    def create(self, request):
        goal, _ = FitnessGoal.objects.get_or_create(user=request.user)
        serializer = FitnessGoalSerializer(goal, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DailyLogViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = DailyLogSerializer

    def get_queryset(self):
        return DailyLog.objects.filter(user=self.request.user).prefetch_related('exercise_logs')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['get', 'post', 'patch'])
    def today(self, request):
        today = date.today()
        if request.method == 'GET':
            log = DailyLog.objects.filter(user=request.user, date=today).prefetch_related('exercise_logs').first()
            return Response(DailyLogSerializer(log).data if log else None)
        log, _ = DailyLog.objects.get_or_create(user=request.user, date=today)
        serializer = DailyLogSerializer(log, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def log_exercise(self, request, pk=None):
        daily_log = self.get_object()
        serializer = ExerciseLogSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(daily_log=daily_log)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def progress(self, request):
        logs = DailyLog.objects.filter(user=request.user).order_by('date')
        data = [{
            'date': log.date.isoformat(),
            'water_liters': float(log.water_liters) if log.water_liters else None,
            'calories': log.calories,
            'body_weight_kg': float(log.body_weight_kg) if log.body_weight_kg else None,
            'sleep_hours': float(log.sleep_hours) if log.sleep_hours else None,
            'workout_completed': log.workout_completed,
        } for log in logs]
        return Response(data)
