import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, AreaChart, Area, Legend,
} from 'recharts'
import {
  CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp,
  Wallet, PiggyBank, Pencil, Check, X, Target, TrendingDown,
  DollarSign, Zap, Play, Save, RefreshCw,
} from 'lucide-react'
import clsx from 'clsx'
import api from '../lib/api'

// ── helpers ───────────────────────────────────────────────────────────────────
const fmt  = (n) => '$' + Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = (n) => { const v = Number(n ?? 0); return v >= 1000 ? `$${(v/1000).toFixed(1)}k` : fmt(v) }

function weekLabel(start, end) {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end   + 'T00:00:00')
  const mo = s.toLocaleDateString('en-US', { month: 'short' })
  return `${mo} ${s.getDate()} – ${e.getDate()}`
}

// ── Income Edit Inline ────────────────────────────────────────────────────────
function IncomeEdit({ weekPlan, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')

  const start = () => {
    setVal(String(Number(weekPlan?.income_actual ?? weekPlan?.income_expected ?? 1582.06)))
    setEditing(true)
  }
  const save = () => {
    onSave(parseFloat(val) || 0)
    setEditing(false)
  }

  if (!weekPlan) return null

  return editing ? (
    <div className="flex items-center gap-1">
      <span className="text-gray-500 text-xs">$</span>
      <input
        autoFocus
        type="number"
        step="0.01"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        className="w-24 bg-gray-700 border border-violet-500 rounded px-2 py-0.5 text-sm text-white focus:outline-none"
      />
      <button onClick={save} className="text-emerald-400 hover:text-emerald-300"><Check size={13} /></button>
      <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-gray-300"><X size={13} /></button>
    </div>
  ) : (
    <button
      onClick={start}
      className="flex items-center gap-1 text-sm font-semibold text-white hover:text-violet-300 transition-colors group"
    >
      {weekPlan.income_actual != null
        ? <><span className="text-emerald-400">{fmt(weekPlan.income_actual)}</span><span className="text-gray-600 text-xs"> received</span></>
        : <>{fmt(weekPlan.income_expected)}<span className="text-gray-600 text-xs"> expected</span></>
      }
      <Pencil size={11} className="text-gray-600 group-hover:text-violet-400 ml-1" />
    </button>
  )
}

// ── Category Chart ────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-white mb-1">{d.category}</p>
      <p className="text-gray-300">Spent: <span className="text-white font-mono">{fmt(d.actual)}</span></p>
      {d.limit != null && (
        <p className="text-gray-300">Budget: <span className="text-white font-mono">{fmt(d.limit)}</span></p>
      )}
      {d.limit != null && (
        <p className={d.actual > d.limit ? 'text-red-400' : 'text-emerald-400'}>
          {d.actual > d.limit ? `${fmt(d.actual - d.limit)} over` : `${fmt(d.limit - d.actual)} left`}
        </p>
      )}
    </div>
  )
}

function CategoryChart({ trackedRows }) {
  if (!trackedRows.length) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-600">
        No spending this week yet
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, trackedRows.length * 44)}>
      <BarChart
        data={trackedRows}
        layout="vertical"
        margin={{ top: 4, right: 80, left: 0, bottom: 4 }}
        barCategoryGap="28%"
      >
        <CartesianGrid horizontal={false} stroke="#374151" strokeDasharray="3 3" />
        <XAxis
          type="number"
          tickFormatter={v => `$${v}`}
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false} tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="category"
          width={110}
          tick={{ fill: '#d1d5db', fontSize: 12 }}
          axisLine={false} tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />

        {/* Budget reference bar (background) */}
        <Bar dataKey="limit" name="Budget" fill="#1f2937" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {trackedRows.map((r, i) => (
            <Cell key={i} fill={r.limit != null ? '#1f2937' : 'transparent'} />
          ))}
        </Bar>

        {/* Actual spending bar */}
        <Bar dataKey="actual" name="Spent" radius={[0, 4, 4, 0]}>
          {trackedRows.map((r, i) => (
            <Cell
              key={i}
              fill={
                r.limit == null ? '#6366f1'
                : r.actual >= r.limit ? '#ef4444'
                : r.actual / r.limit > 0.75 ? '#f59e0b'
                : '#10b981'
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Allocation Flow ───────────────────────────────────────────────────────────
function AllocationFlow({ plan, incomeTrigger, onIncomeEdit }) {
  const income = plan?.income_actual ?? plan?.income_expected ?? 0
  const toChase = plan?.transfer_to_savings ?? 0
  const toWells = plan?.spending_budget ?? 0

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-3">Paycheck allocation</p>

      {/* Income */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <DollarSign size={14} className="text-emerald-400" />
          <span className="text-sm text-gray-300">Income this week</span>
        </div>
        {plan ? (
          <IncomeEdit weekPlan={plan} onSave={onIncomeEdit} />
        ) : (
          <span className="text-sm text-gray-600">No plan</span>
        )}
      </div>

      {plan && (
        <>
          <div className="border-t border-gray-800 my-2" />

          {/* Chase */}
          <div className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-2">
              <PiggyBank size={13} className="text-violet-400" />
              <div>
                <span className="text-sm text-gray-300">→ Chase</span>
                <p className="text-xs text-gray-600">Debt payments + savings</p>
              </div>
            </div>
            <span className="text-sm font-bold text-violet-300 font-mono">{fmt(toChase)}</span>
          </div>

          {/* Wells Fargo */}
          <div className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-2">
              <Wallet size={13} className="text-emerald-400" />
              <div>
                <span className="text-sm text-gray-300">→ Wells Fargo</span>
                <p className="text-xs text-gray-600">Weekly spending</p>
              </div>
            </div>
            <span className="text-sm font-bold text-emerald-300 font-mono">{fmt(toWells)}</span>
          </div>

          {/* Visual split bar */}
          {income > 0 && (
            <div className="mt-3 h-2 rounded-full bg-gray-800 overflow-hidden flex">
              <div
                className="h-full bg-violet-500 transition-all"
                style={{ width: `${Math.min(100, (toChase / income) * 100)}%` }}
              />
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, (toWells / income) * 100)}%` }}
              />
            </div>
          )}

          {incomeTrigger?.trigger && (
            <div className="mt-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
              <p className="text-xs text-emerald-400 font-medium">💸 Paycheck landed — transfer {fmt(toChase)} to Chase now</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Debt Payments ─────────────────────────────────────────────────────────────
function DebtPayments({ debtPayments }) {
  if (!debtPayments?.length) return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Debt payments this week</p>
      <p className="text-sm text-gray-600">No debt payments planned</p>
    </div>
  )

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-3">Debt payments this week</p>
      <div className="space-y-2">
        {debtPayments.map((dp, i) => (
          <div key={i} className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-amber-400 font-bold w-4 flex-shrink-0">#{dp.priority}</span>
              <div className="min-w-0">
                <p className="text-sm text-gray-200 truncate">{dp.loan_name}</p>
                {dp.note && <p className="text-xs text-gray-500 italic truncate">{dp.note}</p>}
              </div>
            </div>
            <span className="text-sm font-mono font-semibold text-white flex-shrink-0">{fmt(dp.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Month Strip ───────────────────────────────────────────────────────────────
function MonthStrip({ weeks, activeWeekStart, onSelect }) {
  return (
    <div className="flex gap-2 mb-6">
      {weeks.map(w => {
        const isActive = w.week_start === activeWeekStart
        const isCurrent = w.is_current
        const hasPlan = !!w.plan
        const spent = w.actuals?.total_spending ?? 0
        const budget = w.plan?.spending_budget ?? 0
        const over = budget > 0 && spent > budget

        return (
          <button
            key={w.week_start}
            onClick={() => onSelect(w.week_start)}
            className={clsx(
              'flex-1 rounded-xl border px-3 py-2.5 text-left transition-all',
              isActive
                ? 'border-violet-500/60 bg-violet-500/10'
                : 'border-gray-800 bg-gray-900 hover:border-gray-700',
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <span className={clsx('text-xs font-semibold', isActive ? 'text-violet-300' : 'text-gray-400')}>
                {weekLabel(w.week_start, w.week_end)}
              </span>
              {isCurrent && (
                <span className="text-[10px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full">Now</span>
              )}
            </div>
            {hasPlan ? (
              <>
                <p className={clsx('text-xs font-mono font-bold', over ? 'text-red-400' : 'text-white')}>
                  {fmtK(spent)}
                  <span className="text-gray-600 font-normal"> / {fmtK(budget)}</span>
                </p>
                {budget > 0 && (
                  <div className="mt-1.5 h-1 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full', over ? 'bg-red-500' : 'bg-emerald-500')}
                      style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }}
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-600">No plan</p>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Draft Banner ──────────────────────────────────────────────────────────────
function DraftBanner({ draft, onApprove, onReject, approving, rejecting }) {
  const [expanded, setExpanded] = useState(false)
  if (!draft) return null

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-300">Budget update needs your approval</p>
            <p className="text-xs text-gray-400 mt-0.5">"{draft.name}" — proposed by AI Agent</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onApprove}
            disabled={approving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <CheckCircle size={13} /> {approving ? 'Activating…' : 'Approve'}
          </button>
          <button
            onClick={onReject}
            disabled={rejecting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors"
          >
            <XCircle size={13} /> Discard
          </button>
          <button onClick={() => setExpanded(e => !e)} className="text-gray-500 hover:text-gray-300 ml-1">
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {expanded && draft.notes && (
        <p className="mt-3 text-xs text-gray-400 italic border-l-2 border-amber-500/30 pl-3">{draft.notes}</p>
      )}

      {expanded && draft.debt_targets?.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {draft.debt_targets.sort((a, b) => a.priority - b.priority).map(dt => (
            <div key={dt.id} className="bg-gray-800/60 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
              <span className="text-gray-300"><span className="text-amber-400 font-bold mr-1">#{dt.priority}</span>{dt.loan_name}</span>
              <span className="text-white font-mono">{fmtK(dt.default_monthly_target)}/mo</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Empty State ────────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="w-16 h-16 rounded-2xl bg-violet-600/10 flex items-center justify-center mb-4">
        <Target size={28} className="text-violet-400" />
      </div>
      <p className="text-lg font-semibold text-white">No active budget yet</p>
      <p className="text-sm text-gray-500 mt-2 max-w-sm">
        Ask the AI Agent to build your budget plan. It will draft a week-by-week breakdown you can review and approve here.
      </p>
      <div className="mt-5 bg-gray-900 border border-gray-800 rounded-xl px-5 py-3 text-xs text-gray-400 max-w-md text-left">
        Try in the AI Agent: <span className="text-violet-400">"Create my budget based on the debt payoff plan we discussed"</span>
      </div>
    </div>
  )
}

// ── Optimizer ─────────────────────────────────────────────────────────────────

const LOAN_STRATEGIES = [
  { value: 'attack',       label: 'Attack',        desc: 'Pay as much as possible' },
  { value: 'minimum_only', label: 'Minimum only',  desc: 'Just the required payment' },
  { value: 'exact',        label: 'Exact amount',  desc: 'Fixed monthly amount' },
  { value: 'skip',         label: 'Skip',          desc: 'Exclude from plan' },
]

function OptimizerTab() {
  const [params, setParams] = useState(null)
  const [results, setResults] = useState(null)
  const [showAllMonths, setShowAllMonths] = useState(false)

  // Load defaults (from transaction history) or saved config
  const { data: defaults, isLoading: loadingDefaults } = useQuery({
    queryKey: ['optimizer-defaults'],
    queryFn: () => api.get('/budget/optimizer/defaults/').then(r => r.data),
  })
  const { data: savedConfig } = useQuery({
    queryKey: ['optimizer-config'],
    queryFn: () => api.get('/budget/optimizer/config/').then(r => r.data),
  })

  // Initialise params from saved config, else from defaults
  useEffect(() => {
    if (params) return
    const src = savedConfig || defaults
    if (src) setParams({
      weekly_income: src.weekly_income ?? 1582.06,
      savings_target_pct: src.savings_target_pct ?? 5,
      strategy: src.strategy ?? 'avalanche',
      categories: src.categories ?? [],
      loans: src.loans ?? [],
    })
  }, [savedConfig, defaults])

  const { mutate: runOptimizer, isPending: running } = useMutation({
    mutationFn: () => api.post('/budget/optimizer/run/', params),
    onSuccess: ({ data }) => setResults(data),
  })

  if (loadingDefaults || !params) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const updateCategory = (i, field, val) => {
    setParams(p => {
      const cats = [...p.categories]
      cats[i] = { ...cats[i], [field]: val }
      // If fixed, keep ceiling = floor
      if (field === 'floor_monthly' && cats[i].is_fixed) cats[i].ceiling_monthly = val
      if (field === 'is_fixed' && val) cats[i].ceiling_monthly = cats[i].floor_monthly
      return { ...p, categories: cats }
    })
  }

  const updateLoan = (i, field, val) => {
    setParams(p => {
      const loans = [...p.loans]
      loans[i] = { ...loans[i], [field]: val }
      return { ...p, loans }
    })
  }

  const totalFloor   = params.categories.reduce((s, c) => s + Number(c.floor_monthly   || 0), 0)
  const totalCeiling = params.categories.reduce((s, c) => s + Number(c.ceiling_monthly || 0), 0)
  const monthlyIncome = Number(params.weekly_income) * (52 / 12)
  const savingsMin = monthlyIncome * Number(params.savings_target_pct) / 100
  const totalMinPayments = params.loans.filter(l => l.strategy !== 'skip')
    .reduce((s, l) => s + Number(l.monthly_minimum || 0), 0)
  const freeMoneyEstimate = Math.max(0, monthlyIncome - totalFloor - totalMinPayments - savingsMin)

  return (
    <div className="grid grid-cols-5 gap-5">
      {/* ── Left: Parameter form ── */}
      <div className="col-span-2 space-y-4">

        {/* Income & strategy */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-4">
          <p className="text-sm font-semibold text-white">Income & strategy</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Weekly income ($)</label>
              <input type="number" step="0.01"
                value={params.weekly_income}
                onChange={e => setParams(p => ({ ...p, weekly_income: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Min savings % of income</label>
              <input type="number" step="0.5" min="0" max="50"
                value={params.savings_target_pct}
                onChange={e => setParams(p => ({ ...p, savings_target_pct: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-2">Payoff strategy</label>
            <div className="flex gap-2">
              {[['avalanche','Avalanche','Highest APR first — min interest paid'],['snowball','Snowball','Smallest balance first — fastest wins']].map(([v,l,d]) => (
                <button key={v} onClick={() => setParams(p => ({ ...p, strategy: v }))}
                  className={clsx('flex-1 rounded-xl border px-3 py-2.5 text-left transition-all',
                    params.strategy === v ? 'border-violet-500 bg-violet-500/10' : 'border-gray-700 hover:border-gray-600'
                  )}>
                  <p className={clsx('text-xs font-semibold', params.strategy === v ? 'text-violet-300' : 'text-gray-300')}>{l}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{d}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Free money estimate */}
          <div className="bg-gray-800/60 rounded-xl p-3 text-xs space-y-1">
            <div className="flex justify-between text-gray-400"><span>Monthly income</span><span className="font-mono text-white">{fmt(monthlyIncome)}</span></div>
            <div className="flex justify-between text-gray-400"><span>Spending floor</span><span className="font-mono text-red-400">- {fmt(totalFloor)}</span></div>
            <div className="flex justify-between text-gray-400"><span>Loan minimums</span><span className="font-mono text-red-400">- {fmt(totalMinPayments)}</span></div>
            <div className="flex justify-between text-gray-400"><span>Min savings ({params.savings_target_pct}%)</span><span className="font-mono text-red-400">- {fmt(savingsMin)}</span></div>
            <div className="flex justify-between font-semibold border-t border-gray-700 pt-1 mt-1">
              <span className="text-gray-300">Free to attack debt</span>
              <span className={clsx('font-mono', freeMoneyEstimate > 0 ? 'text-emerald-400' : 'text-red-400')}>{fmt(freeMoneyEstimate)}</span>
            </div>
          </div>
        </div>

        {/* Spending categories */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-white">Spending constraints</p>
            <p className="text-xs text-gray-500">Floor = must spend · Ceiling = max allowed</p>
          </div>
          <div className="space-y-2">
            {params.categories.map((cat, i) => (
              <div key={cat.category_name} className="bg-gray-800/50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-300">{cat.category_name}</span>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={cat.is_fixed || false}
                      onChange={e => updateCategory(i, 'is_fixed', e.target.checked)}
                      className="accent-violet-500" />
                    Fixed
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Floor /mo</label>
                    <input type="number" step="1" min="0"
                      value={cat.floor_monthly}
                      onChange={e => updateCategory(i, 'floor_monthly', e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Ceiling /mo</label>
                    <input type="number" step="1" min="0"
                      value={cat.is_fixed ? cat.floor_monthly : cat.ceiling_monthly}
                      disabled={cat.is_fixed}
                      onChange={e => updateCategory(i, 'ceiling_monthly', e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500 disabled:opacity-40"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-xs text-gray-500 border-t border-gray-800 pt-2">
            <span>Total floor: <span className="text-white font-mono">{fmt(totalFloor)}/mo</span></span>
            <span>Total ceiling: <span className="text-white font-mono">{fmt(totalCeiling)}/mo</span></span>
          </div>
        </div>

        {/* Loan strategies */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p className="text-sm font-semibold text-white mb-3">Loan strategies</p>
          <div className="space-y-3">
            {params.loans.map((loan, i) => (
              <div key={loan.loan_id} className="bg-gray-800/50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs font-medium text-gray-200">{loan.loan_name}</p>
                    <p className="text-xs text-gray-500">
                      {fmt(loan.current_balance)} · {loan.apr}% APR · min {fmt(loan.monthly_minimum)}/mo
                    </p>
                  </div>
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium',
                    loan.apr > 20 ? 'bg-red-500/15 text-red-400' :
                    loan.apr > 10 ? 'bg-amber-500/15 text-amber-400' :
                    'bg-gray-700 text-gray-400'
                  )}>{loan.apr}%</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {LOAN_STRATEGIES.map(s => (
                    <button key={s.value}
                      onClick={() => updateLoan(i, 'strategy', s.value)}
                      title={s.desc}
                      className={clsx('text-xs px-2.5 py-1 rounded-lg border transition-colors',
                        loan.strategy === s.value
                          ? 'border-violet-500 bg-violet-500/15 text-violet-300'
                          : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300'
                      )}>
                      {s.label}
                    </button>
                  ))}
                </div>
                {loan.strategy === 'exact' && (
                  <div className="mt-2">
                    <label className="text-xs text-gray-500 block mb-1">Exact monthly amount ($)</label>
                    <input type="number" step="1" min="0"
                      value={loan.exact_monthly_override || ''}
                      onChange={e => updateLoan(i, 'exact_monthly_override', e.target.value)}
                      placeholder={String(loan.monthly_minimum)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => runOptimizer()}
          disabled={running}
          className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
        >
          {running ? <><RefreshCw size={16} className="animate-spin" /> Optimizing…</> : <><Play size={16} /> Run Optimizer</>}
        </button>
      </div>

      {/* ── Right: Results ── */}
      <div className="col-span-3 space-y-4">
        {!results ? (
          <div className="flex flex-col items-center justify-center h-96 border border-dashed border-gray-800 rounded-2xl text-center gap-3">
            <Zap size={32} className="text-gray-700" />
            <p className="text-gray-500 text-sm">Set your parameters and click <strong className="text-gray-400">Run Optimizer</strong></p>
            <p className="text-xs text-gray-600 max-w-xs">The optimizer calculates the exact budget per category that gets you debt-free fastest, then shows you the payoff timeline.</p>
          </div>
        ) : (() => {
          const rb = results.recommended_budget
          const weeks_per_month = 52 / 12
          return (
          <>
            {/* ── 1. RECOMMENDED BUDGET — the main output ── */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Your Optimized Budget</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {results.delta.strategy === 'avalanche' ? 'Avalanche' : 'Snowball'} · {rb.flex_ratio_pct}% of spending flexibility used
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Debt-free by</p>
                  <p className="text-sm font-bold text-emerald-400">{results.optimized.summary.debt_free_month ?? '—'}</p>
                </div>
              </div>

              {/* Income flow */}
              <div className="px-5 py-3 bg-gray-800/30 border-b border-gray-800 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Weekly income</p>
                  <p className="font-bold text-white">{fmt(params.weekly_income)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">→ Chase (debt + savings)</p>
                  <p className="font-bold text-violet-400">{fmt(rb.transfer_to_savings_weekly)}<span className="text-xs text-gray-500 font-normal">/wk</span></p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">→ Wells Fargo (spending)</p>
                  <p className="font-bold text-emerald-400">{fmt(rb.total_spending_weekly)}<span className="text-xs text-gray-500 font-normal">/wk</span></p>
                </div>
              </div>

              {/* Category budget table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="px-5 py-2.5 text-left text-xs text-gray-500 font-medium">Category</th>
                    <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">Weekly</th>
                    <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">Monthly</th>
                    <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-medium">Floor → Ceiling</th>
                    <th className="px-5 py-2.5 text-left text-xs text-gray-500 font-medium w-32">Flexibility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {rb.categories.map(cat => {
                    const flexPct = cat.ceiling_monthly > cat.floor_monthly
                      ? ((cat.recommended_monthly - cat.floor_monthly) / (cat.ceiling_monthly - cat.floor_monthly)) * 100
                      : 100
                    return (
                      <tr key={cat.category_name} className="hover:bg-gray-800/20">
                        <td className="px-5 py-3">
                          <span className="text-gray-200">{cat.category_name}</span>
                          {cat.is_fixed && <span className="ml-2 text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">fixed</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-white">
                          {fmt(cat.recommended_weekly)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-300">
                          {fmt(cat.recommended_monthly)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-gray-500 font-mono">
                          {fmt(cat.floor_monthly)} → {fmt(cat.ceiling_monthly)}
                        </td>
                        <td className="px-5 py-3">
                          {cat.is_fixed ? (
                            <span className="text-xs text-gray-600">—</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                <div className={clsx('h-full rounded-full',
                                  flexPct < 25 ? 'bg-red-500' : flexPct < 60 ? 'bg-amber-500' : 'bg-emerald-500'
                                )} style={{ width: `${Math.min(100, flexPct)}%` }} />
                              </div>
                              <span className="text-xs text-gray-500 w-8">{Math.round(flexPct)}%</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="border-t-2 border-gray-700">
                  <tr className="bg-gray-800/30">
                    <td className="px-5 py-3 text-sm font-semibold text-white">Total spending</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">{fmt(rb.total_spending_weekly)}/wk</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">{fmt(rb.total_spending_monthly)}/mo</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>

              {/* Debt payments section */}
              {rb.debt_targets?.length > 0 && (
                <div className="border-t border-gray-800">
                  <p className="px-5 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wide border-b border-gray-800">Debt payments (Chase account)</p>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-800/50">
                      {rb.debt_targets.map((dt, i) => (
                        <tr key={i} className="hover:bg-gray-800/20">
                          <td className="px-5 py-2.5">
                            <span className="text-gray-200">{dt.loan_name}</span>
                            {dt.is_extra && <span className="ml-2 text-xs text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">extra payment</span>}
                            <span className="ml-2 text-xs text-gray-600">{dt.apr.toFixed(2)}% APR</span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-semibold text-violet-300">{fmt(dt.weekly_payment)}/wk</td>
                          <td className="px-4 py-3 text-right font-mono text-gray-400">{fmt(dt.monthly_payment)}/mo</td>
                          <td colSpan={2} />
                        </tr>
                      ))}
                      {rb.savings_monthly > 0 && (
                        <tr className="hover:bg-gray-800/20">
                          <td className="px-5 py-2.5 text-gray-400">Savings ({params.savings_target_pct}% target)</td>
                          <td className="px-4 py-2.5 text-right font-mono font-semibold text-teal-400">{fmt(rb.savings_monthly / weeks_per_month)}/wk</td>
                          <td className="px-4 py-3 text-right font-mono text-gray-400">{fmt(rb.savings_monthly)}/mo</td>
                          <td colSpan={2} />
                        </tr>
                      )}
                    </tbody>
                    <tfoot className="border-t-2 border-gray-700">
                      <tr className="bg-gray-800/30">
                        <td className="px-5 py-3 text-sm font-semibold text-white">Total to Chase</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-violet-400">{fmt(rb.transfer_to_savings_weekly)}/wk</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-violet-400">{fmt(rb.transfer_to_savings_monthly)}/mo</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* ── 2. Comparison summary ── */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-4">
                <p className="text-xs text-gray-400">Interest saved</p>
                <p className="text-2xl font-bold text-emerald-400 mt-0.5">{fmt(results.delta.interest_saved)}</p>
                <p className="text-xs text-gray-500 mt-0.5">vs paying minimums</p>
              </div>
              <div className="bg-violet-500/10 border border-violet-500/25 rounded-2xl p-4">
                <p className="text-xs text-gray-400">Months saved</p>
                <p className="text-2xl font-bold text-violet-400 mt-0.5">{results.delta.months_saved}</p>
                <p className="text-xs text-gray-500 mt-0.5">sooner debt-free</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <p className="text-xs text-gray-400">Min-only debt-free</p>
                <p className="text-2xl font-bold text-gray-300 mt-0.5">{results.minimums.summary.debt_free_month ?? '—'}</p>
                <p className="text-xs text-gray-500 mt-0.5">vs {results.optimized.summary.debt_free_month} optimized</p>
              </div>
            </div>

            {/* ── 3. Timeline chart ── */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <p className="text-sm font-semibold text-white mb-1">Payoff timeline</p>
              <p className="text-xs text-gray-500 mb-4">Remaining debt · Optimized vs Minimums only</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
                  data={results.optimized.months.map((m, i) => ({
                    month: m.month,
                    optimized: m.total_debt,
                    minimums: results.minimums.months[i]?.total_debt ?? 0,
                    savings: m.cumulative_savings,
                  }))}>
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 10 }}
                    tickFormatter={v => v.slice(2).replace('-', '/')}
                    interval={Math.floor(results.optimized.months.length / 8)} />
                  <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fill: '#6b7280', fontSize: 11 }} width={52} />
                  <Tooltip formatter={(v, n) => [fmt(v), n === 'optimized' ? 'Optimized debt' : n === 'minimums' ? 'Min-only debt' : 'Savings']}
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: '#9ca3af' }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                  <Area type="monotone" dataKey="minimums"  stroke="#6b7280" fill="#1f2937"  fillOpacity={0.4} strokeWidth={1.5} name="minimums" />
                  <Area type="monotone" dataKey="optimized" stroke="#8b5cf6" fill="#8b5cf6"  fillOpacity={0.12} strokeWidth={2}  name="optimized" />
                  <Area type="monotone" dataKey="savings"   stroke="#10b981" fill="#10b981"  fillOpacity={0.08} strokeWidth={1.5} name="savings" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* ── 4. Month-by-month table ── */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <p className="text-sm font-semibold text-white">Month-by-month detail</p>
                <button onClick={() => setShowAllMonths(s => !s)}
                  className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
                  {showAllMonths ? 'Show less' : 'Show all'} {showAllMonths ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-800/50">
                    <tr>{['Month','Income','Spending','Debt paid','Interest','Savings','Remaining debt'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-gray-400 font-medium whitespace-nowrap">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {(showAllMonths ? results.optimized.months : results.optimized.months.slice(0, 12)).map(m => (
                      <tr key={m.month} className={clsx('hover:bg-gray-800/30', m.debt_free && 'bg-emerald-500/5')}>
                        <td className="px-3 py-2 font-mono text-gray-400">{m.month}</td>
                        <td className="px-3 py-2 font-mono text-emerald-400">{fmt(m.income)}</td>
                        <td className="px-3 py-2 font-mono text-gray-300">{fmt(m.spending)}</td>
                        <td className="px-3 py-2 font-mono text-violet-400">{fmt(m.total_debt_payment)}</td>
                        <td className="px-3 py-2 font-mono text-red-400">{fmt(m.interest_paid)}</td>
                        <td className="px-3 py-2 font-mono text-teal-400">{fmt(m.savings)}</td>
                        <td className="px-3 py-2 font-mono text-white">
                          {m.debt_free ? <span className="text-emerald-400 font-semibold">✓ Debt free</span> : fmt(m.total_debt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
          )
        })()}
      </div>
    </div>
  )
}


// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Budget() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('budget')
  const [selectedWeek, setSelectedWeek] = useState(null)

  const { data: budgetData, isLoading } = useQuery({
    queryKey: ['budget'],
    queryFn: () => api.get('/budget/').then(r => r.data),
  })
  const { data: monthData } = useQuery({
    queryKey: ['budget-current-month'],
    queryFn: () => api.get('/budget/current-month/').then(r => r.data),
    enabled: !!budgetData?.active,
    onSuccess: (d) => {
      if (!selectedWeek) {
        const cur = d.weeks?.find(w => w.is_current)
        if (cur) setSelectedWeek(cur.week_start)
      }
    },
  })
  const { data: incomeTrigger } = useQuery({
    queryKey: ['budget-income-trigger'],
    queryFn: () => api.get('/budget/income-trigger/').then(r => r.data),
    enabled: !!budgetData?.active,
    refetchInterval: 60_000,
  })

  const { mutate: approve, isPending: approving } = useMutation({
    mutationFn: (id) => api.post(`/budget/${id}/approve/`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['budget'] }); qc.invalidateQueries({ queryKey: ['budget-current-month'] }) },
  })
  const { mutate: reject, isPending: rejecting } = useMutation({
    mutationFn: (id) => api.delete(`/budget/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget'] }),
  })
  const { mutate: saveIncome } = useMutation({
    mutationFn: ({ planId, income }) => api.patch(`/budget/week-plan/${planId}/`, { income_actual: income }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget-current-month'] }),
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const active = budgetData?.active
  const draft  = budgetData?.draft

  if (!active && !draft) return <EmptyState />

  const weeks = monthData?.weeks ?? []
  const categoryLimits = monthData?.category_limits ?? []
  const limitMap = Object.fromEntries(categoryLimits.map(cl => [cl.category_name, cl.weekly_limit]))

  // Determine which week to show
  const activeWeek = weeks.find(w => w.week_start === selectedWeek) ?? weeks.find(w => w.is_current) ?? weeks[0]
  const plan = activeWeek?.plan
  const actuals = activeWeek?.actuals ?? { spending_by_category: {}, total_spending: 0, income: 0 }

  // Split spending into tracked (has limit) vs other (no limit, or not in budget)
  // Exclude debt-related categories from the budget tracking chart
  const DEBT_CATEGORY_KEYWORDS = ['debt payment', 'loan', 'transfer']
  const trackedRows = []
  const otherRows   = []

  Object.entries(actuals.spending_by_category).forEach(([cat, actual]) => {
    const catLower = cat.toLowerCase()
    const isDebtCategory = DEBT_CATEGORY_KEYWORDS.some(k => catLower.includes(k))
    const limit = limitMap[cat] ?? null

    if (isDebtCategory) return // debt payments are shown in the debt section, not spending

    if (limit != null) {
      trackedRows.push({ category: cat, actual, limit })
    } else {
      otherRows.push({ category: cat, actual })
    }
  })
  trackedRows.sort((a, b) => b.actual - a.actual)
  otherRows.sort((a, b) => b.actual - a.actual)

  // Totals for tracked categories only
  const trackedSpent  = trackedRows.reduce((s, r) => s + r.actual, 0)
  const trackedBudget = trackedRows.reduce((s, r) => s + (r.limit ?? 0), 0)

  return (
    <div className="p-6 min-h-screen">
      {/* Header + tabs */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Budget</h1>
          {active && tab === 'budget' && (
            <p className="text-xs text-gray-500 mt-1">
              {active.name}
              {active.spending_account_name && ` · Spending → ${active.spending_account_name}`}
              {active.savings_account_name  && ` · Savings → ${active.savings_account_name}`}
            </p>
          )}
        </div>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
          {[['budget','Weekly Budget'],['optimizer','Optimizer']].map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
                tab === t ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-gray-200'
              )}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Optimizer tab */}
      {tab === 'optimizer' && <OptimizerTab />}

      {tab === 'budget' && <>
      {/* Draft approval */}
      {draft && (
        <div className="mt-4">
          <DraftBanner
            draft={draft}
            onApprove={() => approve(draft.id)}
            onReject={() => reject(draft.id)}
            approving={approving}
            rejecting={rejecting}
          />
        </div>
      )}

      {active && (
        <>
          {/* Week tabs */}
          {weeks.length > 0 && (
            <div className="mt-5">
              <MonthStrip
                weeks={weeks}
                activeWeekStart={activeWeek?.week_start}
                onSelect={setSelectedWeek}
              />
            </div>
          )}

          {/* Main 2-column layout */}
          <div className="grid grid-cols-3 gap-5">
            {/* Left: spending chart */}
            <div className="col-span-2 space-y-4">

              {/* Tracked categories chart */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold text-white">Spending vs Budget</p>
                    <p className="text-xs text-gray-500 mt-0.5">Tracked categories only · {activeWeek ? weekLabel(activeWeek.week_start, activeWeek.week_end) : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className={clsx('text-lg font-bold font-mono', trackedSpent > trackedBudget && trackedBudget > 0 ? 'text-red-400' : 'text-white')}>
                      {fmt(trackedSpent)}
                      {trackedBudget > 0 && <span className="text-gray-500 text-sm font-normal"> / {fmt(trackedBudget)}</span>}
                    </p>
                    {trackedBudget > 0 && (
                      <p className={clsx('text-xs', trackedSpent > trackedBudget ? 'text-red-400' : 'text-emerald-400')}>
                        {trackedSpent > trackedBudget
                          ? `${fmt(trackedSpent - trackedBudget)} over budget`
                          : `${fmt(trackedBudget - trackedSpent)} remaining`}
                      </p>
                    )}
                  </div>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />Under budget</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />&gt;75% used</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />Over budget</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gray-700 inline-block" />Budget limit</span>
                </div>

                <CategoryChart trackedRows={trackedRows} />

                {/* Untracked / no-limit categories */}
                {otherRows.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-gray-800">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Other spending (no limit set)</p>
                    <div className="grid grid-cols-2 gap-2">
                      {otherRows.map(r => (
                        <div key={r.category} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2">
                          <span className="text-xs text-gray-400 truncate">{r.category}</span>
                          <span className="text-xs text-gray-300 font-mono font-semibold ml-2">{fmt(r.actual)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: allocation + debt */}
            <div className="col-span-1 space-y-4">
              {/* Allocation */}
              <AllocationFlow
                plan={plan}
                incomeTrigger={incomeTrigger}
                onIncomeEdit={(income) => plan && saveIncome({ planId: plan.id, income })}
              />

              {/* Debt payments */}
              <DebtPayments debtPayments={plan?.debt_payments} />

              {/* Debt priority summary */}
              {active.debt_targets?.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-3">Debt priority order</p>
                  <div className="space-y-2">
                    {[...active.debt_targets]
                      .sort((a, b) => a.priority - b.priority)
                      .map(dt => (
                        <div key={dt.id} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-gray-300 min-w-0">
                            <span className="text-amber-400 font-bold w-4 flex-shrink-0">#{dt.priority}</span>
                            <span className="truncate">{dt.loan_name}</span>
                          </span>
                          <span className="text-gray-500 font-mono ml-2">{fmt(dt.current_balance)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      </>}
    </div>
  )
}
