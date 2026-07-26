from rest_framework.views import APIView
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import serializers, status

from .models import ScreenRun, WatchlistTicker
from .universe import get_tickers
from .engine import run_screen, ask_ai_about
from .fear_greed import fetch as fetch_fg


class ScreenRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScreenRun
        fields = ['id', 'universe', 'preset', 'results', 'ai_summary',
                  'duration_s', 'total_screened', 'created_at']
        read_only_fields = fields


class WatchlistTickerSerializer(serializers.ModelSerializer):
    class Meta:
        model = WatchlistTicker
        fields = ['id', 'symbol', 'asset_type', 'notes', 'added_at']
        read_only_fields = ['id', 'added_at']


class RunScreenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        universe = request.data.get('universe', 'all')
        preset = request.data.get('preset', 'all_around')

        valid_universes = [c[0] for c in ScreenRun.UNIVERSE_CHOICES]
        valid_presets = [c[0] for c in ScreenRun.PRESET_CHOICES]
        if universe not in valid_universes or preset not in valid_presets:
            return Response({'detail': 'Invalid universe or preset.'}, status=status.HTTP_400_BAD_REQUEST)

        watchlist_symbols = list(
            WatchlistTicker.objects.filter(user=request.user).values_list('symbol', flat=True)
        ) if universe == 'watchlist' else None

        stocks, crypto = get_tickers(universe, watchlist_symbols)
        data = run_screen(stocks, crypto, preset)

        run = ScreenRun.objects.create(
            user=request.user,
            universe=universe,
            preset=preset,
            results=data['results'],
            ai_summary=data['ai_summary'],
            total_screened=data['total_screened'],
            duration_s=data['duration_s'],
        )
        # Include fear_greed in response even though it's not persisted
        response_data = ScreenRunSerializer(run).data
        response_data['fear_greed'] = data.get('fear_greed', {})
        return Response(response_data, status=status.HTTP_201_CREATED)


class ScreenHistoryView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ScreenRunSerializer

    def get_queryset(self):
        return ScreenRun.objects.filter(user=self.request.user)[:20]


class WatchlistView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tickers = WatchlistTicker.objects.filter(user=request.user)
        return Response(WatchlistTickerSerializer(tickers, many=True).data)

    def post(self, request):
        ser = WatchlistTickerSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        symbol = ser.validated_data['symbol'].upper()
        ticker, created = WatchlistTicker.objects.get_or_create(
            user=request.user,
            symbol=symbol,
            defaults={
                'asset_type': ser.validated_data.get('asset_type', 'stock'),
                'notes': ser.validated_data.get('notes', ''),
            },
        )
        code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(WatchlistTickerSerializer(ticker).data, status=code)


class WatchlistDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            ticker = WatchlistTicker.objects.get(pk=pk, user=request.user)
        except WatchlistTicker.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        ticker.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, pk):
        try:
            ticker = WatchlistTicker.objects.get(pk=pk, user=request.user)
        except WatchlistTicker.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        ser = WatchlistTickerSerializer(ticker, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class FearGreedView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(fetch_fg())


class AskAIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        result = request.data.get('result')
        if not result or not isinstance(result, dict):
            return Response({'detail': 'result dict required.'}, status=status.HTTP_400_BAD_REQUEST)
        fg = fetch_fg()
        data = ask_ai_about(result, fg)
        return Response(data)
