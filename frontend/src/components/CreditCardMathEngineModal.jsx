import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { X, CreditCard, Zap, TrendingDown, BarChart3 } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import clsx from 'clsx'
import api from '../lib/api'

const fmt  = (n) => n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = (v) => `$${(Number(v) / 1000).toFixed(1)}k`
const pct  = (n) => n == null ? '—' : `${Number(n).toFixed(2)}%`

// ─── Pure math helpers (no API needed for scenarios) ─────────────────────────

function calcPayoff(balance, aprPct, monthlyPayment, extraMonthly = 0) {
  const r = Number(aprPct) / 100 / 12
  let bal = Number(balance)
  const payment = Number(monthlyPayment) + extraMonthly
  if (payment <= 0) return null

  let months = 0
  let totalInterest = 0

  while (bal > 0.01 && months < 600) {
    const interest = bal * r
    if (payment <= interest) return null // payment too low to ever pay off
    totalInterest += interest
    bal = Math.max(0, bal - (payment - interest))
    months++
  }

  const payoffDate = new Date()
  payoffDate.setMonth(payoffDate.getMonth() + months)

  return {
    months,
    totalInterest,
    totalPaid: months * payment,
    payoffDate: payoffDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
  }
}

function buildBalanceChart(balance, aprPct, monthlyPayment, extraMonthly = 0) {
  const r = Number(aprPct) / 100 / 12
  let bal = Number(balance)
  const payment = Number(monthlyPayment) + extraMonthly
  const rows = []
  let month = 0
  let cumInterest = 0

  while (bal > 0.01 && month < 600) {
    const interest = bal * r
    if (payment <= interest) break
    cumInterest += interest
    bal = Math.max(0, bal - (payment - interest))
    month++
    if (month % 3 === 0 || bal < 0.01) {
      rows.push({ month, balance: parseFloat(bal.toFixed(2)), cumInterest: parseFloat(cumInterest.toFixed(2)) })
    }
  }
  return rows
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'payoff',    label: 'Payoff Timeline', icon: TrendingDown },
  { id: 'scenarios', label: 'Scenarios',        icon: BarChart3 },
  { id: 'whatif',    label: 'What-If',          icon: Zap },
]

// ─── Tab: Payoff Timeline ─────────────────────────────────────────────────────

function PayoffTab({ loan, scheduleData }) {
  const { data, isLoading } = scheduleData

  const balance    = Number(loan.current_balance)
  const apr        = Number(loan.annual_interest_rate)
  const payment    = Number(loan.monthly_payment)
  const monthlyR   = apr / 100 / 12
  const monthlyInt = balance * monthlyR
  const intPct     = payment > 0 ? (monthlyInt / payment) * 100 : 0

  const baseline = useMemo(() => calcPayoff(balance, apr, payment), [balance, apr, payment])
  const chartData = useMemo(() => buildBalanceChart(balance, apr, payment), [balance, apr, payment])

  return (
    <div className="space-y-5">
      {/* Key stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Monthly Interest', value: fmt(monthlyInt), color: 'text-red-400', sub: `${intPct.toFixed(0)}% of your payment` },
          { label: 'Months to Payoff', value: baseline?.months ?? '∞', color: 'text-amber-400', sub: baseline?.payoffDate ?? 'Never' },
          { label: 'Total Interest', value: baseline ? fmt(baseline.totalInterest) : '∞', color: 'text-red-400', sub: 'at current payment' },
          { label: 'Total Cost', value: baseline ? fmt(baseline.totalPaid) : '∞', color: 'text-white', sub: 'principal + interest' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="bg-gray-800/60 rounded-xl p-4 border border-gray-700">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={clsx('text-xl font-bold', color)}>{value}</p>
            <p className="text-xs text-gray-600 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Interest-to-payment warning */}
      {intPct > 60 && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/25 rounded-xl p-4">
          <span className="text-red-400 text-lg mt-0.5">⚠</span>
          <div>
            <p className="text-sm font-semibold text-red-400">High interest ratio</p>
            <p className="text-xs text-gray-400 mt-1">
              {intPct.toFixed(0)}% of your {fmt(payment)} payment goes straight to interest.
              Only {fmt(payment - monthlyInt)} reduces your balance each month.
              Consider paying more than the minimum.
            </p>
          </div>
        </div>
      )}

      {/* Balance decline chart */}
      {chartData.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Balance Decline</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ccBal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="ccInt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.20} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v) => `Mo ${v}`} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={fmtK} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#9ca3af', fontSize: 12 }}
                formatter={(v, n) => [fmt(v), n === 'balance' ? 'Balance' : 'Cum. Interest']}
                labelFormatter={(v) => `Month ${v}`}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
              <Area type="monotone" dataKey="balance"     stroke="#8b5cf6" fill="url(#ccBal)" strokeWidth={2} name="balance" />
              <Area type="monotone" dataKey="cumInterest" stroke="#ef4444" fill="url(#ccInt)" strokeWidth={2} name="cumInterest" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Scenarios ───────────────────────────────────────────────────────────

const EXTRA_AMOUNTS = [0, 25, 50, 100, 200, 500]

function ScenariosTab({ loan }) {
  const balance  = Number(loan.current_balance)
  const apr      = Number(loan.annual_interest_rate)
  const minPay   = Number(loan.monthly_payment)

  const scenarios = useMemo(() =>
    EXTRA_AMOUNTS.map((extra) => {
      const result = calcPayoff(balance, apr, minPay, extra)
      return { extra, result }
    }),
    [balance, apr, minPay]
  )

  const baseline = scenarios[0].result
  const chartData = useMemo(() =>
    EXTRA_AMOUNTS.filter((e) => e <= 200).map((extra) => ({
      extra: extra === 0 ? 'Min only' : `+$${extra}/mo`,
      months: calcPayoff(balance, apr, minPay, extra)?.months ?? 600,
      interest: parseFloat((calcPayoff(balance, apr, minPay, extra)?.totalInterest ?? 0).toFixed(2)),
    })),
    [balance, apr, minPay]
  )

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500">
        Comparing payoff outcomes based on extra monthly payment beyond your current minimum of {fmt(minPay)}.
      </p>

      {/* Scenarios table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {['Extra/mo', 'Total Payment', 'Months', 'Payoff Date', 'Total Interest', 'Interest Saved'].map((h) => (
                <th key={h} className="text-left text-xs text-gray-500 pb-2 pr-4 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scenarios.map(({ extra, result }, i) => {
              if (!result) return (
                <tr key={extra} className="border-b border-gray-800/50">
                  <td className="py-2.5 pr-4 font-medium text-gray-400">
                    {extra === 0 ? 'Min only' : `+${fmt(extra)}/mo`}
                  </td>
                  <td colSpan={5} className="py-2.5 text-red-400 text-xs italic">
                    Payment doesn't cover interest — balance will never decrease
                  </td>
                </tr>
              )
              const interestSaved = baseline ? baseline.totalInterest - result.totalInterest : 0
              const isBase = extra === 0
              return (
                <tr key={extra} className={clsx('border-b border-gray-800/50', i === 1 && 'bg-violet-500/5')}>
                  <td className="py-2.5 pr-4">
                    <span className={clsx('font-semibold', isBase ? 'text-gray-400' : 'text-violet-400')}>
                      {isBase ? 'Min only' : `+${fmt(extra)}/mo`}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-gray-300">{fmt(minPay + extra)}/mo</td>
                  <td className="py-2.5 pr-4 text-white font-medium">{result.months} mo</td>
                  <td className="py-2.5 pr-4 text-gray-300">{result.payoffDate}</td>
                  <td className="py-2.5 pr-4 text-red-400">{fmt(result.totalInterest)}</td>
                  <td className="py-2.5 pr-4">
                    {isBase ? (
                      <span className="text-gray-600">—</span>
                    ) : (
                      <span className="text-emerald-400 font-semibold">{fmt(interestSaved)}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Months comparison bar chart */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Months to Payoff by Extra Payment</p>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="scenInt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="extra" tick={{ fill: '#6b7280', fontSize: 11 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} label={{ value: 'months', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              labelStyle={{ color: '#9ca3af', fontSize: 12 }}
              formatter={(v, n) => [n === 'months' ? `${v} months` : fmt(v), n === 'months' ? 'Months to payoff' : 'Total interest']}
            />
            <Area type="monotone" dataKey="months" stroke="#8b5cf6" fill="url(#scenInt)" strokeWidth={2} name="months" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Tab: What-If ─────────────────────────────────────────────────────────────

function WhatIfTab({ loan }) {
  const [extra, setExtra] = useState('')
  const [lumpSum, setLumpSum] = useState('')
  const [lumpDate, setLumpDate] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const balance  = Number(loan.current_balance)
  const apr      = Number(loan.annual_interest_rate)
  const minPay   = Number(loan.monthly_payment)
  const baseline = useMemo(() => calcPayoff(balance, apr, minPay), [balance, apr, minPay])

  const run = async () => {
    setLoading(true)
    try {
      const { data } = await api.post(`/loans/${loan.id}/math-engine/simulate/`, {
        method: 'FIXED_MONTHLY',
        lump_sum: lumpSum || 0,
        lump_sum_date: lumpDate || null,
        recurring_extra: extra || 0,
      })
      setResult(data)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Extra Monthly ($)</label>
          <input
            type="number" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. 100"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Lump Sum ($)</label>
          <input
            type="number" value={lumpSum} onChange={(e) => setLumpSum(e.target.value)} placeholder="e.g. 500"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Lump Sum Date</label>
          <input
            type="date" value={lumpDate} onChange={(e) => setLumpDate(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
          />
        </div>
      </div>

      <button
        onClick={run}
        disabled={(!extra && !lumpSum) || loading}
        className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
      >
        <Zap size={14} /> {loading ? 'Calculating…' : 'Run Simulation'}
      </button>

      {result && (
        <div className="space-y-4">
          {/* Savings chips */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Time Saved', value: result.savings.time_saved_label, color: 'text-emerald-400' },
              { label: 'Interest Saved', value: fmt(result.savings.interest_saved), color: 'text-emerald-400' },
              { label: 'New Payoff', value: result.scenario.payoff_date?.slice(0, 7) ?? '—', color: 'text-violet-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-800 rounded-xl p-3 text-center border border-gray-700">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className={clsx('text-sm font-bold', color)}>{value}</p>
              </div>
            ))}
          </div>

          {/* Baseline vs scenario */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { title: 'Baseline', data: result.baseline, accent: 'border-gray-700' },
              { title: 'With Changes', data: result.scenario, accent: 'border-violet-500/40' },
            ].map(({ title, data, accent }) => (
              <div key={title} className={clsx('bg-gray-800/60 rounded-xl p-4 border', accent)}>
                <p className="text-xs font-semibold text-gray-400 mb-3">{title}</p>
                <div className="space-y-2">
                  {[
                    { label: 'Months', value: data.months },
                    { label: 'Payoff date', value: data.payoff_date?.slice(0, 7) ?? '—' },
                    { label: 'Total interest', value: fmt(data.total_interest) },
                    { label: 'Total paid', value: fmt(data.total_paid) },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between text-xs">
                      <span className="text-gray-500">{label}</span>
                      <span className="text-white font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

export default function CreditCardMathEngineModal({ loan, onClose }) {
  const [tab, setTab] = useState('payoff')
  const utilPct = loan.utilization_pct ?? 0

  const scheduleData = useQuery({
    queryKey: ['cc-math-engine', loan.id],
    queryFn: () => api.get(`/loans/${loan.id}/math-engine/?method=FIXED_MONTHLY`).then((r) => r.data),
  })

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-950 rounded-2xl border border-gray-800 w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <CreditCard size={18} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">{loan.name}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {loan.lender || 'Credit Card'} · {pct(loan.annual_interest_rate)} APR · {utilPct}% utilized
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors mt-1">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 py-3 border-b border-gray-800 shrink-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                tab === id ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              )}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'payoff'    && <PayoffTab loan={loan} scheduleData={scheduleData} />}
          {tab === 'scenarios' && <ScenariosTab loan={loan} />}
          {tab === 'whatif'    && <WhatIfTab loan={loan} />}
        </div>
      </div>
    </div>
  )
}
