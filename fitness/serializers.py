from rest_framework import serializers
from .models import WorkoutDay, PlannedExercise, FitnessGoal, DailyLog, ExerciseLog


class PlannedExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlannedExercise
        fields = ['id', 'name', 'muscle_group', 'sets', 'reps', 'target_weight', 'order', 'notes']


class WorkoutDaySerializer(serializers.ModelSerializer):
    exercises = PlannedExerciseSerializer(many=True, read_only=True)
    day_name = serializers.CharField(source='get_day_of_week_display', read_only=True)

    class Meta:
        model = WorkoutDay
        fields = ['id', 'day_of_week', 'day_name', 'name', 'is_rest_day', 'exercises']


class FitnessGoalSerializer(serializers.ModelSerializer):
    class Meta:
        model = FitnessGoal
        fields = ['id', 'daily_water_liters', 'daily_calories', 'target_weight_kg']


class ExerciseLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExerciseLog
        fields = ['id', 'planned_exercise', 'name', 'sets_completed', 'reps_completed', 'weight_used', 'completed']


class DailyLogSerializer(serializers.ModelSerializer):
    exercise_logs = ExerciseLogSerializer(many=True, read_only=True)

    class Meta:
        model = DailyLog
        fields = ['id', 'date', 'water_liters', 'calories', 'body_weight_kg',
                  'sleep_hours', 'workout_completed', 'notes', 'exercise_logs']
