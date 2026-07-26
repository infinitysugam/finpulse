from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from .models import Holding


@receiver(post_save, sender=Holding)
@receiver(post_delete, sender=Holding)
def holding_changed(sender, instance, **kwargs):
    from backend.utils import recompute_net_worth
    from django.contrib.auth import get_user_model
    try:
        User = get_user_model()
        user = User.objects.get(portfolios__id=instance.portfolio_id)
        recompute_net_worth(user)
    except Exception:
        pass
