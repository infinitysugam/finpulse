import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Plus, X, TrendingUp, TrendingDown } from 'lucide-react'
import api from '../lib/api'
import clsx from 'clsx'

const fmt = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })
const fmtK = (n) => {
  const v = Number(n)
  return v >= 1_000_000 ? `$${(v/1_000_000).toFixed(2)}M` : v >= 1000 ? `$${(v/1000).toFixed(1)}k` : fmt(v)
}

function HoldingRow({ h }) {
  const gainPct = Number(h.unrealized_gain_loss_pct)
  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-800 last:border-0">
      <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-xs font-bold text-violet-400">
        {(h.symbol || h.name).slice(0, 3).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">{h.symbol || h.name}</p>
        <p className="text-xs text-gray-500 capitalize">{h.asset_type} · {Number(h.quantity)} units</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-white">{fmt(h.current_value)}</p>
        <p className={clsx('text-xs', gainPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
          {gainPct >= 0 ? '▲' : '▼'} {Math.abs(gainPct).toFixed(2)}%
        </p>
      </div>
    </div>
  )
}

function MillionaireCalculator() {
  const qc = useQueryClient()
  const { register, handleSubmit } = useForm({
    defaultValues: { current_age: 30, retirement_age: 65, initial_investment: 10000, monthly_contribution: 500, annual_return_rate: 7, target_wealth: 1000000, label: 'My Projection' },
  })
  const [result, setResult] = useState(null)

  const { mutate, isPending } = useMutation({
    mutationFn: (d) => api.post('/investments/projections/', d),
    onSuccess: ({ data }) => {
      setResult(data)
      qc.invalidateQueries({ queryKey: ['projections'] })
    },
  })

  const chartData = result?.projection_data ?? []

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <h2 className="text-sm font-semibold text-white mb-4">Millionaire Calculator</h2>

      <form onSubmit={handleSubmit((d) => mutate(d))} className="grid grid-cols-2 gap-3 mb-5">
        {[
          { name: 'current_age', label: 'Current Age', type: 'number' },
          { name: 'retirement_age', label: 'Retirement Age', type: 'number' },
          { name: 'initial_investment', label: 'Starting Amount ($)', type: 'number' },
          { name: 'monthly_contribution', label: 'Monthly Contribution ($)', type: 'number' },
          { name: 'annual_return_rate', label: 'Annual Return (%)', type: 'number', step: '0.1' },
          { name: 'target_wealth', label: 'Target Wealth ($)', type: 'number' },
        ].map(({ name, label, type, step }) => (
          <div key={name}>
            <label className="text-xs text-gray-400 block mb-1">{label}</label>
            <input
              type={type}
              step={step}
              {...register(name)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
            />
          </div>
        ))}
        <div className="col-span-2">
          <button type="submit" disabled={isPending} className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm">
            {isPending ? 'Calculating…' : 'Calculate Wealth Curve'}
          </button>
        </div>
      </form>

      {result && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'Final Value', value: fmtK(result.projected_final_value), color: 'text-emerald-400' },
              { label: 'Years to Goal', value: result.years_to_goal ? `${result.years_to_goal} yrs` : 'Beyond range', color: 'text-violet-400' },
              { label: 'Data Points', value: `${chartData.length} years`, color: 'text-blue-400' },
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
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="age" stroke="#4b5563" tick={{ fill: '#9ca3af', fontSize: 11 }} label={{ value: 'Age', fill: '#9ca3af', fontSize: 11 }} />
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

function AddHoldingModal({ portfolioId, onClose }) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset } = useForm()
  const { mutate, isPending } = useMutation({
    mutationFn: (d) => api.post(`/investments/portfolios/${portfolioId}/holdings/`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['portfolios'] }); reset(); onClose() },
  })
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Add Holding</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit((d) => mutate(d))} className="space-y-4">
          <select {...register('asset_type', { required: true })} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500">
            {['stock','etf','mutual_fund','crypto','bond','real_estate','cash','commodity','other'].map((t) => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input {...register('symbol')} placeholder="Symbol (e.g. AAPL)" className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500" />
            <input {...register('name', { required: true })} placeholder="Name" className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Quantity</label>
              <input type="number" step="any" {...register('quantity', { required: true })} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Avg Cost Basis ($)</label>
              <input type="number" step="any" {...register('average_cost_basis', { required: true })} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500" />
            </div>
          </div>
          <button type="submit" disabled={isPending} className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm">
            {isPending ? 'Saving…' : 'Add Holding'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function Investments() {
  const [showHoldingModal, setShowHoldingModal] = useState(null)

  const { data: portfolios, isLoading } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => api.get('/investments/portfolios/').then((r) => r.data.results ?? r.data),
  })

  const qc = useQueryClient()
  const createPortfolio = useMutation({
    mutationFn: (name) => api.post('/investments/portfolios/', { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolios'] }),
  })

  const handleCreatePortfolio = () => {
    const name = prompt('Portfolio name:')
    if (name) createPortfolio.mutate(name)
  }

  const totalValue = (portfolios ?? []).reduce((s, p) => s + Number(p.total_value), 0)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Investments</h1>
          <p className="text-gray-500 text-sm mt-1">Total portfolio value: <span className="text-emerald-400 font-semibold">{fmt(totalValue)}</span></p>
        </div>
        <button
          onClick={handleCreatePortfolio}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> New Portfolio
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        {/* Portfolios */}
        <div className="space-y-4">
          {isLoading ? (
            <p className="text-gray-500 text-sm text-center py-10">Loading…</p>
          ) : (portfolios ?? []).length === 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-10 text-center text-gray-600">
              <p className="text-gray-500 font-medium">No portfolios yet</p>
              <p className="text-sm mt-1">Create one to start tracking your assets</p>
            </div>
          ) : (portfolios ?? []).map((p) => (
            <div key={p.id} className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-white">{p.name}</p>
                  <p className="text-xs text-gray-500">
                    {p.holdings?.length ?? 0} holdings · Total: <span className="text-emerald-400">{fmt(p.total_value)}</span>
                  </p>
                </div>
                <button
                  onClick={() => setShowHoldingModal(p.id)}
                  className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                >
                  <Plus size={14} /> Add holding
                </button>
              </div>
              <div className="divide-y divide-gray-800">
                {(p.holdings ?? []).map((h) => <HoldingRow key={h.id} h={h} />)}
              </div>
            </div>
          ))}
        </div>

        {/* Millionaire Calculator */}
        <MillionaireCalculator />
      </div>

      {showHoldingModal && (
        <AddHoldingModal portfolioId={showHoldingModal} onClose={() => setShowHoldingModal(null)} />
      )}
    </div>
  )
}
