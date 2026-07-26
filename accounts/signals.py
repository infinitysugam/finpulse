from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from .models import Account


@receiver(post_save, sender=Account)
@receiver(post_delete, sender=Account)
def account_changed(sender, instance, **kwargs):
    from backend.utils import recompute_net_worth
    try:
        recompute_net_worth(instance.user)
    except Exception:
        pass
