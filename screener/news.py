import logging
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

_cache: dict[str, tuple[datetime, list]] = {}
_CACHE_TTL = timedelta(minutes=15)


def fetch_headlines(symbol: str, api_key: str) -> list[str]:
    now = datetime.utcnow()
    if symbol in _cache:
        ts, data = _cache[symbol]
        if now - ts < _CACHE_TTL:
            return data

    query = symbol.replace('-USD', '')
    from_dt = (now - timedelta(hours=48)).strftime('%Y-%m-%dT%H:%M:%SZ')

    try:
        resp = requests.get(
            'https://newsapi.org/v2/everything',
            params={
                'q': query,
                'from': from_dt,
                'sortBy': 'relevancy',
                'pageSize': 8,
                'language': 'en',
                'apiKey': api_key,
            },
            timeout=8,
        )
        headlines = [a['title'] for a in resp.json().get('articles', []) if a.get('title')]
        _cache[symbol] = (now, headlines)
        return headlines
    except Exception as exc:
        logger.warning('NewsAPI %s: %s', symbol, exc)
        return []


def fetch_batch(symbols: list[str], api_key: str) -> dict[str, list[str]]:
    if not api_key:
        return {s: [] for s in symbols}
    results: dict[str, list[str]] = {}
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(fetch_headlines, s, api_key): s for s in symbols}
        for fut in as_completed(futures):
            sym = futures[fut]
            try:
                results[sym] = fut.result()
            except Exception:
                results[sym] = []
    return results
