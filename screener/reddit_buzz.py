import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

_cache: dict[str, tuple[datetime, list]] = {}
_CACHE_TTL = timedelta(minutes=15)


def fetch_mentions(symbol: str, is_crypto: bool, client_id: str, client_secret: str, user_agent: str) -> list[str]:
    now = datetime.utcnow()
    if symbol in _cache:
        ts, data = _cache[symbol]
        if now - ts < _CACHE_TTL:
            return data

    try:
        import praw
        reddit = praw.Reddit(client_id=client_id, client_secret=client_secret, user_agent=user_agent)
        query = symbol.replace('-USD', '')
        subreddits = ['CryptoCurrency', 'Bitcoin'] if is_crypto else ['wallstreetbets', 'stocks']
        posts: list[str] = []
        for sub_name in subreddits:
            try:
                for post in reddit.subreddit(sub_name).search(query, sort='hot', time_filter='day', limit=5):
                    text = post.title
                    if post.selftext:
                        text += ': ' + post.selftext[:150].strip()
                    posts.append(text)
            except Exception:
                continue
        posts = posts[:10]
        _cache[symbol] = (now, posts)
        return posts
    except Exception as exc:
        logger.warning('Reddit %s: %s', symbol, exc)
        return []


def fetch_batch(symbols: list[str], is_crypto_map: dict[str, bool], client_id: str, client_secret: str, user_agent: str) -> dict[str, list[str]]:
    if not client_id or not client_secret:
        return {s: [] for s in symbols}
    results: dict[str, list[str]] = {}
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(fetch_mentions, s, is_crypto_map.get(s, False), client_id, client_secret, user_agent): s for s in symbols}
        for fut in as_completed(futures):
            sym = futures[fut]
            try:
                results[sym] = fut.result()
            except Exception:
                results[sym] = []
    return results
