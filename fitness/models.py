from django.db import models
from django.conf import settings

DAY_CHOICES = [
    (0, 'Monday'), (1, 'Tuesday'), (2, 'Wednesday'),
    (3, 'Thursday'), (4, 'Friday'), (5, 'Saturday'), (6, 'Sunday'),
]

MUSCLE_GROUPS = [
    ('chest', 'Chest'), ('back', 'Back'), ('shoulders', 'Shoulders'),
    ('biceps', 'Biceps'), ('triceps', 'Triceps'), ('legs', 'Legs'),
    ('core', 'Core'), ('cardio', 'Cardio'), ('full_body', 'Full Body'), ('other', 'Other'),
]


class WorkoutDay(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='workout_days')
    day_of_week = models.IntegerField(choices=DAY_CHOICES)
    name = models.CharField(max_length=100)
    is_rest_day = models.BooleanField(default=False)

    class Meta:
        unique_together = ('user', 'day_of_week')
        ordering = ['day_of_week']

    def __str__(self):
        return f"{self.get_day_of_week_display()} — {self.name}"


class PlannedExercise(models.Model):
    workout_day = models.ForeignKey(WorkoutDay, on_delete=models.CASCADE, related_name='exercises')
    name = models.CharField(max_length=100)
    muscle_group = models.CharField(max_length=20, choices=MUSCLE_GROUPS, default='other')
    sets = models.IntegerField(default=3)
    reps = models.CharField(max_length=20, default='10')
    target_weight = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    order = models.IntegerField(default=0)
    notes = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.name


class FitnessGoal(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='fitness_goal')
    daily_water_liters = models.DecimalField(max_digits=4, decimal_places=1, default=3.0)
    daily_calories = models.IntegerField(default=2000)
    target_weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return f"{self.user.username} fitness goals"


class DailyLog(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='fitness_logs')
    date = models.DateField()
    water_liters = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    calories = models.IntegerField(null=True, blank=True)
    body_weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    sleep_hours = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    workout_completed = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta:
        unique_together = ('user', 'date')
        ordering = ['-date']

    def __str__(self):
        return f"{self.user.username} — {self.date}"


class ExerciseLog(models.Model):
    daily_log = models.ForeignKey(DailyLog, on_delete=models.CASCADE, related_name='exercise_logs')
    planned_exercise = models.ForeignKey(PlannedExercise, on_delete=models.SET_NULL, null=True, blank=True)
    name = models.CharField(max_length=100)
    sets_completed = models.IntegerField(default=0)
    reps_completed = models.CharField(max_length=50, blank=True)
    weight_used = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    completed = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} — {self.daily_log.date}"
