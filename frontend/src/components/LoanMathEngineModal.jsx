import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  X, Calculator, TrendingDown, Table2, Zap,
  ChevronDown, ChevronUp, Info,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import clsx from 'clsx'
import api from '../lib/api'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt  = (n) => n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct  = (n) => n == null ? '—' : `${Number(n).toFixed(3)}%`
const fmtK = (v) => `$${(Number(v) / 1000).toFixed(0)}k`

// ─── Method toggle ────────────────────────────────────────────────────────────

function MethodToggle({ method, onChange }) {
  return (
    <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
      {['FIXED_MONTHLY', 'TRUE_DAILY'].map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={clsx(
            'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            method === m ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-gray-200'
          )}
        >
          {m === 'FIXED_MONTHLY' ? 'Fixed Monthly' : 'True Daily'}
        </button>
      ))}
    </div>
  )
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

function Stat({ label, value, sub, color = 'text-white', info }) {
  return (
    <div className="bg-gray-800/60 rounded-xl p-4">
      <div className="flex items-center gap-1 mb-1">
        <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
        {info && <Info size={11} className="text-gray-600" title={info} />}
      </div>
      <p className={clsx('text-xl font-bold', color)}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ data }) {
  const { loan, aggregators, method } = data

  const payoff = aggregators.current_payoff
  const paidPct = loan.principal
    ? ((Number(loan.principal) - Number(loan.current_balance)) / Number(loan.principal) * 100).toFixed(1)
    : null

  return (
    <div className="space-y-6">
      {/* Loan summary */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Loan Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Original Principal" value={fmt(loan.principal)} />
          <Stat label="Current Balance"    value={fmt(loan.current_balance)} color="text-red-400" />
          <Stat label="APR"                value={pct(loan.annual_rate_pct)} color="text-amber-400" />
          <Stat label="Term"               value={`${loan.term_months} mo`} sub={`${(loan.term_months / 12).toFixed(1)} yrs`} />
        </div>
      </div>

      {/* Aggregators */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Aggregators <span className="normal-case font-normal text-gray-600">— {method === 'FIXED_MONTHLY' ? 'Fixed Monthly' : 'True Daily'} method</span>
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat
            label="Interest Paid to Date"
            value={fmt(aggregators.total_interest_paid)}
            color="text-red-400"
            info="Sum of interest components from all recorded payments"
          />
          <Stat
            label="Today's Payoff Amount"
            value={fmt(payoff?.payoff_amount)}
            color="text-emerald-400"
            sub={`Incl. ${fmt(payoff?.accrued_interest)} accrued (${payoff?.days_since_last_payment}d)`}
            info="Principal balance + interest accrued since last payment date"
          />
          <Stat
            label="Effective APR"
            value={aggregators.effective_apr != null ? pct(aggregators.effective_apr) : 'Need 2+ payments'}
            color="text-violet-400"
            sub={`Stated: ${pct(loan.annual_rate_pct)}`}
            info="Actual cost of borrowing computed via IRR from your payment history"
          />
        </div>
      </div>

      {/* Progress */}
      {paidPct && (
        <div>
          <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
            <span>Principal paid off</span>
            <span className="text-violet-400 font-medium">{paidPct}%</span>
          </div>
          <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all"
              style={{ width: `${paidPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>{fmt(Number(loan.principal) - Number(loan.current_balance))} paid</span>
            <span>{fmt(loan.current_balance)} remaining</span>
          </div>
        </div>
      )}

      {/* Computed payment note */}
      <div className="bg-gray-800/40 rounded-lg p-3 text-xs text-gray-500">
        <span className="text-gray-400 font-medium">Computed monthly payment: </span>
        {fmt(loan.computed_payment)}
        {loan.monthly_payment !== loan.computed_payment && (
          <span className="ml-2 text-amber-400/70">
            (actual scheduled: {fmt(loan.monthly_payment)})
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Amortisation schedule tab ────────────────────────────────────────────────

function ScheduleTab({ data }) {
  const { schedule } = data
  const [showAll, setShowAll] = useState(false)
  const rows = showAll ? schedule : schedule.slice(0, 24)

  // Chart data — every 3rd row to keep it lean
  const chartData = schedule
    .filter((_, i) => i % 3 === 0 || i === schedule.length - 1)
    .map((r) => ({
      month: r.month,
      Balance: Number(r.balance),
      'Cumul. Interest': Number(r.cumulative_interest),
    }))

  return (
    <div className="space-y-6">
      {/* Balance chart */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Balance Over Time</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="int" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="month" stroke="#4b5563" tick={{ fill: '#9ca3af', fontSize: 11 }} label={{ value: 'Month', position: 'insideBottom', fill: '#6b7280', fontSize: 11 }} />
            <YAxis stroke="#4b5563" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={fmtK} />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              formatter={(v, name) => [fmt(v), name]}
            />
            <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
            <Area type="monotone" dataKey="Balance" stroke="#8b5cf6" fill="url(#bal)" strokeWidth={2} />
            <Area type="monotone" dataKey="Cumul. Interest" stroke="#ef4444" fill="url(#int)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Payment Schedule</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-800/50">
                {['#', 'Date', 'Days', 'Payment', 'Principal', 'Interest', 'Balance', 'Cum. Interest'].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-medium text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.month} className={clsx('border-b border-gray-800/60', i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-800/20')}>
                  <td className="px-3 py-2 text-gray-500">{r.month}</td>
                  <td className="px-3 py-2 text-gray-300">{r.payment_date}</td>
                  <td className="px-3 py-2 text-gray-500">{r.days_in_period}</td>
                  <td className="px-3 py-2 font-medium text-white">{fmt(r.payment)}</td>
                  <td className="px-3 py-2 text-violet-400">{fmt(r.principal)}</td>
                  <td className="px-3 py-2 text-red-400">{fmt(r.interest)}</td>
                  <td className="px-3 py-2 text-gray-300">{fmt(r.balance)}</td>
                  <td className="px-3 py-2 text-gray-500">{fmt(r.cumulative_interest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {schedule.length > 24 && (
          <button
            onClick={() => setShowAll((s) => !s)}
            className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 mt-3 transition-colors"
          >
            {showAll ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showAll ? `Show first 24 of ${schedule.length}` : `Show all ${schedule.length} rows`}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── What-If tab ──────────────────────────────────────────────────────────────

function WhatIfTab({ loan, method }) {
  const [lumpSum,       setLumpSum]       = useState('')
  const [lumpDate,      setLumpDate]      = useState('')
  const [recurringExtra, setRecurringExtra] = useState('')
  const [result,        setResult]        = useState(null)

  const { mutate, isPending } = useMutation({
    mutationFn: (payload) =>
      api.post(`/loans/${loan.id}/math-engine/simulate/`, payload).then((r) => r.data),
    onSuccess: setResult,
  })

  const run = () => {
    if (!lumpSum && !recurringExtra) return
    mutate({
      method,
      lump_sum: lumpSum || 0,
      lump_sum_date: lumpDate || null,
      recurring_extra: recurringExtra || 0,
    })
  }

  // Chart data — merge baseline and scenario by month
  const chartData = result ? (() => {
    const map = {}
    result.baseline_schedule.forEach((r) => {
      map[r.month] = { month: r.month, Baseline: r.balance }
    })
    result.scenario_schedule.forEach((r) => {
      if (map[r.month]) map[r.month].Scenario = r.balance
      else map[r.month] = { month: r.month, Scenario: r.balance }
    })
    return Object.values(map).sort((a, b) => a.month - b.month)
  })() : []

  return (
    <div className="space-y-5">
      {/* Inputs */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Simulation Inputs</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">One-Time Lump Sum ($)</label>
            <input
              type="number" step="0.01" value={lumpSum}
              onChange={(e) => setLumpSum(e.target.value)}
              placeholder="e.g. 5000"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Lump Sum Date</label>
            <input
              type="date" value={lumpDate}
              onChange={(e) => setLumpDate(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Extra Monthly ($)</label>
            <input
              type="number" step="0.01" value={recurringExtra}
              onChange={(e) => setRecurringExtra(e.target.value)}
              placeholder="e.g. 200"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>
        <button
          onClick={run}
          disabled={isPending || (!lumpSum && !recurringExtra)}
          className="flex items-center gap-2 mt-3 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Zap size={15} /> {isPending ? 'Running…' : 'Run Simulation'}
        </button>
      </div>

      {result && (
        <>
          {/* Savings summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">Time Saved</p>
              <p className="text-xl font-bold text-emerald-400">{result.savings.time_saved_label}</p>
              <p className="text-xs text-gray-600 mt-0.5">{result.savings.months_saved} months</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">Interest Saved</p>
              <p className="text-xl font-bold text-emerald-400">{fmt(result.savings.interest_saved)}</p>
              <p className="text-xs text-gray-600 mt-0.5">in total cost</p>
            </div>
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">New Payoff Date</p>
              <p className="text-lg font-bold text-violet-400">{result.scenario.payoff_date}</p>
              <p className="text-xs text-gray-600 mt-0.5">was {result.baseline.payoff_date}</p>
            </div>
          </div>

          {/* Side-by-side breakdown */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Baseline', color: 'text-gray-300', bg: 'bg-gray-800/40', d: result.baseline },
              { label: 'With Extra Payments', color: 'text-emerald-400', bg: 'bg-emerald-500/5 border border-emerald-500/15', d: result.scenario },
            ].map(({ label, color, bg, d }) => (
              <div key={label} className={clsx('rounded-xl p-4', bg)}>
                <p className={clsx('text-xs font-semibold mb-3 uppercase tracking-wider', color)}>{label}</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Months</span>
                    <span className="text-white font-medium">{d.months}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total Interest</span>
                    <span className="text-red-400 font-medium">{fmt(d.total_interest)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total Paid</span>
                    <span className="text-white font-medium">{fmt(d.total_paid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Payoff Date</span>
                    <span className="text-gray-300 font-medium">{d.payoff_date}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Comparison chart */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Balance Comparison</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6b7280" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6b7280" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="scen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="month" stroke="#4b5563" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis stroke="#4b5563" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={fmtK} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                  formatter={(v) => [fmt(v), '']}
                />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                <Area type="monotone" dataKey="Baseline" stroke="#6b7280" fill="url(#base)" strokeWidth={2} strokeDasharray="5 3" />
                <Area type="monotone" dataKey="Scenario" stroke="#10b981" fill="url(#scen)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',  label: 'Overview',    icon: Calculator },
  { id: 'schedule',  label: 'Schedule',    icon: Table2 },
  { id: 'whatif',    label: 'What-If',     icon: TrendingDown },
]

export default function LoanMathEngineModal({ loan, onClose }) {
  const [tab,    setTab]    = useState('overview')
  const [method, setMethod] = useState('FIXED_MONTHLY')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['math-engine', loan.id, method],
    queryFn: () =>
      api.get(`/loans/${loan.id}/math-engine/`, { params: { method } }).then((r) => r.data),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-600/20 flex items-center justify-center">
              <Calculator size={16} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{loan.name} — Math Engine</h2>
              <p className="text-xs text-gray-500">{loan.loan_type?.replace('_', ' ')} · {pct(loan.annual_interest_rate)} APR</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MethodToggle method={method} onChange={setMethod} />
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 px-6 pt-3 border-b border-gray-800 flex-shrink-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors',
                tab === id
                  ? 'border-violet-500 text-violet-400 bg-violet-500/5'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              )}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && (
            <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
              Computing schedule…
            </div>
          )}
          {isError && (
            <p className="text-red-400 text-sm text-center py-12">Failed to load math engine data.</p>
          )}
          {data && !isLoading && (
            <>
              {tab === 'overview' && <OverviewTab data={data} />}
              {tab === 'schedule' && <ScheduleTab data={data} />}
              {tab === 'whatif'   && <WhatIfTab loan={loan} method={method} />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
