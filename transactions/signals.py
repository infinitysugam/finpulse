from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from .models import Transaction, MonthlySnapshot


@receiver(post_save, sender=Transaction)
@receiver(post_delete, sender=Transaction)
def transaction_changed(sender, instance, **kwargs):
    try:
        MonthlySnapshot.compute_for(instance.user, instance.date.year, instance.date.month)
    except Exception:
        pass
