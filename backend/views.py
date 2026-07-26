from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from .telegram import send_telegram


@login_required
@require_POST
def telegram_test(request):
    ok = send_telegram(
        "✅ *FinPulse connected!*\n\nYour Telegram notifications are working."
    )
    if ok:
        return JsonResponse({'status': 'sent'})
    return JsonResponse({'status': 'error', 'detail': 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured'}, status=500)
