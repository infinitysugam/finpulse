import logging
import requests
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

_cache: dict | None = None
_cache_ts: datetime | None = None
_CACHE_TTL = timedelta(minutes=15)


def fetch() -> dict:
    global _cache, _cache_ts
    now = datetime.utcnow()
    if _cache and _cache_ts and (now - _cache_ts) < _CACHE_TTL:
        return _cache
    try:
        data = requests.get('https://api.alternative.me/fng/', timeout=5).json()['data'][0]
        _cache = {'score': int(data['value']), 'label': data['value_classification']}
        _cache_ts = now
        return _cache
    except Exception as exc:
        logger.warning('Fear & Greed fetch failed: %s', exc)
        return {'score': 50, 'label': 'Neutral'}
