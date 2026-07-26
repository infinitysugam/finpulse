from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import WorkoutDayViewSet, PlannedExerciseViewSet, FitnessGoalViewSet, DailyLogViewSet

router = DefaultRouter()
router.register('workout-days', WorkoutDayViewSet, basename='workout-days')
router.register('exercises', PlannedExerciseViewSet, basename='exercises')
router.register('goals', FitnessGoalViewSet, basename='fitness-goals')
router.register('logs', DailyLogViewSet, basename='daily-logs')

urlpatterns = [path('', include(router.urls))]
