import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  X, Calculator, TrendingDown, Table2, Zap,
  ChevronDown, ChevronUp, Info, RefreshCw,
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

function buildOriginalSchedule(loanData) {
  const P           = parseFloat(loanData.principal)
  const annualRate  = parseFloat(loanData.annual_rate_pct) / 100
  const monthlyRate = annualRate / 12
  const n           = loanData.term_months
  const pmt         = parseFloat(loanData.monthly_payment)
  const startDate   = new Date(loanData.start_date + 'T12:00:00')

  let balance = P
  let cumInterest = 0
  const rows = []

  for (let month = 1; month <= Math.max(n, 600) && balance > 0.005; month++) {
    const pDate = new Date(startDate)
    pDate.setMonth(pDate.getMonth() + month)

    const interest  = balance * monthlyRate
    const payment   = Math.min(pmt, balance + interest)
    const principal = payment - interest
    balance         = Math.max(0, balance - principal)
    cumInterest    += interest

    rows.push({
      month,
      date: pDate.toISOString().split('T')[0],
      payment,
      principal,
      interest,
      balance,
      cumInterest,
    })
  }
  return rows
}

function ScheduleTab({ data, loan }) {
  const [showAll, setShowAll] = useState(false)

  const origSchedule   = buildOriginalSchedule(data.loan)
  const actualPayments = [...(loan.payments || [])].sort(
    (a, b) => new Date(a.payment_date) - new Date(b.payment_date)
  )
  const numActual = actualPayments.length

  // Overlay actual payments onto original scheduled rows by index
  const mergedRows = origSchedule.map((row, i) => ({
    ...row,
    actual: i < numActual ? actualPayments[i] : null,
  }))

  // Summary stats
  const schedInterestForPaid = origSchedule.slice(0, numActual).reduce((s, r) => s + r.interest, 0)
  const actualInterestPaid   = actualPayments.reduce((s, p) => s + parseFloat(p.interest_component || 0), 0)
  const interestSaved        = schedInterestForPaid - actualInterestPaid
  const totalActualPaid      = actualPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0)
  const totalSchedPaid       = origSchedule.slice(0, numActual).reduce((s, r) => s + r.payment, 0)

  const displayRows = showAll ? mergedRows : mergedRows.slice(0, 24)

  // Chart: scheduled balance (dashed) vs actual balance (solid green) + cumulative interest
  const chartData = origSchedule
    .filter((_, i) => i % 3 === 0 || i === origSchedule.length - 1)
    .map((r) => {
      const idx = r.month - 1
      return {
        month: r.month,
        'Scheduled Balance': r.balance,
        ...(idx < numActual
          ? { 'Actual Balance': parseFloat(actualPayments[idx].balance_after || 0) }
          : {}),
        'Cumul. Interest': r.cumInterest,
      }
    })

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      {numActual > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-800/60 rounded-xl p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Payments Made</p>
            <p className="text-lg font-bold text-white">{numActual}</p>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Actually Paid</p>
            <p className="text-lg font-bold text-white">{fmt(totalActualPaid)}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">Sched: {fmt(totalSchedPaid)}</p>
          </div>
          <div className={clsx(
            'rounded-xl p-3 text-center',
            interestSaved > 0
              ? 'bg-emerald-500/10 border border-emerald-500/20'
              : 'bg-red-500/10 border border-red-500/20'
          )}>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Interest Saved</p>
            <p className={clsx('text-lg font-bold', interestSaved > 0 ? 'text-emerald-400' : 'text-red-400')}>
              {interestSaved > 0 ? '+' : ''}{fmt(interestSaved)}
            </p>
            <p className="text-[10px] text-gray-600 mt-0.5">vs original schedule</p>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Sched. Interest</p>
            <p className="text-lg font-bold text-red-400">{fmt(schedInterestForPaid)}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">Actual: {fmt(actualInterestPaid)}</p>
          </div>
        </div>
      )}

      {/* Balance chart */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Balance Over Time</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="balSched" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6b7280" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#6b7280" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="balActual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
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
            <Area type="monotone" dataKey="Scheduled Balance" stroke="#6b7280" fill="url(#balSched)"  strokeWidth={2} strokeDasharray="5 3" />
            <Area type="monotone" dataKey="Actual Balance"    stroke="#10b981" fill="url(#balActual)" strokeWidth={2} />
            <Area type="monotone" dataKey="Cumul. Interest"   stroke="#ef4444" fill="url(#int)"       strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Payment Schedule</h3>
          {numActual > 0 && (
            <span className="text-[10px] text-gray-600">
              Top line = actual &nbsp;·&nbsp; Bottom line = original schedule
            </span>
          )}
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-800/50">
                {['#', 'Status', 'Date', 'Payment', 'Principal', 'Interest', 'Balance', 'Int. Saved'].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-medium text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => {
                const actual   = row.actual
                const intSaved = actual
                  ? row.interest - parseFloat(actual.interest_component || 0)
                  : null

                return (
                  <tr
                    key={row.month}
                    className={clsx(
                      'border-b border-gray-800/60 transition-colors',
                      actual
                        ? 'bg-emerald-950/20 hover:bg-emerald-950/35'
                        : i % 2 === 0 ? 'bg-gray-900 hover:bg-gray-800/50' : 'bg-gray-800/20 hover:bg-gray-800/50'
                    )}
                  >
                    {/* # */}
                    <td className="px-3 py-2.5 text-gray-500 font-mono align-top">{row.month}</td>

                    {/* Status */}
                    <td className="px-3 py-2.5 align-top">
                      {actual ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-medium whitespace-nowrap">
                          ✓ Paid
                        </span>
                      ) : (
                        <span className="text-gray-600 text-[10px]">Upcoming</span>
                      )}
                    </td>

                    {/* Date — actual on top (green), scheduled below (gray strikethrough) */}
                    <td className="px-3 py-2.5 align-top">
                      {actual ? (
                        <div className="space-y-0.5">
                          <div className="text-emerald-400 font-medium">{actual.payment_date}</div>
                          <div className="text-gray-600 line-through">{row.date}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">{row.date}</span>
                      )}
                    </td>

                    {/* Payment */}
                    <td className="px-3 py-2.5 align-top">
                      {actual ? (
                        <div className="space-y-0.5">
                          <div className="text-white font-medium">{fmt(actual.amount)}</div>
                          <div className="text-gray-600">{fmt(row.payment)}</div>
                        </div>
                      ) : (
                        <span className="font-medium text-white">{fmt(row.payment)}</span>
                      )}
                    </td>

                    {/* Principal */}
                    <td className="px-3 py-2.5 align-top">
                      {actual ? (
                        <div className="space-y-0.5">
                          <div className="text-violet-400">{fmt(actual.principal_component)}</div>
                          <div className="text-gray-600">{fmt(row.principal)}</div>
                        </div>
                      ) : (
                        <span className="text-violet-400">{fmt(row.principal)}</span>
                      )}
                    </td>

                    {/* Interest */}
                    <td className="px-3 py-2.5 align-top">
                      {actual ? (
                        <div className="space-y-0.5">
                          <div className="text-red-400">{fmt(actual.interest_component)}</div>
                          <div className="text-gray-600">{fmt(row.interest)}</div>
                        </div>
                      ) : (
                        <span className="text-red-400">{fmt(row.interest)}</span>
                      )}
                    </td>

                    {/* Balance */}
                    <td className="px-3 py-2.5 align-top">
                      {actual ? (
                        <div className="space-y-0.5">
                          <div className="text-gray-300">{fmt(actual.balance_after)}</div>
                          <div className="text-gray-600">{fmt(row.balance)}</div>
                        </div>
                      ) : (
                        <span className="text-gray-300">{fmt(row.balance)}</span>
                      )}
                    </td>

                    {/* Interest saved this period */}
                    <td className="px-3 py-2.5 align-top">
                      {intSaved != null ? (
                        <span className={clsx(
                          'font-medium',
                          intSaved > 0.005  ? 'text-emerald-400'
                          : intSaved < -0.005 ? 'text-red-400'
                          : 'text-gray-500'
                        )}>
                          {intSaved > 0.005 ? '+' : ''}{fmt(intSaved)}
                        </span>
                      ) : (
                        <span className="text-gray-700">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {mergedRows.length > 24 && (
          <button
            onClick={() => setShowAll((s) => !s)}
            className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 mt-3 transition-colors"
          >
            {showAll ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showAll
              ? `Show first 24 of ${mergedRows.length}`
              : `Show all ${mergedRows.length} rows`}
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

// ─── Refinance tab ────────────────────────────────────────────────────────────

const TERM_PRESETS = [24, 36, 48, 60, 72, 84]

function calcMonthlyPayment(principal, annualRatePct, termMonths) {
  const r = annualRatePct / 100 / 12
  if (r === 0) return principal / termMonths
  const factor = (1 + r) ** termMonths
  return principal * (r * factor) / (factor - 1)
}

function buildRefinanceSched(principal, annualRatePct, termMonths, startDateStr) {
  return buildOriginalSchedule({
    principal:       String(principal),
    annual_rate_pct: String(annualRatePct),
    term_months:     termMonths,
    monthly_payment: String(calcMonthlyPayment(principal, annualRatePct, termMonths).toFixed(4)),
    start_date:      startDateStr,
  })
}

function RefScheduleTable({ current, refinanced }) {
  const [showAll, setShowAll] = useState(false)
  const maxLen    = Math.max(current.length, refinanced.length)
  const totalShow = showAll ? maxLen : Math.min(24, maxLen)

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Schedule Comparison</h3>
      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-800/50">
              <th rowSpan={2} className="px-3 py-2 text-left text-gray-400 font-medium border-r border-gray-700">#</th>
              <th colSpan={4} className="px-3 py-1.5 text-center text-gray-400 font-medium border-r border-gray-700 border-b border-gray-700">Current (remaining)</th>
              <th colSpan={4} className="px-3 py-1.5 text-center text-emerald-400 font-medium">Refinanced</th>
            </tr>
            <tr className="border-b border-gray-800 bg-gray-800/30 text-[10px] text-gray-500 font-normal">
              {['Date', 'Payment', 'Interest', 'Balance'].map((h) => (
                <th key={`c-${h}`} className="px-2 py-1.5 text-left">{h}</th>
              ))}
              <th className="border-l border-gray-700 px-2 py-1.5 text-left text-emerald-600">Date</th>
              {['Payment', 'Interest', 'Balance'].map((h) => (
                <th key={`r-${h}`} className="px-2 py-1.5 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: totalShow }, (_, i) => {
              const c = current[i]
              const r = refinanced[i]
              const intDiff = c && r
                ? parseFloat(c.interest) - r.interest
                : null
              return (
                <tr key={i} className={clsx('border-b border-gray-800/60', i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-800/20')}>
                  <td className="px-3 py-2 text-gray-500 border-r border-gray-800">{i + 1}</td>
                  <td className="px-2 py-2 text-gray-400">{c?.payment_date ?? '—'}</td>
                  <td className="px-2 py-2 text-white">{c ? fmt(c.payment) : '—'}</td>
                  <td className="px-2 py-2 text-red-400">{c ? fmt(c.interest) : '—'}</td>
                  <td className="px-2 py-2 text-gray-300 border-r border-gray-800">{c ? fmt(c.balance) : '—'}</td>
                  <td className="px-2 py-2 text-emerald-300">{r?.date ?? '—'}</td>
                  <td className="px-2 py-2 text-white">{r ? fmt(r.payment) : '—'}</td>
                  <td className={clsx('px-2 py-2', intDiff == null ? 'text-gray-400' : intDiff > 0.005 ? 'text-emerald-400' : 'text-red-400')}>
                    {r ? fmt(r.interest) : '—'}
                  </td>
                  <td className="px-2 py-2 text-gray-300">{r ? fmt(r.balance) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {maxLen > 24 && (
        <button
          onClick={() => setShowAll((s) => !s)}
          className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 mt-3 transition-colors"
        >
          {showAll ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {showAll ? 'Show first 24' : `Show all ${maxLen} rows`}
        </button>
      )}
    </div>
  )
}

function RefinanceTab({ data }) {
  const [newRate, setNewRate] = useState('')
  const [newTerm, setNewTerm] = useState(String(data.loan.term_months))
  const [result,  setResult]  = useState(null)

  const currentBalance = parseFloat(data.loan.current_balance)
  const currentRate    = parseFloat(data.loan.annual_rate_pct)
  const currentSched   = data.schedule   // already from current_balance

  const currentSummary = {
    monthlyPayment: parseFloat(data.loan.monthly_payment),
    months:         currentSched.length,
    totalInterest:  parseFloat(currentSched[currentSched.length - 1]?.cumulative_interest ?? 0),
    totalPaid:      currentSched.reduce((s, r) => s + parseFloat(r.payment), 0),
    payoffDate:     currentSched[currentSched.length - 1]?.payment_date ?? '—',
  }

  function compute() {
    const rate = parseFloat(newRate)
    const term = parseInt(newTerm, 10)
    if (!rate || !term || isNaN(rate) || isNaN(term) || rate <= 0 || term <= 0) return

    const today    = new Date().toISOString().split('T')[0]
    const refRows  = buildRefinanceSched(currentBalance, rate, term, today)
    const refPmt   = calcMonthlyPayment(currentBalance, rate, term)
    const totalInt = refRows.reduce((s, r) => s + r.interest, 0)
    const totalPd  = refRows.reduce((s, r) => s + r.payment,  0)

    setResult({
      rate, term, pmt: refPmt, rows: refRows,
      totalInterest: totalInt,
      totalPaid:     totalPd,
      payoffDate:    refRows[refRows.length - 1]?.date ?? '—',
      months:        refRows.length,
    })
  }

  const mthDiff  = result ? currentSummary.monthlyPayment - result.pmt   : null
  const intDiff  = result ? currentSummary.totalInterest  - result.totalInterest : null
  const timeDiff = result ? currentSummary.months - result.months : null

  // Chart: merge current vs refinanced balance by month index
  const chartData = result ? (() => {
    const map = {}
    currentSched.forEach((r) => { map[r.month] = { month: r.month, 'Current': parseFloat(r.balance) } })
    result.rows.forEach((r) => {
      if (map[r.month]) map[r.month]['Refinanced'] = r.balance
      else              map[r.month] = { month: r.month, 'Refinanced': r.balance }
    })
    return Object.values(map)
      .sort((a, b) => a.month - b.month)
      .filter((_, i, arr) => i % 3 === 0 || i === arr.length - 1)
  })() : []

  return (
    <div className="space-y-5">
      {/* Inputs */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Refinance Parameters</h3>
        <p className="text-xs text-gray-500 mb-4">
          Refinancing from current balance of <span className="text-white font-medium">{fmt(currentBalance)}</span> at <span className="text-amber-400">{currentRate}% APR</span>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">New APR (%)</label>
            <input
              type="number" step="0.001" min="0" value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              placeholder={`e.g. ${Math.max(1, currentRate - 1).toFixed(2)}`}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
            />
            {newRate && parseFloat(newRate) < currentRate && (
              <p className="text-[10px] text-emerald-500 mt-1">
                ↓ {(currentRate - parseFloat(newRate)).toFixed(3)}% lower than current
              </p>
            )}
            {newRate && parseFloat(newRate) > currentRate && (
              <p className="text-[10px] text-red-400 mt-1">
                ↑ {(parseFloat(newRate) - currentRate).toFixed(3)}% higher than current
              </p>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">New Term (months)</label>
            <input
              type="number" min="1" value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500 mb-2"
            />
            <div className="flex flex-wrap gap-1.5">
              {TERM_PRESETS.map((t) => (
                <button
                  key={t}
                  onClick={() => setNewTerm(String(t))}
                  className={clsx(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    newTerm === String(t)
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'
                  )}
                >
                  {t}mo
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={compute}
          disabled={!newRate || !newTerm}
          className="flex items-center gap-2 mt-4 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <RefreshCw size={14} /> Compare Refinance
        </button>
      </div>

      {result && (
        <>
          {/* Key impact chips */}
          <div className="grid grid-cols-3 gap-3">
            <div className={clsx(
              'rounded-xl p-4 text-center',
              mthDiff > 0 ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'
            )}>
              <p className="text-xs text-gray-400 mb-1">Monthly Payment</p>
              <p className={clsx('text-xl font-bold', mthDiff > 0 ? 'text-emerald-400' : 'text-red-400')}>
                {mthDiff > 0 ? '-' : '+'}{fmt(Math.abs(mthDiff))}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">{mthDiff > 0 ? 'savings' : 'increase'} /mo</p>
            </div>
            <div className={clsx(
              'rounded-xl p-4 text-center',
              intDiff > 0 ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'
            )}>
              <p className="text-xs text-gray-400 mb-1">Total Interest</p>
              <p className={clsx('text-xl font-bold', intDiff > 0 ? 'text-emerald-400' : 'text-red-400')}>
                {intDiff > 0 ? 'Save ' : 'Pay '}{fmt(Math.abs(intDiff))}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">over full term</p>
            </div>
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">Term {timeDiff > 0 ? 'Shorter' : timeDiff < 0 ? 'Longer' : 'Same'}</p>
              <p className="text-xl font-bold text-violet-400">
                {timeDiff === 0 ? '—' : `${Math.abs(timeDiff)} mo`}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                {timeDiff !== 0 ? `${(Math.abs(timeDiff) / 12).toFixed(1)} yrs` : 'no change'}
              </p>
            </div>
          </div>

          {/* Side-by-side breakdown */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800/40 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Current Loan</p>
              <div className="space-y-2.5 text-sm">
                {[
                  ['Rate',            <span className="text-amber-400">{currentRate}%</span>],
                  ['Monthly Payment', <span className="text-white font-medium">{fmt(currentSummary.monthlyPayment)}</span>],
                  ['Months Remaining',<span className="text-white font-medium">{currentSummary.months}</span>],
                  ['Total Interest',  <span className="text-red-400 font-medium">{fmt(currentSummary.totalInterest)}</span>],
                  ['Total Cost',      <span className="text-white font-medium">{fmt(currentSummary.totalPaid)}</span>],
                  ['Payoff Date',     <span className="text-gray-300">{currentSummary.payoffDate}</span>],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-gray-500">{label}</span>
                    {value}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-4">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3">Refinanced</p>
              <div className="space-y-2.5 text-sm">
                {[
                  ['Rate',           <span className={clsx('font-medium', result.rate < currentRate ? 'text-emerald-400' : 'text-red-400')}>{result.rate}%</span>],
                  ['Monthly Payment',
                    <div className="text-right">
                      <span className={clsx('font-medium', mthDiff > 0 ? 'text-emerald-400' : 'text-red-400')}>{fmt(result.pmt)}</span>
                      {Math.abs(mthDiff) > 0.005 && (
                        <span className={clsx('text-xs ml-1.5', mthDiff > 0 ? 'text-emerald-600' : 'text-red-600')}>
                          ({mthDiff > 0 ? '−' : '+'}{fmt(Math.abs(mthDiff))})
                        </span>
                      )}
                    </div>],
                  ['Term',           <span className="text-white font-medium">{result.term} mo</span>],
                  ['Total Interest',
                    <div className="text-right">
                      <span className={clsx('font-medium', intDiff > 0 ? 'text-emerald-400' : 'text-red-400')}>{fmt(result.totalInterest)}</span>
                      {Math.abs(intDiff) > 0.005 && (
                        <span className={clsx('text-xs ml-1.5', intDiff > 0 ? 'text-emerald-600' : 'text-red-600')}>
                          ({intDiff > 0 ? 'save ' : '+'}{fmt(Math.abs(intDiff))})
                        </span>
                      )}
                    </div>],
                  ['Total Cost',     <span className="text-white font-medium">{fmt(result.totalPaid)}</span>],
                  ['Payoff Date',    <span className="text-gray-300">{result.payoffDate}</span>],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-gray-500">{label}</span>
                    {value}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Balance comparison chart */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Balance Comparison</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="refCur" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6b7280" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6b7280" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="refNew" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="month" stroke="#4b5563" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis stroke="#4b5563" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={fmtK} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                  formatter={(v, name) => [fmt(v), name]}
                />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                <Area type="monotone" dataKey="Current"    stroke="#6b7280" fill="url(#refCur)" strokeWidth={2} strokeDasharray="5 3" />
                <Area type="monotone" dataKey="Refinanced" stroke="#10b981" fill="url(#refNew)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Schedule comparison table */}
          <RefScheduleTable current={currentSched} refinanced={result.rows} />
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
  { id: 'refinance', label: 'Refinance',   icon: RefreshCw },
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
              {tab === 'overview'  && <OverviewTab data={data} />}
              {tab === 'schedule'  && <ScheduleTab data={data} loan={loan} />}
              {tab === 'whatif'    && <WhatIfTab loan={loan} method={method} />}
              {tab === 'refinance' && <RefinanceTab data={data} />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
