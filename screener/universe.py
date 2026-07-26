SP100_TICKERS = [
    'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'GOOG', 'META', 'TSLA', 'BRK-B', 'UNH',
    'LLY', 'JPM', 'XOM', 'V', 'PG', 'MA', 'COST', 'HD', 'JNJ', 'ABBV',
    'MRK', 'CRM', 'BAC', 'AVGO', 'CVX', 'PEP', 'ORCL', 'ADBE', 'TMO', 'KO',
    'CSCO', 'ACN', 'MCD', 'WMT', 'ABT', 'LIN', 'NKE', 'TXN', 'DHR', 'NEE',
    'PM', 'INTC', 'AMGN', 'UNP', 'BMY', 'QCOM', 'LOW', 'IBM', 'INTU', 'CAT',
    'SBUX', 'GS', 'RTX', 'AMAT', 'BLK', 'AXP', 'ELV', 'ISRG', 'DE', 'MDLZ',
    'SYK', 'ADI', 'BKNG', 'GILD', 'VRTX', 'ADP', 'CB', 'PLD', 'REGN', 'C',
    'TJX', 'CI', 'SCHW', 'SO', 'ZTS', 'MO', 'TMUS', 'MMC', 'DUK', 'EOG',
    'MU', 'PGR', 'ITW', 'BSX', 'AON', 'SLB', 'CME', 'ETN', 'WFC', 'COP',
    'FDX', 'PSA', 'NOC', 'HUM', 'MCO', 'EW', 'F', 'GM', 'USB', 'TGT',
]

CRYPTO_TICKERS = [
    'BTC-USD', 'ETH-USD', 'BNB-USD', 'XRP-USD', 'SOL-USD',
    'ADA-USD', 'DOGE-USD', 'AVAX-USD', 'SHIB-USD', 'DOT-USD',
    'LINK-USD', 'MATIC-USD', 'LTC-USD', 'BCH-USD', 'XLM-USD',
    'UNI-USD', 'ATOM-USD', 'ETC-USD', 'XMR-USD', 'FIL-USD',
]

def get_tickers(universe: str, watchlist_symbols: list[str] | None = None) -> tuple[list[str], list[str]]:
    """Return (stock_tickers, crypto_tickers) for a given universe."""
    if universe == 'stocks':
        return SP100_TICKERS, []
    if universe == 'crypto':
        return [], CRYPTO_TICKERS
    if universe == 'watchlist':
        stocks = [s for s in (watchlist_symbols or []) if not s.endswith('-USD')]
        crypto = [s for s in (watchlist_symbols or []) if s.endswith('-USD')]
        return stocks, crypto
    return SP100_TICKERS, CRYPTO_TICKERS
