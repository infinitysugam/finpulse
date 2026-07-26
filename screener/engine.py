import json
import re
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

_cache: dict[str, tuple[datetime, object]] = {}
_CACHE_TTL = timedelta(hours=6)


def _cached(key: str, fn):
    now = datetime.utcnow()
    if key in _cache:
        ts, val = _cache[key]
        if now - ts < _CACHE_TTL:
            return val
    val = fn()
    _cache[key] = (now, val)
    return val


# ── data helpers ──────────────────────────────────────────────────────────────

def _fetch_history(symbol: str, period: str = '6mo') -> pd.DataFrame:
    def _dl():
        df = yf.download(symbol, period=period, interval='1d', progress=False, auto_adjust=True)
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        return df
    return _cached(f'hist:{symbol}:{period}', _dl)


def _fetch_info(symbol: str) -> dict:
    return _cached(f'info:{symbol}', lambda: yf.Ticker(symbol).info)


# ── technical scoring (0-50 pts) ─────────────────────────────────────────────

def _score_technical(hist: pd.DataFrame) -> tuple[float, dict]:
    score = 0.0
    signals: dict[str, str] = {}

    if hist.empty or len(hist) < 30:
        return score, {'error': 'insufficient history'}

    close = hist['Close']
    volume = hist['Volume'] if 'Volume' in hist.columns else None

    # RSI (20 pts)
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    last_rsi = float(rsi.iloc[-1]) if not rsi.empty else 50

    if 40 <= last_rsi <= 60:
        pts, label = 10, 'neutral'
    elif 60 < last_rsi <= 70:
        pts, label = 20, 'bullish momentum'
    elif last_rsi > 70:
        pts, label = 8, 'overbought'
    elif 30 <= last_rsi < 40:
        pts, label = 15, 'recovering'
    else:
        pts, label = 5, 'oversold'
    score += pts
    signals['rsi'] = f'{last_rsi:.1f} ({label})'

    # Moving averages + Golden Cross (20 pts)
    sma50 = close.rolling(50).mean()
    sma200 = close.rolling(200).mean() if len(close) >= 200 else None
    last_close = float(close.iloc[-1])
    above50 = last_close > float(sma50.iloc[-1]) if not sma50.empty else False

    if sma200 is not None and not sma200.empty:
        above200 = last_close > float(sma200.iloc[-1])
        golden = float(sma50.iloc[-1]) > float(sma200.iloc[-1])
        if golden and above50 and above200:
            pts, label = 20, 'golden cross + above both MAs'
        elif above50 and above200:
            pts, label = 15, 'above SMA50 & SMA200'
        elif above50:
            pts, label = 10, 'above SMA50 only'
        else:
            pts, label = 3, 'below SMA50'
    else:
        pts, label = (12 if above50 else 3), ('above SMA50' if above50 else 'below SMA50')
    score += pts
    signals['moving_avg'] = label

    # MACD (15 pts)
    ema12 = close.ewm(span=12).mean()
    ema26 = close.ewm(span=26).mean()
    macd_line = ema12 - ema26
    signal_line = macd_line.ewm(span=9).mean()
    hist_macd = macd_line - signal_line

    if len(hist_macd) >= 2:
        bullish_cross = float(hist_macd.iloc[-1]) > 0 and float(hist_macd.iloc[-2]) <= 0
        bearish_cross = float(hist_macd.iloc[-1]) < 0 and float(hist_macd.iloc[-2]) >= 0
        above_zero = float(macd_line.iloc[-1]) > 0
        if bullish_cross:
            pts, label = 15, 'bullish crossover'
        elif bearish_cross:
            pts, label = 0, 'bearish crossover'
        elif above_zero:
            pts, label = 10, 'positive MACD'
        else:
            pts, label = 4, 'negative MACD'
        score += pts
        signals['macd'] = label

    # Volume (10 pts)
    if volume is not None and len(volume) >= 20:
        avg_vol = float(volume.rolling(20).mean().iloc[-1])
        last_vol = float(volume.iloc[-1])
        ratio = last_vol / avg_vol if avg_vol > 0 else 1
        if ratio >= 1.5:
            pts, label = 10, f'{ratio:.1f}x avg (high)'
        elif ratio >= 1.0:
            pts, label = 6, f'{ratio:.1f}x avg'
        else:
            pts, label = 2, f'{ratio:.1f}x avg (low)'
        score += pts
        signals['volume'] = label

    # Bollinger Bands (5 pts)
    bb_mid = close.rolling(20).mean()
    bb_std = close.rolling(20).std()
    bb_upper = bb_mid + 2 * bb_std
    bb_lower = bb_mid - 2 * bb_std
    if not bb_upper.empty:
        pct_b = (last_close - float(bb_lower.iloc[-1])) / (
            float(bb_upper.iloc[-1]) - float(bb_lower.iloc[-1]) + 1e-9
        )
        if 0.4 <= pct_b <= 0.8:
            pts, label = 5, f'mid-upper band ({pct_b:.0%})'
        elif pct_b > 0.8:
            pts, label = 2, f'near upper band ({pct_b:.0%})'
        elif pct_b < 0.2:
            pts, label = 3, f'near lower band / bounce ({pct_b:.0%})'
        else:
            pts, label = 3, f'mid-lower band ({pct_b:.0%})'
        score += pts
        signals['bollinger'] = label

    return min(score, 50.0), signals


# ── fundamental scoring (0-50 pts) ───────────────────────────────────────────

def _score_fundamental(info: dict) -> tuple[float, dict]:
    score = 0.0
    signals: dict[str, str] = {}

    pe = info.get('trailingPE') or info.get('forwardPE')
    if pe:
        if 0 < pe <= 15:
            pts, label = 15, f'{pe:.1f} (undervalued)'
        elif pe <= 25:
            pts, label = 12, f'{pe:.1f} (fair)'
        elif pe <= 40:
            pts, label = 6, f'{pe:.1f} (growth premium)'
        else:
            pts, label = 2, f'{pe:.1f} (expensive)'
        score += pts
        signals['pe_ratio'] = label

    rev_growth = info.get('revenueGrowth')
    if rev_growth is not None:
        pct = rev_growth * 100
        if pct >= 20:
            pts, label = 15, f'{pct:.1f}% YoY'
        elif pct >= 10:
            pts, label = 10, f'{pct:.1f}% YoY'
        elif pct >= 0:
            pts, label = 5, f'{pct:.1f}% YoY'
        else:
            pts, label = 0, f'{pct:.1f}% YoY (declining)'
        score += pts
        signals['revenue_growth'] = label

    roe = info.get('returnOnEquity')
    if roe is not None:
        pct = roe * 100
        if pct >= 20:
            pts, label = 10, f'{pct:.1f}%'
        elif pct >= 10:
            pts, label = 6, f'{pct:.1f}%'
        elif pct >= 0:
            pts, label = 2, f'{pct:.1f}%'
        else:
            pts, label = 0, f'{pct:.1f}% (negative)'
        score += pts
        signals['roe'] = label

    de = info.get('debtToEquity')
    if de is not None:
        if de <= 0.5:
            pts, label = 5, f'{de:.2f} (low)'
        elif de <= 1.5:
            pts, label = 3, f'{de:.2f} (moderate)'
        else:
            pts, label = 1, f'{de:.2f} (high)'
        score += pts
        signals['debt_equity'] = label

    margin = info.get('profitMargins')
    if margin is not None:
        pct = margin * 100
        if pct >= 20:
            pts, label = 5, f'{pct:.1f}%'
        elif pct >= 10:
            pts, label = 3, f'{pct:.1f}%'
        elif pct >= 0:
            pts, label = 1, f'{pct:.1f}%'
        else:
            pts, label = 0, f'{pct:.1f}% (loss-making)'
        score += pts
        signals['profit_margin'] = label

    return min(score, 50.0), signals


# ── phase 1: parallel technical scoring ───────────────────────────────────────

def _tech_score_symbol(symbol: str, is_crypto: bool) -> dict | None:
    try:
        hist = _fetch_history(symbol, '6mo')
        if hist.empty:
            return None
        tech_score, tech_signals = _score_technical(hist)
        close = hist['Close']
        last_price = float(close.iloc[-1])
        change_1d = float((close.iloc[-1] - close.iloc[-2]) / close.iloc[-2] * 100) if len(close) >= 2 else None
        change_1m = float((close.iloc[-1] - close.iloc[-21]) / close.iloc[-21] * 100) if len(close) >= 21 else None
        return {
            'symbol': symbol,
            'name': symbol.replace('-USD', '') if is_crypto else symbol,
            'is_crypto': is_crypto,
            'last_price': round(last_price, 4),
            'change_1d': round(change_1d, 2) if change_1d is not None else None,
            'change_1m': round(change_1m, 2) if change_1m is not None else None,
            'market_cap': None,
            'tech_score': round(tech_score, 1),
            'fund_score': 0.0,
            'fund_signals': {},
            'tech_signals': tech_signals,
            'total_score': round(tech_score * 2 if is_crypto else tech_score, 1),
        }
    except Exception as exc:
        logger.warning('tech_score %s failed: %s', symbol, exc)
        return None


# ── phase 2: fundamental enrichment ───────────────────────────────────────────

def _enrich_with_fundamentals(result: dict, preset: str) -> dict:
    symbol = result['symbol']
    try:
        info = _fetch_info(symbol)
        result['name'] = info.get('longName') or info.get('shortName') or symbol
        result['market_cap'] = info.get('marketCap')
        fund_score, fund_signals = _score_fundamental(info)
        result['fund_score'] = round(fund_score, 1)
        result['fund_signals'] = fund_signals
        result['total_score'] = round(result['tech_score'] + fund_score, 1)
    except Exception as exc:
        logger.warning('enrich %s: %s', symbol, exc)
    return result


def _apply_preset(result: dict, preset: str) -> dict:
    ts = result['tech_score']
    fs = result['fund_score']
    is_crypto = result['is_crypto']
    if preset == 'momentum':
        score = ts * (2 if is_crypto else 1.5) + fs * 0.5
    elif preset == 'value':
        score = ts * 0.4 + fs * 1.6 if not is_crypto else ts * 2
    elif preset == 'growth':
        label = result['fund_signals'].get('revenue_growth', '')
        boost = 10 if 'YoY' in label and 'declining' not in label else 0
        score = ts + fs + boost
    elif preset == 'golden_cross':
        bonus = 15 if 'golden cross' in result['tech_signals'].get('moving_avg', '') else 0
        score = ts + fs + bonus
    elif preset == 'technical':
        score = ts * 2
    else:
        score = ts * 2 if is_crypto else ts + fs
    result['total_score'] = round(min(score, 100), 1)
    return result


# ── JSON extraction helper ────────────────────────────────────────────────────

def _extract_json(text: str) -> dict:
    for pattern in [
        r'```(?:json)?\s*(\{[\s\S]*?\})\s*```',
        r'(\{[\s\S]*\})',
    ]:
        m = re.search(pattern, text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(1))
            except Exception:
                continue
    return {}


# ── the single bundled Claude call ────────────────────────────────────────────

def run_ai_analysis(
    results: list[dict],
    preset: str,
    universe: str,
    news_data: dict[str, list[str]],
    reddit_data: dict[str, list[str]],
    fear_greed: dict,
) -> tuple[list[dict], str]:
    """
    ONE Claude call that analyzes top results with news + reddit + fear/greed context.
    Returns (enriched_results, market_commentary).
    """
    try:
        import anthropic
        from django.conf import settings

        api_key = getattr(settings, 'ANTHROPIC_API_KEY', '')
        if not api_key:
            return results, 'AI analysis unavailable — add ANTHROPIC_API_KEY to .env'

        fg_score = fear_greed.get('score', 50)
        fg_label = fear_greed.get('label', 'Neutral')

        lines = [
            f'You are a quantitative financial analyst. Analyze these screener results ({universe}, {preset} preset).',
            f'Market Fear & Greed Index: {fg_score}/100 ({fg_label})',
            '',
            'Return ONLY valid JSON in this exact structure — no other text:',
            '{',
            '  "assets": [',
            '    {',
            '      "symbol": "TICKER",',
            '      "signal": "BUY",              // STRONG BUY / BUY / HOLD / AVOID',
            '      "thesis": "...",              // 2-3 sentence investment thesis',
            '      "risks": ["...", "..."],      // exactly 2 risk factors',
            '      "news_sentiment": "Bullish",  // Bullish / Bearish / Neutral',
            '      "news_score": 0.7,            // -1.0 to 1.0',
            '      "news_summary": "...",        // one sentence',
            '      "news_key_risk": "...",       // one sentence',
            '      "buzz_score": 65,             // 0-100',
            '      "crowd_sentiment": "Bullish", // Bullish / Bearish / Mixed',
            '      "reddit_top_thesis": "..."    // one sentence, "No Reddit data" if none',
            '    }',
            '  ],',
            '  "market_commentary": "..."        // 2-3 sentence overall market commentary',
            '}',
            '',
            '=== ASSETS TO ANALYZE ===',
        ]

        for r in results[:15]:
            tech_str = ', '.join(f'{k}: {v}' for k, v in r['tech_signals'].items())
            fund_str = ', '.join(f'{k}: {v}' for k, v in r['fund_signals'].items()) if r['fund_signals'] else 'N/A (crypto)'
            headlines = news_data.get(r['symbol'], [])
            posts = reddit_data.get(r['symbol'], [])

            lines += [
                f"\nSYMBOL: {r['symbol']} ({r['name']}) | Score: {r['total_score']}/100",
                f"Price: ${r['last_price']} | 1D: {r['change_1d']}% | 1M: {r['change_1m']}%",
                f"Technical: {tech_str}",
                f"Fundamental: {fund_str}",
            ]
            if headlines:
                lines.append('News headlines (48h): ' + ' | '.join(headlines[:5]))
            else:
                lines.append('News headlines: none available')
            if posts:
                lines.append('Reddit posts (24h): ' + ' | '.join(posts[:5]))
            else:
                lines.append('Reddit posts: none available')

        prompt = '\n'.join(lines)

        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=4096,
            messages=[{'role': 'user', 'content': prompt}],
        )
        raw = msg.content[0].text
        parsed = _extract_json(raw)

        # Merge AI fields back into results
        ai_by_symbol = {a['symbol']: a for a in parsed.get('assets', [])}
        for r in results:
            ai = ai_by_symbol.get(r['symbol'], {})
            r['signal']            = ai.get('signal', 'HOLD')
            r['thesis']            = ai.get('thesis', '')
            r['ai_risks']          = ai.get('risks', [])
            r['news_sentiment']    = ai.get('news_sentiment', 'Neutral')
            r['news_score']        = ai.get('news_score', 0.0)
            r['news_summary']      = ai.get('news_summary', '')
            r['news_key_risk']     = ai.get('news_key_risk', '')
            r['buzz_score']        = ai.get('buzz_score', 0)
            r['crowd_sentiment']   = ai.get('crowd_sentiment', 'Mixed')
            r['reddit_top_thesis'] = ai.get('reddit_top_thesis', '')

        market_commentary = parsed.get('market_commentary', raw[:500] if raw else '')
        return results, market_commentary

    except Exception as exc:
        logger.error('AI analysis failed: %s', exc)
        for r in results:
            r.setdefault('signal', 'HOLD')
            r.setdefault('thesis', '')
            r.setdefault('ai_risks', [])
            r.setdefault('news_sentiment', 'Neutral')
            r.setdefault('news_score', 0.0)
            r.setdefault('news_summary', '')
            r.setdefault('news_key_risk', '')
            r.setdefault('buzz_score', 0)
            r.setdefault('crowd_sentiment', 'Mixed')
            r.setdefault('reddit_top_thesis', '')
        return results, f'AI analysis failed: {exc}'


# ── on-demand Ask AI (per-asset, cached) ──────────────────────────────────────

_ask_ai_cache: dict[str, tuple[datetime, dict]] = {}
_ASK_AI_TTL = timedelta(minutes=15)


def ask_ai_about(result: dict, fear_greed: dict) -> dict:
    symbol = result['symbol']
    now = datetime.utcnow()
    if symbol in _ask_ai_cache:
        ts, data = _ask_ai_cache[symbol]
        if now - ts < _ASK_AI_TTL:
            return data

    try:
        import anthropic
        from django.conf import settings

        api_key = getattr(settings, 'ANTHROPIC_API_KEY', '')
        if not api_key:
            return {'error': 'ANTHROPIC_API_KEY not configured'}

        fg_score = fear_greed.get('score', 50)
        fg_label = fear_greed.get('label', 'Neutral')

        prompt = f"""You are a financial analyst giving a structured opinion on a single asset.

Asset: {result['symbol']} ({result['name']})
Current price: ${result.get('last_price')} | 1D: {result.get('change_1d')}% | 1M: {result.get('change_1m')}%
Technical score: {result.get('tech_score')}/50
Fundamental score: {result.get('fund_score')}/50
Technical signals: {', '.join(f"{k}: {v}" for k, v in result.get('tech_signals', {}).items())}
Fundamental signals: {', '.join(f"{k}: {v}" for k, v in result.get('fund_signals', {}).items()) or 'N/A'}
News sentiment: {result.get('news_sentiment', 'N/A')} (score: {result.get('news_score', 'N/A')})
News summary: {result.get('news_summary') or 'No recent news'}
News key risk: {result.get('news_key_risk') or 'N/A'}
Reddit crowd sentiment: {result.get('crowd_sentiment', 'N/A')} (buzz: {result.get('buzz_score', 'N/A')}/100)
Reddit thesis: {result.get('reddit_top_thesis') or 'No Reddit data'}
Market Fear & Greed: {fg_score}/100 ({fg_label})

Return ONLY this JSON:
{{
  "overall_view": "Bullish",         // Bullish / Bearish / Neutral
  "confidence": "Medium",            // Low / Medium / High
  "reasons": ["...", "...", "..."],  // exactly 3 bullet points
  "risks": ["...", "..."],           // exactly 2 bullet points
  "suggested_action": "Watch"        // Watch / Consider Buying / Avoid
}}"""

        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=512,
            messages=[{'role': 'user', 'content': prompt}],
        )
        data = _extract_json(msg.content[0].text)
        _ask_ai_cache[symbol] = (now, data)
        return data
    except Exception as exc:
        logger.error('ask_ai %s: %s', symbol, exc)
        return {'error': str(exc)}


# ── main entry point ──────────────────────────────────────────────────────────

def run_screen(
    stock_tickers: list[str],
    crypto_tickers: list[str],
    preset: str,
    top_n: int = 20,
    fundamental_candidates: int = 30,
) -> dict:
    from django.conf import settings
    from .news import fetch_batch as fetch_news_batch
    from .reddit_buzz import fetch_batch as fetch_reddit_batch
    from .fear_greed import fetch as fetch_fg

    t0 = time.time()
    all_symbols = [(s, False) for s in stock_tickers] + [(s, True) for s in crypto_tickers]

    # Phase 1: parallel technical scoring
    tech_results: list[dict] = []
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(_tech_score_symbol, sym, is_crypto): sym for sym, is_crypto in all_symbols}
        for fut in as_completed(futures):
            r = fut.result()
            if r:
                tech_results.append(r)

    tech_results.sort(key=lambda x: x['tech_score'], reverse=True)

    # Phase 2: fundamental enrichment for top stock candidates
    stock_candidates = [r for r in tech_results if not r['is_crypto']][:fundamental_candidates]
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = [pool.submit(_enrich_with_fundamentals, r, preset) for r in stock_candidates]
        for f in as_completed(futs):
            f.result()

    # Apply preset weights and pick top N
    for r in tech_results:
        _apply_preset(r, preset)
    tech_results.sort(key=lambda x: x['total_score'], reverse=True)
    top = tech_results[:top_n]

    # Phase 3: fetch news + reddit + fear&greed for top results (parallel with each other)
    top_symbols = [r['symbol'] for r in top]
    is_crypto_map = {r['symbol']: r['is_crypto'] for r in top}

    news_key   = getattr(settings, 'NEWS_API_KEY', '')
    reddit_id  = getattr(settings, 'REDDIT_CLIENT_ID', '')
    reddit_sec = getattr(settings, 'REDDIT_CLIENT_SECRET', '')
    reddit_ua  = getattr(settings, 'REDDIT_USER_AGENT', 'finpulse/1.0')

    with ThreadPoolExecutor(max_workers=3) as pool:
        f_news   = pool.submit(fetch_news_batch, top_symbols, news_key)
        f_reddit = pool.submit(fetch_reddit_batch, top_symbols, is_crypto_map, reddit_id, reddit_sec, reddit_ua)
        f_fg     = pool.submit(fetch_fg)
        news_data   = f_news.result()
        reddit_data = f_reddit.result()
        fear_greed  = f_fg.result()

    universe_label = 'mixed' if stock_tickers and crypto_tickers else ('stocks' if stock_tickers else 'crypto')

    # Phase 4: ONE Claude call — technical + news + reddit + fear/greed → JSON
    top, market_commentary = run_ai_analysis(top, preset, universe_label, news_data, reddit_data, fear_greed)

    return {
        'results': top,
        'ai_summary': market_commentary,
        'fear_greed': fear_greed,
        'total_screened': len(tech_results),
        'duration_s': round(time.time() - t0, 2),
    }
