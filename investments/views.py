from decimal import Decimal
from datetime import datetime, timezone

from django.db import transaction as db_transaction
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Account
from transactions.models import Transaction
from .models import Portfolio, Holding, Trade, WealthProjection
from .serializers import (
    PortfolioSerializer, HoldingSerializer, TradeSerializer,
    WealthProjectionSerializer,
)
from .services import compute_wealth_projection


def _adjust_portfolio_cash(portfolio_id, delta):
    """Add delta to the portfolio's CASH holding (positive = deposit, negative = withdraw)."""
    cash, _ = Holding.objects.get_or_create(
        portfolio_id=portfolio_id, asset_type='cash', symbol='CASH',
        defaults={
            'name': 'Cash', 'quantity': Decimal('0'),
            'average_cost_basis': Decimal('1'), 'current_price': Decimal('1'),
        },
    )
    cash.quantity = max(Decimal('0'), cash.quantity + delta)
    cash.current_price = Decimal('1')
    cash.average_cost_basis = Decimal('1')
    cash.save(update_fields=['quantity', 'current_price', 'average_cost_basis'])


class PortfolioListCreateView(generics.ListCreateAPIView):
    serializer_class = PortfolioSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Portfolio.objects.filter(user=self.request.user)
            .prefetch_related('holdings__trades')
        )


class PortfolioDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PortfolioSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Portfolio.objects.filter(user=self.request.user)


class HoldingListCreateView(generics.ListCreateAPIView):
    serializer_class = HoldingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Holding.objects.filter(
            portfolio__user=self.request.user,
            portfolio_id=self.kwargs['portfolio_pk'],
        ).prefetch_related('trades')

    def perform_create(self, serializer):
        portfolio = Portfolio.objects.get(pk=self.kwargs['portfolio_pk'], user=self.request.user)
        serializer.save(portfolio=portfolio)


class HoldingDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = HoldingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Holding.objects.filter(portfolio__user=self.request.user).prefetch_related('trades')


# ── Trades ────────────────────────────────────────────────────────────────────

class TradeListCreateView(APIView):
    """
    GET  /api/investments/portfolios/<portfolio_pk>/holdings/<holding_pk>/trades/
    POST same — record a buy or sell.

    BUY:
      • quantity/price/fees → total_cost = qty*price + fees
      • holding.quantity += qty
      • holding.average_cost_basis recalculated (weighted average)
      • if account_id provided: account.balance -= total_cost, creates expense Transaction

    SELL:
      • holding.quantity -= qty  (capped at 0)
      • realized_pnl = (price - avg_cost_basis) * qty - fees
      • if account_id provided: account.balance += qty*price - fees, creates income Transaction
    """
    permission_classes = [IsAuthenticated]

    def _get_holding(self, request, portfolio_pk, holding_pk):
        try:
            return Holding.objects.get(
                pk=holding_pk,
                portfolio_id=portfolio_pk,
                portfolio__user=request.user,
            )
        except Holding.DoesNotExist:
            return None

    def get(self, request, portfolio_pk, holding_pk):
        holding = self._get_holding(request, portfolio_pk, holding_pk)
        if not holding:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        trades = holding.trades.select_related('account').all()
        return Response(TradeSerializer(trades, many=True).data)

    def post(self, request, portfolio_pk, holding_pk):
        holding = self._get_holding(request, portfolio_pk, holding_pk)
        if not holding:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        trade_type = data.get('trade_type')
        if trade_type not in ('buy', 'sell'):
            return Response({'detail': 'trade_type must be buy or sell.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            quantity = Decimal(str(data['quantity']))
            price    = Decimal(str(data['price']))
        except (KeyError, Exception):
            return Response({'detail': 'quantity and price are required.'}, status=status.HTTP_400_BAD_REQUEST)

        if quantity <= 0 or price <= 0:
            return Response({'detail': 'quantity and price must be positive.'}, status=status.HTTP_400_BAD_REQUEST)

        fees = Decimal(str(data.get('fees', '0') or '0'))
        raw_date = data.get('date', '')
        try:
            from datetime import date as date_cls
            trade_date = datetime.strptime(str(raw_date)[:10], '%Y-%m-%d').date() if raw_date else date_cls.today()
        except ValueError:
            return Response({'detail': 'Invalid date format.'}, status=status.HTTP_400_BAD_REQUEST)

        account_id = data.get('account_id')
        account = None
        if account_id:
            try:
                account = Account.objects.get(pk=account_id, user=request.user)
            except Account.DoesNotExist:
                return Response({'detail': 'Account not found.'}, status=status.HTTP_400_BAD_REQUEST)

        with db_transaction.atomic():
            realized_pnl = None

            if trade_type == 'buy':
                total_cost = quantity * price + fees
                # Weighted-average cost basis
                old_qty = holding.quantity
                old_avg = holding.average_cost_basis
                new_qty = old_qty + quantity
                if new_qty > 0:
                    holding.average_cost_basis = (
                        (old_qty * old_avg + quantity * price) / new_qty
                    )
                holding.quantity = new_qty
                holding.save(update_fields=['quantity', 'average_cost_basis'])

                if account:
                    account.balance = max(Decimal('0'), account.balance - total_cost)
                    account.save(update_fields=['balance'])
                    Transaction.objects.create(
                        user=request.user, account=account,
                        transaction_type='expense',
                        title=f'Buy {quantity} {holding.symbol or holding.name}',
                        amount=total_cost, date=trade_date,
                        notes=data.get('notes', ''),
                        source='manual',
                    )
                else:
                    # Check portfolio cash before deducting
                    cash = Holding.objects.filter(
                        portfolio_id=holding.portfolio_id, asset_type='cash', symbol='CASH'
                    ).first()
                    cash_available = cash.quantity if cash else Decimal('0')
                    if cash_available < total_cost:
                        return Response(
                            {'detail': f'Insufficient portfolio cash. Available: ${float(cash_available):,.2f}, required: ${float(total_cost):,.2f}.'},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    _adjust_portfolio_cash(holding.portfolio_id, -total_cost)

            else:  # sell
                if quantity > holding.quantity:
                    return Response(
                        {'detail': f'Cannot sell {quantity} — only {holding.quantity} held.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                proceeds = quantity * price - fees
                realized_pnl = (price - holding.average_cost_basis) * quantity - fees
                holding.quantity = max(Decimal('0'), holding.quantity - quantity)
                holding.save(update_fields=['quantity'])

                if account:
                    account.balance = account.balance + proceeds
                    account.save(update_fields=['balance'])
                    Transaction.objects.create(
                        user=request.user, account=account,
                        transaction_type='income',
                        title=f'Sell {quantity} {holding.symbol or holding.name}',
                        amount=proceeds, date=trade_date,
                        notes=data.get('notes', ''),
                        source='manual',
                    )
                else:
                    _adjust_portfolio_cash(holding.portfolio_id, proceeds)

            trade = Trade.objects.create(
                holding=holding,
                trade_type=trade_type,
                quantity=quantity,
                price=price,
                fees=fees,
                date=trade_date,
                notes=data.get('notes', ''),
                account=account,
                realized_pnl=realized_pnl,
            )

        return Response(TradeSerializer(trade).data, status=status.HTTP_201_CREATED)


class TradeDetailView(APIView):
    """DELETE /api/investments/portfolios/<portfolio_pk>/holdings/<holding_pk>/trades/<pk>/"""
    permission_classes = [IsAuthenticated]

    def delete(self, request, portfolio_pk, holding_pk, pk):
        try:
            trade = Trade.objects.select_related('holding__portfolio', 'account').get(
                pk=pk,
                holding_id=holding_pk,
                holding__portfolio_id=portfolio_pk,
                holding__portfolio__user=request.user,
            )
        except Trade.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        holding = trade.holding
        with db_transaction.atomic():
            if trade.trade_type == 'buy':
                # Reverse: remove qty, recalculate avg cost from remaining trades
                holding.quantity = max(Decimal('0'), holding.quantity - trade.quantity)
                # Recalculate avg cost from remaining buy trades
                remaining_buys = (
                    Trade.objects.filter(holding=holding, trade_type='buy')
                    .exclude(pk=trade.pk)
                )
                total_qty  = sum(t.quantity for t in remaining_buys)
                total_cost = sum(t.quantity * t.price for t in remaining_buys)
                holding.average_cost_basis = (total_cost / total_qty) if total_qty > 0 else Decimal('0')
                holding.save(update_fields=['quantity', 'average_cost_basis'])
            else:
                # Reverse sell: add qty back
                holding.quantity += trade.quantity
                holding.save(update_fields=['quantity'])

            # Reverse account or portfolio cash effect
            if trade.account:
                if trade.trade_type == 'buy':
                    trade.account.balance += trade.quantity * trade.price + trade.fees
                else:
                    trade.account.balance = max(
                        Decimal('0'),
                        trade.account.balance - (trade.quantity * trade.price - trade.fees),
                    )
                trade.account.save(update_fields=['balance'])
            else:
                if trade.trade_type == 'buy':
                    _adjust_portfolio_cash(holding.portfolio_id, trade.quantity * trade.price + trade.fees)
                else:
                    _adjust_portfolio_cash(holding.portfolio_id, -(trade.quantity * trade.price - trade.fees))

            trade.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Live price refresh ────────────────────────────────────────────────────────

# CoinGecko IDs for common crypto symbols (avoids a search round-trip per coin)
_COINGECKO_ID = {
    'BTC': 'bitcoin', 'ETH': 'ethereum', 'BNB': 'binancecoin',
    'SOL': 'solana', 'XRP': 'ripple', 'ADA': 'cardano',
    'AVAX': 'avalanche-2', 'DOGE': 'dogecoin', 'DOT': 'polkadot',
    'MATIC': 'matic-network', 'SHIB': 'shiba-inu', 'LINK': 'chainlink',
    'UNI': 'uniswap', 'LTC': 'litecoin', 'ATOM': 'cosmos',
    'XLM': 'stellar', 'NEAR': 'near', 'VET': 'vechain',
    'ALGO': 'algorand', 'FTM': 'fantom', 'MANA': 'decentraland',
    'SAND': 'the-sandbox', 'AXS': 'axie-infinity', 'HBAR': 'hedera-hashgraph',
    'XTZ': 'tezos', 'EOS': 'eos', 'AAVE': 'aave', 'GRT': 'the-graph',
    'MKR': 'maker', 'COMP': 'compound-governance-token', 'CRV': 'curve-dao-token',
    'SUSHI': 'sushi', 'YFI': 'yearn-finance', 'ENJ': 'enjincoin',
    'CHZ': 'chiliz', 'THETA': 'theta-token', 'FIL': 'filecoin',
    'RUNE': 'thorchain', 'APE': 'apecoin', 'OP': 'optimism',
    'ARB': 'arbitrum', 'TON': 'the-open-network', 'SUI': 'sui',
    'APT': 'aptos', 'INJ': 'injective-protocol', 'TRX': 'tron',
    'XMR': 'monero', 'BCH': 'bitcoin-cash', 'ETC': 'ethereum-classic',
    'DASH': 'dash', 'ZEC': 'zcash', 'WAVES': 'waves', 'NEO': 'neo',
    'ZIL': 'zilliqa', 'KSM': 'kusama', 'FLOW': 'flow', 'QNT': 'quant-network',
    'LDO': 'lido-dao', 'RPL': 'rocket-pool', 'PEPE': 'pepe',
    'STX': 'blockstack', 'IMX': 'immutable-x', 'TIA': 'celestia',
    'SEI': 'sei-network', 'WLD': 'worldcoin-wld', 'BLUR': 'blur',
    'HNT': 'helium', 'CFX': 'conflux-token', 'GMT': 'stepn',
    # VeChain ecosystem
    'VTHO': 'vethor-token',
    # Popular meme / newer coins
    'FLOKI': 'floki', 'BONK': 'bonk', 'WIF': 'dogwifcoin',
    'PEPE2': 'pepe-2-0', 'BABYDOGE': 'baby-doge-coin',
    # DeFi / L2
    'JUP': 'jupiter-exchange-solana', 'PYTH': 'pyth-network',
    'JTO': 'jito-governance-token', 'ONDO': 'ondo-finance',
    'W': 'wormhole', 'ENA': 'ethena', 'ETHFI': 'ether-fi',
    # Other common holdings
    'JASMY': 'jasmycoin', 'ROSE': 'oasis-network',
    'CELR': 'celer-network', 'SKL': 'skale', 'DYDX': 'dydx-chain',
    'AUDIO': 'audius', 'ENS': 'ethereum-name-service',
    'LRC': 'loopring', 'ZRX': '0x', 'BAT': 'basic-attention-token',
    'CVC': 'civic', 'REN': 'republic-protocol', 'NMR': 'numeraire',
    'OGN': 'origin-protocol', 'BAND': 'band-protocol',
    'XYO': 'xyo-network', 'VARA': 'vara-network',
    'RARE': 'superrare', 'PNG': 'pangolin', 'CORECHAIN': 'coredaoorg',
    'OCEAN': 'ocean-protocol', 'FET': 'fetch-ai',
    'AGIX': 'singularitynet', 'RNDR': 'render-token',
    'AR': 'arweave', 'SC': 'siacoin', 'XDC': 'xdce-crowd-sale',
    'KAVA': 'kava', 'CELO': 'celo', 'MINA': 'mina-protocol',
    'ICP': 'internet-computer', 'STORJ': 'storj',
}


def _normalize_crypto_sym(symbol):
    """Strip common quote suffixes from user-entered symbols."""
    sym = symbol.strip().upper()
    for suffix in ('-USD', '/USD', '-USDT', 'USDT', 'USDC', 'BUSD'):
        if sym.endswith(suffix):
            sym = sym[:-len(suffix)]
            break
    return sym


def _fetch_crypto_prices_bulk(symbols):
    """
    Fetch CoinGecko prices for a list of normalised crypto symbols.
    Returns {symbol: float_price}.  Unknown coins fall back to a search call.
    """
    import requests

    results = {}
    needs_search = []

    # Split into known (mapped) and unknown
    sym_to_id = {}
    for sym in symbols:
        if sym in _COINGECKO_ID:
            sym_to_id[sym] = _COINGECKO_ID[sym]
        else:
            needs_search.append(sym)

    # Single batch request for known coins
    if sym_to_id:
        try:
            r = requests.get(
                'https://api.coingecko.com/api/v3/simple/price',
                params={'ids': ','.join(sym_to_id.values()), 'vs_currencies': 'usd'},
                timeout=8,
            )
            if r.ok:
                data = r.json()
                for sym, coin_id in sym_to_id.items():
                    if coin_id in data:
                        results[sym] = float(data[coin_id]['usd'])
        except Exception:
            pass

    # Search + price for unknown coins (one call per coin)
    for sym in needs_search:
        try:
            r = requests.get(
                'https://api.coingecko.com/api/v3/search',
                params={'query': sym},
                timeout=6,
            )
            if not r.ok:
                continue
            coins = r.json().get('coins', [])
            match = next((c for c in coins if c['symbol'].upper() == sym), None)
            if not match:
                continue
            r2 = requests.get(
                'https://api.coingecko.com/api/v3/simple/price',
                params={'ids': match['id'], 'vs_currencies': 'usd'},
                timeout=6,
            )
            if r2.ok and r2.json():
                results[sym] = float(next(iter(r2.json().values()))['usd'])
        except Exception:
            pass

    return results


class PriceRefreshView(APIView):
    """
    POST /api/investments/portfolios/<pk>/refresh-prices/
    Crypto (asset_type='crypto') → CoinGecko (batch).
    Stocks / ETFs / other → yfinance (Yahoo Finance).
    Cash holdings are always kept at $1.00.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            portfolio = Portfolio.objects.prefetch_related('holdings').get(
                pk=pk, user=request.user
            )
        except Portfolio.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        import yfinance as yf

        updated = []
        errors  = []
        now     = datetime.now(timezone.utc)
        holdings = list(portfolio.holdings.all())

        # Pre-fetch all crypto prices in one batch call
        crypto_syms = [
            _normalize_crypto_sym(h.symbol)
            for h in holdings
            if h.asset_type == 'crypto' and h.symbol and h.symbol != 'CASH'
        ]
        crypto_prices = _fetch_crypto_prices_bulk(crypto_syms) if crypto_syms else {}

        for holding in holdings:
            # Cash always $1
            if holding.asset_type == 'cash' or holding.symbol == 'CASH':
                holding.current_price      = Decimal('1')
                holding.price_last_updated = now
                holding.save(update_fields=['current_price', 'price_last_updated'])
                updated.append({'symbol': holding.symbol, 'price': 1.0, 'source': 'fixed'})
                continue

            symbol = holding.symbol.strip().upper()
            if not symbol:
                continue

            if holding.asset_type == 'crypto':
                norm  = _normalize_crypto_sym(symbol)
                price = crypto_prices.get(norm)
                source = 'coingecko'
            else:
                price = None
                source = 'yahoo'
                try:
                    info  = yf.Ticker(symbol).fast_info
                    price = info.get('lastPrice') or info.get('regularMarketPrice')
                except Exception:
                    pass

            if price is None:
                errors.append({'symbol': symbol, 'error': 'Price not found'})
                continue

            holding.current_price      = Decimal(str(round(float(price), 6)))
            holding.price_last_updated = now
            holding.save(update_fields=['current_price', 'price_last_updated'])
            updated.append({'symbol': symbol, 'price': float(price), 'source': source})

        return Response({
            'updated': updated,
            'errors':  errors,
            'portfolio': PortfolioSerializer(
                Portfolio.objects.prefetch_related('holdings__trades').get(pk=pk),
                context={'request': request},
            ).data,
        })


# ── Cash deposit to portfolio ─────────────────────────────────────────────────

class CashDepositView(APIView):
    """
    POST /api/investments/portfolios/<pk>/deposit/
    Body: { amount, account_id (optional), date (optional), notes (optional) }
    Adds cash to the portfolio's CASH holding.
    If account_id provided, debits that account and creates a Transaction.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            portfolio = Portfolio.objects.get(pk=pk, user=request.user)
        except Portfolio.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            amount = Decimal(str(request.data['amount']))
        except (KeyError, Exception):
            return Response({'detail': 'amount is required.'}, status=status.HTTP_400_BAD_REQUEST)

        if amount <= 0:
            return Response({'detail': 'amount must be positive.'}, status=status.HTTP_400_BAD_REQUEST)

        raw_date = request.data.get('date', '')
        try:
            from datetime import date as date_cls
            dep_date = datetime.strptime(str(raw_date)[:10], '%Y-%m-%d').date() if raw_date else date_cls.today()
        except ValueError:
            return Response({'detail': 'Invalid date.'}, status=status.HTTP_400_BAD_REQUEST)

        account_id = request.data.get('account_id')
        account = None
        if account_id:
            try:
                account = Account.objects.get(pk=account_id, user=request.user)
            except Account.DoesNotExist:
                return Response({'detail': 'Account not found.'}, status=status.HTTP_400_BAD_REQUEST)

        with db_transaction.atomic():
            holding, _ = Holding.objects.get_or_create(
                portfolio=portfolio, asset_type='cash', symbol='CASH',
                defaults={
                    'name': 'Cash', 'quantity': Decimal('0'),
                    'average_cost_basis': Decimal('1'), 'current_price': Decimal('1'),
                },
            )
            holding.quantity += amount
            holding.current_price      = Decimal('1')
            holding.average_cost_basis = Decimal('1')
            holding.save(update_fields=['quantity', 'current_price', 'average_cost_basis'])

            if account:
                account.balance = max(Decimal('0'), account.balance - amount)
                account.save(update_fields=['balance'])
                Transaction.objects.create(
                    user=request.user, account=account,
                    transaction_type='investment',
                    title=f'Deposit to {portfolio.name}',
                    amount=amount, date=dep_date,
                    notes=request.data.get('notes', ''),
                    source='manual',
                    portfolio=portfolio,
                )

        return Response({'cash_balance': float(holding.quantity)}, status=status.HTTP_201_CREATED)


# ── Wealth projections ────────────────────────────────────────────────────────

class WealthProjectionListCreateView(generics.ListCreateAPIView):
    serializer_class = WealthProjectionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return WealthProjection.objects.filter(user=self.request.user)


class WealthProjectionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = WealthProjectionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return WealthProjection.objects.filter(user=self.request.user)


class RecalculateProjectionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        proj = WealthProjection.objects.filter(pk=pk, user=request.user).first()
        if not proj:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        proj = compute_wealth_projection(proj)
        return Response(WealthProjectionSerializer(proj).data)
