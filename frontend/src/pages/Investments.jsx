import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import {
  Plus, X, TrendingUp, TrendingDown, RefreshCw, ChevronDown, ChevronRight,
  ArrowDownCircle, ArrowUpCircle, DollarSign, Wallet, Pencil, Trash2,
} from 'lucide-react'
import api from '../lib/api'
import clsx from 'clsx'

// ── Formatters ────────────────────────────────────────────────────────────────

const fmt  = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = (n) => {
  const v = Number(n)
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}k`
  return fmt(v)
}
const fmtQty = (n) => {
  const v = Number(n)
  return v % 1 === 0 ? v.toString() : v.toFixed(4).replace(/\.?0+$/, '')
}

const COLORS = ['#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#3b82f6','#84cc16']

// ── Shared input style ────────────────────────────────────────────────────────
const inp = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500'

// ── Trade Modal ───────────────────────────────────────────────────────────────

function TradeModal({ portfolioId, holding, initialType = 'buy', onClose }) {
  const qc = useQueryClient()
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: { trade_type: initialType, quantity: '', price: String(Number(holding.current_price) || ''), fees: '0', date: new Date().toISOString().slice(0, 10), notes: '', account_id: '' },
  })
  const tradeType = watch('trade_type')

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts/').then((r) => r.data.results ?? r.data),
  })
  const accounts = (accountsData ?? []).filter((a) => a.account_type !== 'credit_card')

  const { mutate, isPending, error } = useMutation({
    mutationFn: (d) => api.post(
      `/investments/portfolios/${portfolioId}/holdings/${holding.id}/trades/`, d
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
  })

  const onSubmit = (d) => {
    const payload = { ...d }
    if (!payload.account_id) delete payload.account_id
    mutate(payload)
  }

  const isBuy = tradeType === 'buy'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {isBuy ? 'Buy' : 'Sell'} {holding.symbol || holding.name}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Held: {fmtQty(holding.quantity)} units · Avg cost: {fmt(holding.average_cost_basis)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Buy / Sell toggle */}
          <div className="flex gap-2">
            {['buy', 'sell'].map((t) => (
              <label key={t} className={clsx(
                'flex-1 text-center py-2 rounded-lg text-sm font-medium cursor-pointer border transition-colors',
                watch('trade_type') === t
                  ? t === 'buy' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-red-600 border-red-600 text-white'
                  : 'border-gray-700 text-gray-400 hover:text-white'
              )}>
                <input type="radio" value={t} {...register('trade_type')} className="sr-only" />
                {t === 'buy' ? '▲ Buy' : '▼ Sell'}
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Quantity</label>
              <input type="number" step="any" min="0.00000001"
                {...register('quantity', { required: true, min: 0.00000001 })}
                className={inp} placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Price per unit ($)</label>
              <input type="number" step="any" min="0"
                {...register('price', { required: true, min: 0 })}
                className={inp} placeholder="0.00" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Fees ($)</label>
              <input type="number" step="0.01" min="0"
                {...register('fees')} className={inp} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Date</label>
              <input type="date" {...register('date', { required: true })} className={inp} />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">
              {isBuy ? 'Debit from account' : 'Credit to account'}{' '}
              <span className="text-gray-600">(optional)</span>
            </label>
            <select {...register('account_id')} className={inp}>
              <option value="">— Portfolio cash only —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Notes</label>
            <input {...register('notes')} className={inp} placeholder="Optional" />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error.response?.data?.detail || 'An error occurred'}</p>
          )}

          <button type="submit" disabled={isPending}
            className={clsx(
              'w-full py-2.5 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50',
              isBuy ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
            )}>
            {isPending ? 'Recording…' : isBuy ? '▲ Record Buy' : '▼ Record Sell'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Cash Deposit Modal ────────────────────────────────────────────────────────

function CashDepositModal({ portfolio, onClose }) {
  const qc = useQueryClient()
  const { register, handleSubmit } = useForm({
    defaultValues: { amount: '', date: new Date().toISOString().slice(0, 10), notes: '', account_id: '' },
  })

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts/').then((r) => r.data.results ?? r.data),
  })
  const accounts = (accountsData ?? []).filter((a) => a.account_type !== 'credit_card')

  const { mutate, isPending, error } = useMutation({
    mutationFn: (d) => api.post(`/investments/portfolios/${portfolio.id}/deposit/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Add Cash to {portfolio.name}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit((d) => mutate({ ...d, account_id: d.account_id || undefined }))} className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Amount ($)</label>
            <input type="number" step="0.01" min="0.01"
              {...register('amount', { required: true })} className={inp} placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Source account <span className="text-gray-600">(optional)</span></label>
            <select {...register('account_id')} className={inp}>
              <option value="">— No account debit —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Date</label>
            <input type="date" {...register('date')} className={inp} />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Notes</label>
            <input {...register('notes')} className={inp} placeholder="Optional" />
          </div>
          {error && <p className="text-xs text-red-400">{error.response?.data?.detail || 'Error'}</p>}
          <button type="submit" disabled={isPending}
            className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {isPending ? 'Depositing…' : 'Add Cash'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Add Holding Modal ─────────────────────────────────────────────────────────

function AddHoldingModal({ portfolioId, cashBalance = 0, onClose }) {
  const qc = useQueryClient()
  const { register, handleSubmit, watch } = useForm({
    defaultValues: {
      asset_type: 'stock', symbol: '', name: '', quantity: '', average_cost_basis: '',
      fund_from_cash: false,
    },
  })
  const assetType = watch('asset_type')
  const { mutate, isPending, error } = useMutation({
    mutationFn: (d) => api.post(`/investments/portfolios/${portfolioId}/holdings/`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['portfolios'] }); onClose() },
  })
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Add Holding</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit((d) => mutate(d))} className="space-y-4">
          <select {...register('asset_type')} className={inp}>
            {['stock','etf','mutual_fund','crypto','bond','real_estate','cash','commodity','other'].map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input {...register('symbol')} placeholder="Symbol (e.g. AAPL)" className={inp} />
            <input {...register('name', { required: true })} placeholder="Name *" className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Quantity</label>
              <input type="number" step="any" {...register('quantity', { required: true })} className={inp} />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Avg Cost Basis ($)</label>
              <input type="number" step="any" {...register('average_cost_basis', { required: true })} className={inp} />
            </div>
          </div>
          {assetType !== 'cash' && (
            <label className="flex items-start gap-2 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" {...register('fund_from_cash')} className="mt-0.5" />
              <span>
                Deduct cost from portfolio cash
                <span className="block text-gray-600">
                  Available: {fmt(cashBalance)} — use this if you paid for this position with cash already in the portfolio.
                </span>
              </span>
            </label>
          )}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
              {Object.entries(error.response?.data ?? {}).map(([k, v]) =>
                `${k}: ${Array.isArray(v) ? v.join(', ') : v}`
              ).join(' · ') || 'An error occurred'}
            </p>
          )}
          <button type="submit" disabled={isPending}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
            {isPending ? 'Saving…' : 'Add Holding'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Edit Holding Modal ────────────────────────────────────────────────────────

function EditHoldingModal({ holding, portfolioId, onClose }) {
  const qc = useQueryClient()
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      asset_type:         holding.asset_type,
      symbol:             holding.symbol,
      name:               holding.name,
      quantity:           String(Number(holding.quantity)),
      average_cost_basis: String(Number(holding.average_cost_basis)),
    },
  })

  const { mutate, isPending, error } = useMutation({
    mutationFn: (d) => api.patch(
      `/investments/portfolios/${portfolioId}/holdings/${holding.id}/`, d
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Edit Holding</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit((d) => mutate(d))} className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Asset Type</label>
            <select {...register('asset_type')} className={inp}>
              {['stock','etf','mutual_fund','crypto','bond','real_estate','cash','commodity','other'].map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Symbol</label>
              <input {...register('symbol')} placeholder="e.g. AAPL" className={inp} />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Name *</label>
              <input {...register('name', { required: true })} className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Quantity</label>
              <input type="number" step="any" min="0"
                {...register('quantity', { required: true })} className={inp} />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Avg Cost Basis ($)</label>
              <input type="number" step="any" min="0"
                {...register('average_cost_basis', { required: true })} className={inp} />
            </div>
          </div>
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
              {Object.entries(error.response?.data ?? {}).map(([k, v]) =>
                `${k}: ${Array.isArray(v) ? v.join(', ') : v}`
              ).join(' · ') || 'An error occurred'}
            </p>
          )}
          <button type="submit" disabled={isPending}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Trade History Row ─────────────────────────────────────────────────────────

function TradeHistoryRow({ trade, portfolioId, holdingId }) {
  const qc = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(
      `/investments/portfolios/${portfolioId}/holdings/${holdingId}/trades/${trade.id}/`
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
  const isBuy = trade.trade_type === 'buy'
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-800/60 last:border-0 text-xs">
      <span className={clsx(
        'px-2 py-0.5 rounded-full font-semibold text-xs flex-shrink-0',
        isBuy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
      )}>
        {isBuy ? '▲ BUY' : '▼ SELL'}
      </span>
      <span className="text-gray-300 flex-1">{fmtQty(trade.quantity)} @ {fmt(trade.price)}</span>
      {trade.fees > 0 && <span className="text-gray-600">fee {fmt(trade.fees)}</span>}
      {trade.realized_pnl != null && (
        <span className={clsx('font-semibold', Number(trade.realized_pnl) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
          P&L {Number(trade.realized_pnl) >= 0 ? '+' : ''}{fmt(trade.realized_pnl)}
        </span>
      )}
      <span className="text-gray-600">{trade.date}</span>
      {trade.account_name && <span className="text-gray-600 truncate max-w-[80px]">{trade.account_name}</span>}
      <button
        onClick={() => { if (window.confirm('Delete this trade?')) deleteMutation.mutate() }}
        className="text-gray-700 hover:text-red-400 transition-colors ml-auto flex-shrink-0"
      >
        <X size={12} />
      </button>
    </div>
  )
}

// ── Holding Row ───────────────────────────────────────────────────────────────

function HoldingRow({ holding, portfolioId, portfolio }) {
  const qc = useQueryClient()
  const [expanded,   setExpanded]   = useState(false)
  const [tradeModal, setTradeModal] = useState(null)   // 'buy' | 'sell' | null
  const [showEdit,   setShowEdit]   = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(
      `/investments/portfolios/${portfolioId}/holdings/${holding.id}/`
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
  })

  const gainPct    = Number(holding.unrealized_gain_loss_pct)
  const gainAbs    = Number(holding.unrealized_gain_loss)
  const realizedPnl = Number(holding.total_realized_pnl ?? 0)
  const isCash     = holding.asset_type === 'cash' || holding.symbol === 'CASH'

  const priceAge = holding.price_last_updated
    ? Math.round((Date.now() - new Date(holding.price_last_updated)) / 60000)
    : null

  return (
    <>
      <div className="py-3 border-b border-gray-800 last:border-0">
        <div className="flex items-center gap-3">
          {/* Expand toggle */}
          <button onClick={() => setExpanded((v) => !v)} className="text-gray-600 hover:text-gray-400 flex-shrink-0">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {/* Icon */}
          <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-xs font-bold text-violet-400 flex-shrink-0">
            {isCash ? <DollarSign size={14} /> : (holding.symbol || holding.name).slice(0, 3).toUpperCase()}
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-white truncate">{holding.symbol || holding.name}</p>
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 capitalize flex-shrink-0">
                {holding.asset_type.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-gray-500">
                <span className="text-gray-600">Qty</span>{' '}
                <span className="text-gray-300 font-medium">{fmtQty(holding.quantity)}</span>
              </span>
              {!isCash && (
                <span className="text-xs text-gray-500">
                  <span className="text-gray-600">Avg</span>{' '}
                  <span className="text-gray-300 font-medium">{fmt(holding.average_cost_basis)}</span>
                </span>
              )}
            </div>
          </div>

          {/* Live price column */}
          {!isCash && (
            <div className="text-center flex-shrink-0 w-24 hidden sm:block">
              {holding.price_last_updated ? (
                <>
                  <p className="text-sm font-semibold text-white">{fmt(holding.current_price)}</p>
                  <p className="text-xs text-gray-600">
                    {priceAge < 60 ? `${priceAge}m ago` : `${Math.round(priceAge / 60)}h ago`}
                  </p>
                </>
              ) : (
                <p className="text-xs text-gray-700 italic">—</p>
              )}
            </div>
          )}

          {/* Value + gain */}
          <div className="text-right flex-shrink-0 min-w-[90px]">
            <p className="text-sm font-semibold text-white">{fmt(holding.current_value)}</p>
            {!isCash && (
              <p className={clsx('text-xs font-medium', gainPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {gainPct >= 0 ? '+' : ''}{Math.abs(gainPct).toFixed(2)}%
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {!isCash && (
              <>
                <button
                  onClick={() => setTradeModal('buy')}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 rounded-lg transition-colors"
                >
                  <ArrowDownCircle size={11} /> Buy
                </button>
                <button
                  onClick={() => setTradeModal('sell')}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg transition-colors"
                >
                  <ArrowUpCircle size={11} /> Sell
                </button>
              </>
            )}
            <button
              onClick={() => setShowEdit(true)}
              className="p-1.5 text-gray-600 hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-colors"
              title="Edit holding"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Delete ${holding.symbol || holding.name}? This will also delete all its trades.`))
                  deleteMutation.mutate()
              }}
              disabled={deleteMutation.isPending}
              className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-40"
              title="Delete holding"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Realized P&L summary */}
        {!isCash && realizedPnl !== 0 && (
          <div className="ml-12 mt-1">
            <span className="text-xs text-gray-600">
              Realized P&L: <span className={clsx('font-medium', realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {realizedPnl >= 0 ? '+' : ''}{fmt(realizedPnl)}
              </span>
            </span>
          </div>
        )}

        {/* Trade history (expanded) */}
        {expanded && holding.trades?.length > 0 && (
          <div className="ml-12 mt-3 bg-gray-800/40 rounded-lg p-3">
            <p className="text-xs text-gray-500 font-semibold mb-2">Trade History</p>
            {holding.trades.map((t) => (
              <TradeHistoryRow
                key={t.id} trade={t}
                portfolioId={portfolioId}
                holdingId={holding.id}
              />
            ))}
          </div>
        )}
        {expanded && (!holding.trades || holding.trades.length === 0) && (
          <div className="ml-12 mt-2 text-xs text-gray-600">No trades recorded yet.</div>
        )}
      </div>

      {tradeModal && (
        <TradeModal
          portfolioId={portfolioId}
          holding={holding}
          initialType={tradeModal}
          onClose={() => setTradeModal(null)}
        />
      )}
      {showEdit && (
        <EditHoldingModal
          holding={holding}
          portfolioId={portfolioId}
          onClose={() => setShowEdit(false)}
        />
      )}
    </>
  )
}

// ── Closed / Sold Holding Row ─────────────────────────────────────────────────

function ClosedHoldingRow({ holding, portfolioId }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/investments/portfolios/${portfolioId}/holdings/${holding.id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] })
    },
  })

  const realizedPnl  = Number(holding.total_realized_pnl ?? 0)
  const lastSellDate = holding.trades?.find((t) => t.trade_type === 'sell')?.date ?? null

  return (
    <div className="py-2.5 border-b border-gray-800/50 last:border-0">
      <div className="flex items-center gap-3">
        <button onClick={() => setExpanded((v) => !v)} className="text-gray-700 hover:text-gray-500 flex-shrink-0">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <div className="w-8 h-8 rounded-lg bg-gray-800/50 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
          {(holding.symbol || holding.name).slice(0, 3).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-500 truncate">{holding.symbol || holding.name}</p>
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-600 capitalize">
              {holding.asset_type.replace(/_/g, ' ')}
            </span>
          </div>
          {lastSellDate && <p className="text-xs text-gray-700 mt-0.5">Sold {lastSellDate}</p>}
        </div>
        <div className="text-right flex-shrink-0 min-w-[100px]">
          <p className={clsx('text-sm font-semibold', realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {realizedPnl >= 0 ? '+' : ''}{fmt(realizedPnl)}
          </p>
          <p className="text-xs text-gray-600">Realized P&amp;L</p>
        </div>
        <button
          onClick={() => {
            if (window.confirm(`Remove ${holding.symbol || holding.name} from history?`))
              deleteMutation.mutate()
          }}
          disabled={deleteMutation.isPending}
          className="p-1.5 text-gray-700 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-40 flex-shrink-0"
          title="Remove from history"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {expanded && holding.trades?.length > 0 && (
        <div className="ml-11 mt-3 bg-gray-800/40 rounded-lg p-3">
          <p className="text-xs text-gray-500 font-semibold mb-2">Trade History</p>
          {holding.trades.map((t) => (
            <TradeHistoryRow key={t.id} trade={t} portfolioId={portfolioId} holdingId={holding.id} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Portfolio Card ────────────────────────────────────────────────────────────

function PortfolioCard({ portfolio }) {
  const qc = useQueryClient()
  const [collapsed,       setCollapsed]       = useState(true)
  const [showAddHolding,  setShowAddHolding]  = useState(false)
  const [showCashDeposit, setShowCashDeposit] = useState(false)
  const [editing,         setEditing]         = useState(false)
  const [editName,        setEditName]        = useState(portfolio.name)
  const [editDesc,        setEditDesc]        = useState(portfolio.description ?? '')

  const refreshMutation = useMutation({
    mutationFn: () => api.post(`/investments/portfolios/${portfolio.id}/refresh-prices/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolios'] }),
  })

  const editMutation = useMutation({
    mutationFn: (d) => api.patch(`/investments/portfolios/${portfolio.id}/`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['portfolios'] }); setEditing(false) },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/investments/portfolios/${portfolio.id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolios'] }),
  })

  const allHoldings  = portfolio.holdings ?? []
  const cash         = allHoldings.filter((h) => h.asset_type === 'cash' || h.symbol === 'CASH')
  const nonCash      = allHoldings.filter((h) => h.asset_type !== 'cash' && h.symbol !== 'CASH')
  const activeNonCash  = nonCash.filter((h) => Number(h.quantity) > 0)
  const closedHoldings = nonCash.filter((h) => Number(h.quantity) === 0)
  const cashBal = cash.reduce((s, h) => s + Number(h.current_value), 0)

  const totalGain   = Number(portfolio.total_gain_loss ?? 0)
  const totalValue  = Number(portfolio.total_value ?? 0)
  const totalCost   = Number(portfolio.total_cost ?? 0)
  const gainPct     = totalCost > 0 ? ((totalGain / totalCost) * 100).toFixed(2) : '0.00'

  // Pie data — active holdings only
  const pieData = activeNonCash
    .filter((h) => Number(h.current_value) > 0)
    .sort((a, b) => Number(b.current_value) - Number(a.current_value))
    .slice(0, 8)
    .map((h) => ({ name: h.symbol || h.name, value: Number(h.current_value) }))

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800">
      {/* Header — always visible, click chevron or name to collapse */}
      <div className="flex items-center justify-between p-5">
        {/* Left: chevron + name */}
        <div
          className="flex items-center gap-3 min-w-0 cursor-pointer select-none flex-1"
          onClick={() => !editing && setCollapsed((v) => !v)}
        >
          <span className="text-gray-500 flex-shrink-0">
            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-white text-base leading-tight">{portfolio.name}</p>
            {portfolio.description && !editing && (
              <p className="text-xs text-gray-600 truncate mt-0.5">{portfolio.description}</p>
            )}
            <p className="text-xs text-gray-500 mt-0.5">
              {portfolio.holdings?.length ?? 0} holdings ·
              Total: <span className="text-emerald-400 font-medium">{fmt(totalValue)}</span>
              {!collapsed && cashBal > 0 && <span className="text-gray-600"> · Cash: {fmt(cashBal)}</span>}
              {collapsed && totalCost > 0 && (
                <span className={clsx('ml-2 font-medium', totalGain >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {totalGain >= 0 ? '▲ +' : '▼ '}{fmt(Math.abs(totalGain))} ({totalGain >= 0 ? '+' : ''}{gainPct}%)
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
          <button
            onClick={() => setShowCashDeposit(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-violet-400 hover:text-white border border-violet-500/30 hover:border-violet-400 rounded-lg transition-colors"
          >
            <Wallet size={12} /> Add Cash
          </button>
          <button
            onClick={() => setShowAddHolding(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg transition-colors"
          >
            <Plus size={12} /> Holding
          </button>
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            title="Fetch live prices"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-400 hover:text-violet-400 border border-gray-700 hover:border-violet-500/50 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={clsx(refreshMutation.isPending && 'animate-spin')} />
            {refreshMutation.isPending ? 'Fetching…' : 'Refresh Prices'}
          </button>
          {/* Edit */}
          <button
            onClick={() => { setEditName(portfolio.name); setEditDesc(portfolio.description ?? ''); setEditing(true) }}
            className="p-1.5 text-gray-600 hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-colors"
            title="Rename portfolio"
          >
            <Pencil size={13} />
          </button>
          {/* Delete */}
          <button
            onClick={() => {
              if (window.confirm(`Delete portfolio "${portfolio.name}" and all its holdings?`))
                deleteMutation.mutate()
            }}
            disabled={deleteMutation.isPending}
            className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-40"
            title="Delete portfolio"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="mx-5 mb-4 p-4 bg-gray-800/60 rounded-xl border border-gray-700 space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Portfolio Name</label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className={inp}
              placeholder="Portfolio name"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Description <span className="text-gray-600">(optional)</span></label>
            <input
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className={inp}
              placeholder="e.g. Long-term holdings"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => editMutation.mutate({ name: editName.trim(), description: editDesc })}
              disabled={editMutation.isPending || !editName.trim()}
              className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {editMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-4 py-1.5 text-gray-400 hover:text-white text-xs rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Collapsible body */}
      {!collapsed && (
        <div className="px-5 pb-5">
          {/* P&L summary strip */}
          {totalCost > 0 && (
            <div className="flex gap-4 mb-4 p-3 bg-gray-800/50 rounded-lg text-xs">
              <div>
                <p className="text-gray-500 mb-0.5">Invested</p>
                <p className="font-semibold text-white">{fmt(totalCost)}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-0.5">Unrealized P&L</p>
                <p className={clsx('font-semibold', totalGain >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {totalGain >= 0 ? '+' : ''}{fmt(totalGain)} ({totalGain >= 0 ? '+' : ''}{gainPct}%)
                </p>
              </div>
              {cashBal > 0 && (
                <div>
                  <p className="text-gray-500 mb-0.5">Available Cash</p>
                  <p className="font-semibold text-violet-300">{fmt(cashBal)}</p>
                </div>
              )}
            </div>
          )}

          {/* Price refresh errors */}
          {refreshMutation.data?.errors?.length > 0 && (
            <div className="mb-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              {refreshMutation.data.errors.map((e) => (
                <p key={e.symbol} className="text-xs text-amber-400">{e.symbol}: {e.error}</p>
              ))}
            </div>
          )}

          {/* Holdings list + mini pie */}
          {allHoldings.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-6">No holdings yet — add one to get started</p>
          ) : (
            <div className={clsx('grid gap-4', pieData.length > 0 ? 'grid-cols-1 xl:grid-cols-3' : 'grid-cols-1')}>
              <div className={clsx(pieData.length > 0 ? 'xl:col-span-2' : '')}>
                {/* Column headers */}
                {(activeNonCash.length > 0 || cash.length > 0) && (
                  <div className="flex items-center gap-3 pb-1 mb-1 border-b border-gray-800 text-xs text-gray-600 px-1">
                    <span className="w-5 flex-shrink-0" />
                    <span className="w-9 flex-shrink-0" />
                    <span className="flex-1">Asset</span>
                    <span className="w-24 text-center hidden sm:block">Price</span>
                    <span className="text-right min-w-[90px]">Value</span>
                    <span className="w-28 hidden sm:block" />
                  </div>
                )}

                {/* Active holdings + cash */}
                {[...activeNonCash, ...cash].map((h) => (
                  <HoldingRow key={h.id} holding={h} portfolioId={portfolio.id} portfolio={portfolio} />
                ))}

                {/* Sold / closed positions */}
                {closedHoldings.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-gray-800">
                    <p className="text-xs text-gray-600 font-semibold uppercase tracking-wide mb-2">
                      Sold Positions ({closedHoldings.length})
                    </p>
                    {closedHoldings.map((h) => (
                      <ClosedHoldingRow key={h.id} holding={h} portfolioId={portfolio.id} />
                    ))}
                  </div>
                )}
              </div>

              {/* Mini allocation pie */}
              {pieData.length > 0 && (
                <div className="flex flex-col items-center justify-center">
                  <p className="text-xs text-gray-500 mb-2">Allocation</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2}
                      >
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                        formatter={(v, n) => [fmt(v), n]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showAddHolding  && <AddHoldingModal  portfolioId={portfolio.id} cashBalance={cashBal} onClose={() => setShowAddHolding(false)} />}
      {showCashDeposit && <CashDepositModal portfolio={portfolio}      onClose={() => setShowCashDeposit(false)} />}
    </div>
  )
}

// ── Millionaire Calculator ────────────────────────────────────────────────────

function MillionaireCalculator() {
  const qc = useQueryClient()
  const { register, handleSubmit } = useForm({
    defaultValues: {
      current_age: 30, retirement_age: 65,
      initial_investment: 10000, monthly_contribution: 500,
      annual_return_rate: 7, target_wealth: 1000000,
      label: 'My Projection',
    },
  })
  const [result, setResult] = useState(null)

  const { mutate, isPending } = useMutation({
    mutationFn: (d) => api.post('/investments/projections/', d),
    onSuccess: ({ data }) => { setResult(data); qc.invalidateQueries({ queryKey: ['projections'] }) },
  })

  const chartData = result?.projection_data ?? []

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <h2 className="text-sm font-semibold text-white mb-4">Millionaire Calculator</h2>
      <form onSubmit={handleSubmit((d) => mutate(d))} className="grid grid-cols-2 gap-3 mb-5">
        {[
          { name: 'current_age',          label: 'Current Age' },
          { name: 'retirement_age',        label: 'Retirement Age' },
          { name: 'initial_investment',    label: 'Starting Amount ($)' },
          { name: 'monthly_contribution',  label: 'Monthly Contribution ($)' },
          { name: 'annual_return_rate',    label: 'Annual Return (%)', step: '0.1' },
          { name: 'target_wealth',         label: 'Target Wealth ($)' },
        ].map(({ name, label, step }) => (
          <div key={name}>
            <label className="text-xs text-gray-400 block mb-1">{label}</label>
            <input type="number" step={step} {...register(name)}
              className={inp} />
          </div>
        ))}
        <div className="col-span-2">
          <button type="submit" disabled={isPending}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
            {isPending ? 'Calculating…' : 'Calculate Wealth Curve'}
          </button>
        </div>
      </form>

      {result && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Final Value',   value: fmtK(result.projected_final_value), color: 'text-emerald-400' },
              { label: 'Years to Goal', value: result.years_to_goal ? `${result.years_to_goal} yrs` : 'Beyond range', color: 'text-violet-400' },
              { label: 'Data Points',   value: `${chartData.length} years`, color: 'text-blue-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className={clsx('text-sm font-bold', color)}>{value}</p>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="wealth" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="age" stroke="#4b5563" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis stroke="#4b5563" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={fmtK} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v) => [fmtK(v), 'Balance']}
                labelFormatter={(l) => `Age ${l}`}
              />
              <Area type="monotone" dataKey="balance" stroke="#8b5cf6" fill="url(#wealth)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}

// ── Investment Overview ───────────────────────────────────────────────────────

function loadDeposited() {
  try { return JSON.parse(localStorage.getItem('inv_deposited_v2') || '{}') } catch { return {} }
}
function saveDeposited(map) {
  localStorage.setItem('inv_deposited_v2', JSON.stringify(map))
}

function PortfolioDepositRow({ portfolio, depositedMap, onSave, currentValue }) {
  const pid        = String(portfolio.id)
  const stored     = depositedMap[pid] ?? 0
  const [editing,  setEditing]  = useState(false)
  const [draft,    setDraft]    = useState('')

  const pVal   = Number(portfolio.total_value)
  const pCost  = Number(portfolio.total_cost)
  const base   = stored > 0 ? stored : pCost
  const ret    = pVal - base
  const retPct = base > 0 ? (ret / base) * 100 : 0
  const isUp   = ret >= 0
  const share  = currentValue > 0 ? (pVal / currentValue) * 100 : 0

  const commit = () => {
    const val = parseFloat(draft) || 0
    onSave(pid, val)
    setEditing(false)
  }

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
      {/* Name + share */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-white">{portfolio.name}</p>
          <p className="text-xs text-gray-500">{share.toFixed(1)}% of total</p>
        </div>
        <button
          onClick={() => { setDraft(String(stored || '')); setEditing((v) => !v) }}
          className="p-1.5 text-gray-600 hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-colors"
          title="Edit deposited amount"
        >
          <Pencil size={12} />
        </button>
      </div>

      {/* Inline edit */}
      {editing && (
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
            <input
              type="number" step="0.01" min="0"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
              className="w-full bg-gray-700 border border-violet-500 rounded-lg pl-6 pr-3 py-1.5 text-sm text-white focus:outline-none"
              placeholder="0.00"
              autoFocus
            />
          </div>
          <button onClick={commit}
            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs rounded-lg transition-colors">
            Save
          </button>
          <button onClick={() => setEditing(false)}
            className="px-2 py-1.5 text-gray-500 hover:text-white text-xs transition-colors">
            ✕
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-gray-500 mb-0.5">Deposited</p>
          <p className="font-semibold text-white">{fmt(stored || pCost)}</p>
          {stored === 0 && <p className="text-gray-700 italic text-xs">cost basis</p>}
        </div>
        <div>
          <p className="text-gray-500 mb-0.5">Now Worth</p>
          <p className="font-semibold text-white">{fmt(pVal)}</p>
        </div>
        <div>
          <p className="text-gray-500 mb-0.5">Return</p>
          <p className={clsx('font-bold text-sm', isUp ? 'text-emerald-400' : 'text-red-400')}>
            {isUp ? '+' : ''}{retPct.toFixed(2)}%
          </p>
          <p className={clsx('text-xs', isUp ? 'text-emerald-500' : 'text-red-500')}>
            {isUp ? '+' : ''}{fmt(ret)}
          </p>
        </div>
      </div>
    </div>
  )
}

function InvestmentOverview({ portfolios }) {
  const [depositedMap, setDepositedMap] = useState(loadDeposited)

  const handleSave = (pid, val) => {
    const next = { ...depositedMap, [pid]: val }
    setDepositedMap(next)
    saveDeposited(next)
  }

  const currentValue = (portfolios ?? []).reduce((s, p) => s + Number(p.total_value), 0)
  const totalCost    = (portfolios ?? []).reduce((s, p) => s + Number(p.total_cost), 0)

  const totalDeposited = (portfolios ?? []).reduce((s, p) => {
    const stored = depositedMap[String(p.id)] ?? 0
    return s + (stored > 0 ? stored : Number(p.total_cost))
  }, 0)

  const returnAbs = currentValue - totalDeposited
  const returnPct = totalDeposited > 0 ? (returnAbs / totalDeposited) * 100 : 0
  const isUp      = returnAbs >= 0

  const statClass = 'bg-gray-800/60 rounded-xl p-4 flex flex-col gap-1'

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-white">Investment Overview</h2>
        <p className="text-xs text-gray-500 mt-0.5">Click the pencil on any portfolio to set how much you deposited</p>
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className={statClass}>
          <p className="text-xs text-gray-500">Total Deposited</p>
          <p className="text-lg font-bold text-white">{fmt(totalDeposited)}</p>
        </div>
        <div className={statClass}>
          <p className="text-xs text-gray-500">Current Value</p>
          <p className="text-lg font-bold text-white">{fmt(currentValue)}</p>
          <p className="text-xs text-gray-500">{(portfolios ?? []).length} portfolio{(portfolios ?? []).length !== 1 ? 's' : ''}</p>
        </div>
        <div className={statClass}>
          <p className="text-xs text-gray-500">Total Return</p>
          <p className={clsx('text-lg font-bold', isUp ? 'text-emerald-400' : 'text-red-400')}>
            {isUp ? '+' : ''}{fmt(returnAbs)}
          </p>
        </div>
        <div className={clsx(statClass, 'border', isUp ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5')}>
          <p className="text-xs text-gray-500">Return</p>
          <p className={clsx('text-2xl font-bold', isUp ? 'text-emerald-400' : 'text-red-400')}>
            {isUp ? '+' : ''}{returnPct.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Per-portfolio breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(portfolios ?? []).map((p) => (
          <PortfolioDepositRow
            key={p.id}
            portfolio={p}
            depositedMap={depositedMap}
            onSave={handleSave}
            currentValue={currentValue}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Investments() {
  const qc = useQueryClient()

  const { data: portfolios, isLoading } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => api.get('/investments/portfolios/').then((r) => r.data.results ?? r.data),
  })

  const createPortfolio = useMutation({
    mutationFn: (name) => api.post('/investments/portfolios/', { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolios'] }),
  })

  const handleCreatePortfolio = () => {
    const name = prompt('Portfolio name:')
    if (name?.trim()) createPortfolio.mutate(name.trim())
  }


  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Investments</h1>
        </div>
        <button
          onClick={handleCreatePortfolio}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> New Portfolio
        </button>
      </div>

      {/* Investment Overview */}
      {!isLoading && (portfolios ?? []).length > 0 && (
        <InvestmentOverview portfolios={portfolios} />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Portfolios */}
        <div className="space-y-4">
          {isLoading ? (
            <p className="text-gray-500 text-sm text-center py-10">Loading…</p>
          ) : (portfolios ?? []).length === 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-10 text-center text-gray-600">
              <TrendingUp size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-gray-500 font-medium">No portfolios yet</p>
              <p className="text-sm mt-1">Create one to start tracking your investments</p>
            </div>
          ) : (
            (portfolios ?? []).map((p) => <PortfolioCard key={p.id} portfolio={p} />)
          )}
        </div>

        {/* Millionaire Calculator */}
        <MillionaireCalculator />
      </div>
    </div>
  )
}
