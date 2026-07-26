import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, TrendingUp, TrendingDown, Loader2,
  Star, Plus, X, ChevronDown, ChevronUp,
  Zap, BarChart2, DollarSign, Activity,
  Bot, History, SlidersHorizontal, Newspaper,
  MessageCircle, Brain, AlertTriangle,
} from 'lucide-react'
import clsx from 'clsx'
import api from '../lib/api'

// ── formatters ────────────────────────────────────────────────────────────────
const fmtPrice = (n) => {
  if (n == null) return '—'
  return n < 0.01
    ? `$${n.toFixed(6)}`
    : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
const fmtCap = (n) => {
  if (!n) return null
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  return `$${(n / 1e6).toFixed(0)}M`
}

// ── constants ─────────────────────────────────────────────────────────────────
const UNIVERSES = [
  { value: 'all',       label: 'All',       sub: 'S&P 100 + Crypto' },
  { value: 'stocks',    label: 'Stocks',    sub: 'S&P 100' },
  { value: 'crypto',    label: 'Crypto',    sub: 'Top 20' },
  { value: 'watchlist', label: 'Watchlist', sub: 'My tickers' },
]

const PRESETS = [
  { value: 'all_around',   label: 'All-Around',   icon: BarChart2,  sub: 'Balanced' },
  { value: 'momentum',     label: 'Momentum',     icon: Zap,        sub: 'Price momentum' },
  { value: 'value',        label: 'Value',        icon: DollarSign, sub: 'Undervalued' },
  { value: 'growth',       label: 'Growth',       icon: TrendingUp, sub: 'Revenue growth' },
  { value: 'golden_cross', label: 'Golden Cross', icon: Activity,   sub: 'SMA crossover' },
  { value: 'technical',    label: 'Technical',    icon: BarChart2,  sub: 'Technicals only' },
]

const SIGNALS = {
  'STRONG BUY': { bg: 'bg-emerald-500',  text: 'text-white', border: 'border-emerald-400/30' },
  'BUY':        { bg: 'bg-green-600',    text: 'text-white', border: 'border-green-400/30' },
  'HOLD':       { bg: 'bg-amber-500',    text: 'text-white', border: 'border-amber-400/30' },
  'AVOID':      { bg: 'bg-red-600',      text: 'text-white', border: 'border-red-400/30' },
}

const SENTIMENTS = {
  'Bullish': { text: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  'Bearish': { text: 'text-red-400',     bg: 'bg-red-500/15' },
  'Neutral': { text: 'text-slate-400',   bg: 'bg-slate-500/15' },
  'Mixed':   { text: 'text-amber-400',   bg: 'bg-amber-500/15' },
}

const ACTIONS = {
  'Consider Buying': { text: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  'Watch':           { text: 'text-amber-400',   bg: 'bg-amber-500/15' },
  'Avoid':           { text: 'text-red-400',      bg: 'bg-red-500/15' },
}

// ── Fear & Greed gauge ────────────────────────────────────────────────────────
function FearGreedBanner({ score, label }) {
  const color =
    score >= 75 ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/8' :
    score >= 55 ? 'text-green-400 border-green-500/30 bg-green-500/8' :
    score >= 45 ? 'text-amber-400 border-amber-500/30 bg-amber-500/8' :
    score >= 25 ? 'text-orange-400 border-orange-500/30 bg-orange-500/8' :
                  'text-red-400 border-red-500/30 bg-red-500/8'

  const barColor =
    score >= 75 ? 'bg-emerald-500' :
    score >= 55 ? 'bg-green-500' :
    score >= 45 ? 'bg-amber-500' :
    score >= 25 ? 'bg-orange-500' : 'bg-red-500'

  return (
    <div className={clsx('border rounded-xl px-4 py-3 flex items-center gap-4', color)}>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Brain size={15} className="opacity-70" />
        <span className="text-xs font-semibold uppercase tracking-wider opacity-70">Fear & Greed</span>
      </div>
      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${score}%` }} />
      </div>
      <div className="flex items-baseline gap-1.5 flex-shrink-0">
        <span className="text-xl font-bold tabular-nums">{score}</span>
        <span className="text-sm font-medium opacity-80">{label}</span>
      </div>
    </div>
  )
}

// ── helpers ───────────────────────────────────────────────────────────────────
function ChangeChip({ value }) {
  if (value == null) return null
  const up = value >= 0
  return (
    <span className={clsx('inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded',
      up ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {Math.abs(value).toFixed(2)}%
    </span>
  )
}

function MiniBar({ value, max, color }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const colors = { violet: 'bg-violet-500', blue: 'bg-blue-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500' }
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colors[color]}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-7 text-right tabular-nums">{Math.round(value)}</span>
    </div>
  )
}

function SentimentBadge({ label }) {
  const cfg = SENTIMENTS[label] || SENTIMENTS['Neutral']
  return (
    <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full', cfg.bg, cfg.text)}>
      {label}
    </span>
  )
}

// ── Ask AI panel ──────────────────────────────────────────────────────────────
function AskAIPanel({ result }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  const handleAsk = async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await api.post('/screener/ask-ai/', { result })
      setData(res.data)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  if (!data && !loading && !err) {
    return (
      <button
        onClick={handleAsk}
        className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-violet-300 bg-violet-600/10 hover:bg-violet-600/20 border border-violet-500/20 rounded-xl transition-colors"
      >
        <Bot size={13} /> Ask AI for Deep Analysis
      </button>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 text-xs text-slate-400">
        <Loader2 size={13} className="animate-spin text-violet-400" /> Analyzing with Claude…
      </div>
    )
  }

  if (err) {
    return <p className="text-xs text-red-400 py-2">{err}</p>
  }

  const actionCfg = ACTIONS[data.suggested_action] || ACTIONS['Watch']
  const viewCfg = SENTIMENTS[data.overall_view] || SENTIMENTS['Neutral']

  return (
    <div className="space-y-3 pt-1">
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={clsx('text-sm font-bold px-2.5 py-1 rounded-lg', viewCfg.bg, viewCfg.text)}>
          {data.overall_view}
        </span>
        <span className="text-xs text-slate-500">Confidence:</span>
        <span className="text-xs font-semibold text-slate-300">{data.confidence}</span>
        <span className={clsx('ml-auto text-xs font-bold px-2.5 py-1 rounded-lg', actionCfg.bg, actionCfg.text)}>
          {data.suggested_action}
        </span>
      </div>

      {/* Reasons */}
      {data.reasons?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-1.5">Why</p>
          <ul className="space-y-1">
            {data.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-300">
                <span className="text-emerald-400 mt-0.5 flex-shrink-0">✓</span> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risks */}
      {data.risks?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
            <AlertTriangle size={11} className="text-amber-400" /> Risks
          </p>
          <ul className="space-y-1">
            {data.risks.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-400">
                <span className="text-amber-400 mt-0.5 flex-shrink-0">•</span> {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── result card ───────────────────────────────────────────────────────────────
function ResultCard({ r, watchlistIds, onWatchlistToggle }) {
  const [expanded, setExpanded] = useState(false)
  const inWatchlist = watchlistIds.has(r.symbol)
  const signalCfg = SIGNALS[r.signal] || SIGNALS['HOLD']
  const cap = fmtCap(r.market_cap)
  const hasSentiment = r.news_sentiment && r.news_sentiment !== 'Neutral'
  const hasBuzz = r.buzz_score > 0

  return (
    <div className="bg-slate-800/60 border border-white/8 rounded-2xl overflow-hidden hover:border-violet-500/25 transition-all duration-200 flex flex-col">
      {/* Signal strip */}
      {r.signal && (
        <div className={clsx('h-0.5', signalCfg.bg)} />
      )}

      <div className="p-4 flex-1 space-y-3">
        {/* Top row: symbol + signal + star */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-white">{r.symbol}</span>
              {r.is_crypto && (
                <span className="text-xs bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded font-medium">CRYPTO</span>
              )}
            </div>
            <p className="text-xs text-slate-500 truncate mt-0.5">{r.name}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {r.signal && (
              <span className={clsx('text-xs font-bold px-2 py-1 rounded-lg', signalCfg.bg, signalCfg.text)}>
                {r.signal}
              </span>
            )}
            <button
              onClick={() => onWatchlistToggle(r)}
              className={clsx('p-1.5 rounded-lg transition-colors', inWatchlist ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400')}
            >
              <Star size={13} fill={inWatchlist ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>

        {/* Price */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base font-semibold text-white">{fmtPrice(r.last_price)}</span>
          <ChangeChip value={r.change_1d} />
          <span className="text-xs text-slate-600">1D</span>
          <ChangeChip value={r.change_1m} />
          <span className="text-xs text-slate-600">1M</span>
          {cap && <span className="text-xs text-slate-500 ml-auto">{cap}</span>}
        </div>

        {/* Scores */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 w-14 flex-shrink-0">Total</span>
            <MiniBar value={r.total_score} max={100} color="violet" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-14 flex-shrink-0">Tech</span>
            <MiniBar value={r.tech_score} max={50} color="blue" />
          </div>
          {!r.is_crypto && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-14 flex-shrink-0">Fund</span>
              <MiniBar value={r.fund_score} max={50} color="emerald" />
            </div>
          )}
        </div>

        {/* News + Reddit row */}
        <div className="flex items-center gap-2 flex-wrap pt-0.5">
          {r.news_sentiment && (
            <div className="flex items-center gap-1">
              <Newspaper size={10} className="text-slate-500" />
              <SentimentBadge label={r.news_sentiment} />
            </div>
          )}
          {hasBuzz && (
            <div className="flex items-center gap-1 ml-auto">
              <MessageCircle size={10} className="text-slate-500" />
              <span className="text-xs text-slate-400">Buzz</span>
              <MiniBar value={r.buzz_score} max={100} color="amber" />
            </div>
          )}
          {r.crowd_sentiment && r.crowd_sentiment !== 'Mixed' && (
            <SentimentBadge label={r.crowd_sentiment} />
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between text-xs text-slate-500 hover:text-slate-300 transition-colors pt-1 border-t border-white/5"
        >
          <span>Details & AI Analysis</span>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="space-y-4 pt-1">
            {/* Thesis */}
            {r.thesis && (
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-1">AI Thesis</p>
                <p className="text-xs text-slate-300 leading-relaxed">{r.thesis}</p>
              </div>
            )}

            {/* AI Risks */}
            {r.ai_risks?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1">
                  <AlertTriangle size={10} className="text-amber-400" /> Key Risks
                </p>
                <ul className="space-y-0.5">
                  {r.ai_risks.map((risk, i) => (
                    <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                      <span className="text-amber-400 flex-shrink-0 mt-0.5">•</span> {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* News detail */}
            {(r.news_summary || r.news_key_risk) && (
              <div className="bg-slate-900/50 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                  <Newspaper size={10} /> News Summary
                </p>
                {r.news_summary && <p className="text-xs text-slate-300">{r.news_summary}</p>}
                {r.news_key_risk && (
                  <p className="text-xs text-amber-400/80 flex items-start gap-1">
                    <AlertTriangle size={10} className="flex-shrink-0 mt-0.5" /> {r.news_key_risk}
                  </p>
                )}
              </div>
            )}

            {/* Reddit detail */}
            {r.reddit_top_thesis && r.reddit_top_thesis !== 'No Reddit data' && (
              <div className="bg-slate-900/50 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                  <MessageCircle size={10} /> Reddit Crowd
                  {r.crowd_sentiment && <SentimentBadge label={r.crowd_sentiment} />}
                </p>
                <p className="text-xs text-slate-300">{r.reddit_top_thesis}</p>
              </div>
            )}

            {/* Technical signals */}
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-1.5">Technical Signals</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {Object.entries(r.tech_signals).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-slate-600 capitalize">{k.replace(/_/g, ' ')}</span>
                    <span className="text-slate-400 text-right ml-1 truncate max-w-[100px]">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ask AI */}
            <div className="border-t border-white/5 pt-3">
              <AskAIPanel result={r} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── watchlist panel ───────────────────────────────────────────────────────────
function WatchlistPanel({ watchlist, onRemove, onAdd }) {
  const [input, setInput] = useState('')
  const [assetType, setAssetType] = useState('stock')

  const handleAdd = (e) => {
    e.preventDefault()
    if (!input.trim()) return
    onAdd({ symbol: input.trim().toUpperCase(), asset_type: assetType })
    setInput('')
  }

  return (
    <div className="bg-slate-800/50 border border-white/8 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <Star size={13} className="text-amber-400" /> Watchlist
      </h3>
      <form onSubmit={handleAdd} className="flex gap-1.5 mb-3">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="AAPL or BTC-USD"
          className="flex-1 bg-slate-700/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
        />
        <select
          value={assetType}
          onChange={e => setAssetType(e.target.value)}
          className="bg-slate-700/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
        >
          <option value="stock">Stock</option>
          <option value="crypto">Crypto</option>
        </select>
        <button type="submit" className="bg-violet-600 hover:bg-violet-500 text-white px-2.5 py-1.5 rounded-lg transition-colors">
          <Plus size={13} />
        </button>
      </form>
      <div className="space-y-0.5 max-h-52 overflow-y-auto">
        {watchlist.length === 0 && <p className="text-xs text-slate-600 text-center py-3">No tickers saved.</p>}
        {watchlist.map(t => (
          <div key={t.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 group">
            <div>
              <span className="text-sm font-medium text-white">{t.symbol}</span>
              <span className="text-xs text-slate-600 ml-2">{t.asset_type}</span>
            </div>
            <button onClick={() => onRemove(t.id)} className="text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function Screener() {
  const qc = useQueryClient()
  const [universe, setUniverse] = useState('all')
  const [preset, setPreset] = useState('all_around')
  const [currentRun, setCurrentRun] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showConfig, setShowConfig] = useState(true)

  const { data: watchlist = [] } = useQuery({
    queryKey: ['screener-watchlist'],
    queryFn: () => api.get('/screener/watchlist/').then(r => r.data),
  })

  const { data: fearGreed } = useQuery({
    queryKey: ['fear-greed'],
    queryFn: () => api.get('/screener/fear-greed/').then(r => r.data),
    staleTime: 15 * 60 * 1000,
  })

  const { data: history = [] } = useQuery({
    queryKey: ['screener-history'],
    queryFn: () => api.get('/screener/history/').then(r => r.data),
    enabled: showHistory,
  })

  const runMutation = useMutation({
    mutationFn: () => api.post('/screener/run/', { universe, preset }).then(r => r.data),
    onSuccess: (data) => {
      setCurrentRun(data)
      setShowConfig(false)
      qc.invalidateQueries({ queryKey: ['screener-history'] })
    },
  })

  const addWatchlist = useMutation({
    mutationFn: (data) => api.post('/screener/watchlist/', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['screener-watchlist'] }),
  })
  const removeWatchlist = useMutation({
    mutationFn: (id) => api.delete(`/screener/watchlist/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['screener-watchlist'] }),
  })

  const handleWatchlistToggle = (r) => {
    const existing = watchlist.find(t => t.symbol === r.symbol)
    if (existing) removeWatchlist.mutate(existing.id)
    else addWatchlist.mutate({ symbol: r.symbol, asset_type: r.is_crypto ? 'crypto' : 'stock' })
  }

  const watchlistIds = new Set(watchlist.map(t => t.symbol))
  const results = currentRun?.results || []
  const fg = currentRun?.fear_greed || fearGreed

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Top bar */}
      <div className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Stock Screener</h1>
          <p className="text-xs text-slate-500 mt-0.5">Technical · Fundamental · News · Reddit Buzz · Claude AI</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfig(s => !s)}
            className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors',
              showConfig ? 'bg-violet-600/20 border-violet-500/40 text-violet-300' : 'border-white/10 text-slate-400 hover:text-white')}
          >
            <SlidersHorizontal size={13} /> Config
          </button>
          <button
            onClick={() => setShowHistory(s => !s)}
            className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors',
              showHistory ? 'bg-slate-700 border-white/20 text-white' : 'border-white/10 text-slate-400 hover:text-white')}
          >
            <History size={13} /> History
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Fear & Greed banner */}
        {fg && <FearGreedBanner score={fg.score} label={fg.label} />}

        {/* Config panel */}
        {showConfig && (
          <div className="bg-slate-800/50 border border-white/8 rounded-2xl p-5 space-y-5">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Universe</label>
                <div className="grid grid-cols-2 gap-2">
                  {UNIVERSES.map(u => (
                    <button key={u.value} onClick={() => setUniverse(u.value)}
                      className={clsx('px-3 py-2.5 rounded-xl border text-left transition-all',
                        universe === u.value ? 'bg-violet-600/20 border-violet-500/50 text-violet-200' : 'bg-slate-700/30 border-white/5 text-slate-400 hover:border-white/20 hover:text-slate-200')}>
                      <div className="text-sm font-medium">{u.label}</div>
                      <div className="text-xs opacity-60 mt-0.5">{u.sub}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Strategy</label>
                <div className="grid grid-cols-3 gap-2">
                  {PRESETS.map(p => {
                    const Icon = p.icon
                    return (
                      <button key={p.value} onClick={() => setPreset(p.value)}
                        className={clsx('px-2.5 py-2.5 rounded-xl border text-left transition-all',
                          preset === p.value ? 'bg-violet-600/20 border-violet-500/50 text-violet-200' : 'bg-slate-700/30 border-white/5 text-slate-400 hover:border-white/20 hover:text-slate-200')}>
                        <Icon size={13} className="mb-1" />
                        <div className="text-xs font-medium">{p.label}</div>
                        <div className="text-xs opacity-50 mt-0.5">{p.sub}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <button
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {runMutation.isPending
                ? <><Loader2 size={15} className="animate-spin" /> Screening… (30–90 s)</>
                : <><Search size={15} /> Run Screen</>}
            </button>
          </div>
        )}

        {runMutation.isError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">
            {runMutation.error?.response?.data?.detail || 'Screen failed. Check server logs.'}
          </div>
        )}

        {/* History */}
        {showHistory && history.length > 0 && (
          <div className="bg-slate-800/50 border border-white/8 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/8">
              <h3 className="text-sm font-semibold text-white">Recent Screens</h3>
            </div>
            <div className="divide-y divide-white/5">
              {history.map(h => (
                <button key={h.id} onClick={() => { setCurrentRun(h); setShowHistory(false) }}
                  className="w-full text-left px-4 py-3 hover:bg-white/3 transition-colors flex items-center justify-between">
                  <div>
                    <span className="text-sm text-white">
                      {UNIVERSES.find(u => u.value === h.universe)?.label} · {PRESETS.find(p => p.value === h.preset)?.label}
                    </span>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {h.total_screened} screened · top {h.results[0]?.total_score ?? '—'}/100
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">{new Date(h.created_at).toLocaleDateString()}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {currentRun && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-3">
                <span className="text-white font-semibold text-sm">{results.length} top picks</span>
                <span>from {currentRun.total_screened} screened</span>
                <span>· {currentRun.duration_s}s</span>
              </div>
              <span>{UNIVERSES.find(u => u.value === currentRun.universe)?.label} · {PRESETS.find(p => p.value === currentRun.preset)?.label}</span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-5">
              {/* Cards + market commentary */}
              <div className="space-y-5">
                {/* Market commentary */}
                {currentRun.ai_summary && (
                  <div className="bg-violet-950/40 border border-violet-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
                    <Bot size={15} className="text-violet-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-violet-300 mb-1">Market Commentary</p>
                      <p className="text-sm text-slate-300 leading-relaxed">{currentRun.ai_summary}</p>
                    </div>
                  </div>
                )}

                {/* Card grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {results.map(r => (
                    <ResultCard
                      key={r.symbol}
                      r={r}
                      watchlistIds={watchlistIds}
                      onWatchlistToggle={handleWatchlistToggle}
                    />
                  ))}
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                <WatchlistPanel
                  watchlist={watchlist}
                  onRemove={(id) => removeWatchlist.mutate(id)}
                  onAdd={(data) => addWatchlist.mutate(data)}
                />

                {/* Legend */}
                <div className="bg-slate-800/50 border border-white/8 rounded-xl p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Signals</h3>
                  {Object.entries(SIGNALS).map(([sig, cfg]) => (
                    <div key={sig} className="flex items-center gap-2">
                      <span className={clsx('text-xs font-bold px-2 py-0.5 rounded', cfg.bg, cfg.text)}>{sig}</span>
                      <span className="text-xs text-slate-500">
                        {sig === 'STRONG BUY' ? 'High conviction' : sig === 'BUY' ? 'Positive outlook' : sig === 'HOLD' ? 'Neutral / wait' : 'Avoid for now'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {!currentRun && !runMutation.isPending && (
          <div className="text-center py-20 text-slate-600">
            <Search size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Configure and run the screener to see results.</p>
          </div>
        )}
      </div>
    </div>
  )
}
