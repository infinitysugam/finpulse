from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from .models import Loan


@receiver(post_save, sender=Loan)
@receiver(post_delete, sender=Loan)
def loan_changed(sender, instance, **kwargs):
    from backend.utils import recompute_net_worth
    try:
        recompute_net_worth(instance.user)
    except Exception:
        pass
