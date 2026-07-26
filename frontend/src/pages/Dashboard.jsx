import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine, LineChart, Line,
} from 'recharts'
import { Wallet, TrendingUp, TrendingDown, Target, DollarSign, CalendarClock, PiggyBank, Flame, Shield, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import StatCard from '../components/StatCard'
import useAuthStore from '../store/authStore'
import api from '../lib/api'
import clsx from 'clsx'

const GOAL_META = {
  fire:           { label: 'FIRE',           icon: Flame,       text: 'text-amber-400',   bg: 'bg-amber-500/15',  border: 'border-amber-500/30' },
  emergency_fund: { label: 'Emergency Fund', icon: Shield,      text: 'text-blue-400',    bg: 'bg-blue-500/15',   border: 'border-blue-500/30' },
  debt_free:      { label: 'Debt Free',      icon: TrendingDown,text: 'text-red-400',     bg: 'bg-red-500/15',    border: 'border-red-500/30' },
  savings:        { label: 'Savings',        icon: PiggyBank,   text: 'text-emerald-400', bg: 'bg-emerald-500/15',border: 'border-emerald-500/30' },
  investment:     { label: 'Investment',     icon: TrendingUp,  text: 'text-violet-400',  bg: 'bg-violet-500/15', border: 'border-violet-500/30' },
  income:         { label: 'Income',         icon: DollarSign,  text: 'text-cyan-400',    bg: 'bg-cyan-500/15',   border: 'border-cyan-500/30' },
  custom:         { label: 'Custom',         icon: Target,      text: 'text-gray-400',    bg: 'bg-gray-500/15',   border: 'border-gray-500/30' },
}

const fmt      = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtShort = (n) => {
  const abs = Math.abs(Number(n))
  if (abs >= 1_000_000) return `$${(Number(n) / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `$${(Number(n) / 1_000).toFixed(1)}k`
  return fmt(n)
}

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#3b82f6', '#84cc16']

const GRANULARITIES = [
  { id: 'daily',   label: 'Daily' },
  { id: 'weekly',  label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
]
const RANGES = [
  { id: '3m',  label: '3M' },
  { id: '6m',  label: '6M' },
  { id: '1y',  label: '1Y' },
  { id: '2y',  label: '2Y' },
  { id: 'all', label: 'All' },
]
const SHORT_RANGES = [
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' },
]

function NetWorthTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const nw = payload[0]?.value
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 shadow-xl">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-base font-bold text-violet-400">{fmt(nw)}</p>
      {payload[0]?.payload?.net_change !== 0 && (
        <p className={clsx('text-xs mt-0.5', payload[0].payload.net_change >= 0 ? 'text-emerald-400' : 'text-red-400')}>
          {payload[0].payload.net_change >= 0 ? '+' : ''}{fmt(payload[0].payload.net_change)} this period
        </p>
      )}
    </div>
  )
}

export default function Dashboard() {
  const user = useAuthStore((s) => s.user)
  const [granularity, setGranularity] = useState('monthly')
  const [range, setRange]             = useState('1y')
  const [cashflowRange, setCashflowRange] = useState('6m')
  const [debtRange, setDebtRange]             = useState('1y')
  const [debtGranularity, setDebtGranularity] = useState('monthly')

  // Category summary — date-range + type selectable
  const todayStr = new Date().toISOString().slice(0, 10)
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const [catDateFrom, setCatDateFrom] = useState(firstOfMonth)
  const [catDateTo,   setCatDateTo]   = useState(todayStr)
  const [catType,     setCatType]     = useState('expense')

  const { data: summary, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/transactions/dashboard/').then((r) => r.data),
  })

  const { data: nwHistory, isLoading: nwLoading } = useQuery({
    queryKey: ['networth-history', granularity, range],
    queryFn: () =>
      api.get(`/transactions/dashboard/networth-history/?granularity=${granularity}&range=${range}`)
         .then((r) => r.data),
  })

  const [tsGranularity, setTsGranularity] = useState('monthly')
  const [tsRange, setTsRange]             = useState('6m')
  const [tsSelected, setTsSelected]       = useState(null) // null = not yet initialised

  const { data: timeseriesData } = useQuery({
    queryKey: ['expense-timeseries', tsGranularity, tsRange],
    queryFn: () =>
      api.get(`/transactions/dashboard/expense-timeseries/?granularity=${tsGranularity}&range=${tsRange}`)
         .then((r) => r.data),
    onSuccess: (d) => {
      // Auto-select top 5 categories on first load
      if (tsSelected === null && d?.categories?.length) {
        const top5 = new Set(d.categories.slice(0, 5).map((c) => c.name))
        setTsSelected(top5)
      }
    },
  })

  const { data: cashflowData } = useQuery({
    queryKey: ['cashflow', cashflowRange],
    queryFn: () =>
      api.get(`/transactions/dashboard/cashflow/?range=${cashflowRange}`)
         .then((r) => r.data),
  })

  const { data: loansData } = useQuery({
    queryKey: ['loans-dashboard'],
    queryFn: () => api.get('/loans/').then((r) => r.data),
  })

  const { data: catSummary, isFetching: catFetching } = useQuery({
    queryKey: ['category-summary', catDateFrom, catDateTo, catType],
    queryFn: () =>
      api.get(`/transactions/dashboard/category-summary/?date_from=${catDateFrom}&date_to=${catDateTo}&type=${catType}`)
         .then((r) => r.data),
    keepPreviousData: true,
  })

  const { data: debtHistory, isLoading: debtLoading } = useQuery({
    queryKey: ['debt-history', debtRange, debtGranularity],
    queryFn: () =>
      api.get(`/transactions/dashboard/debt-history/?range=${debtRange}&granularity=${debtGranularity}`)
         .then((r) => r.data),
    keepPreviousData: true,
  })

  const { data: goalsData } = useQuery({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals/?status=active').then((r) => r.data),
  })

  const { data: snapshotsData } = useQuery({
    queryKey: ['snapshots'],
    queryFn: () => api.get('/transactions/snapshots/').then((r) => r.data),
  })

  const netWorth  = Number(summary?.net_worth ?? 0)
  const totalDebt = Number(summary?.total_debt ?? 0)
  const goal      = Number(user?.millionaire_goal ?? 1_000_000)
  const progress  = goal > 0 ? Math.min(Math.max((netWorth / goal) * 100, 0), 100) : 0

  const monthlyIncome   = Number(summary?.monthly_income   ?? 0)
  const monthlyExpenses = Number(summary?.monthly_expenses ?? 0)
  const currentMonth    = summary?.current_month ?? ''
  const savingsRate     = monthlyIncome > 0
    ? Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100)
    : 0

  const activeGoals = (goalsData?.results ?? goalsData ?? [])
    .filter((g) => g.status === 'active')
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 4)

  const snapshots = snapshotsData?.snapshots ?? []

  const pieData = (summary?.category_breakdown ?? []).slice(0, 8).map((c) => ({
    name:  c.category__name ?? 'Uncategorized',
    value: Number(c.total),
  }))

  // Budget vs actual: only categories that have a monthly_budget set
  const budgetData = (summary?.category_breakdown ?? [])
    .filter((c) => c.category__monthly_budget)
    .map((c) => ({
      name:   c.category__name ?? 'Uncategorized',
      actual: Number(c.total),
      budget: Number(c.category__monthly_budget),
      over:   Number(c.total) > Number(c.category__monthly_budget),
    }))
    .slice(0, 8)

  // Upcoming loan payments (active loans with next_payment_date)
  const loans = loansData?.results ?? loansData ?? []
  const upcomingPayments = [...loans]
    .filter((l) => l.status === 'active' && l.next_payment_date)
    .sort((a, b) => new Date(a.next_payment_date) - new Date(b.next_payment_date))
    .slice(0, 5)

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          Good morning{user?.first_name ? `, ${user.first_name}` : ''} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">Here's your financial overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
        <StatCard label="Net Worth"                                  value={fmt(summary?.net_worth ?? 0)} icon={Wallet}      color="violet" />
        <StatCard label={`Income — ${currentMonth}`}             value={fmt(monthlyIncome)}           icon={TrendingUp}  color="green"  />
        <StatCard label={`Expenses — ${currentMonth}`}           value={fmt(monthlyExpenses)}         icon={TrendingDown} color="red"   />
        <StatCard label="Total Debt"                             value={fmt(totalDebt)}               icon={DollarSign}  color="amber"  />
        <StatCard
          label="Savings Rate"
          value={`${savingsRate}%`}
          icon={PiggyBank}
          color={savingsRate >= 20 ? 'green' : savingsRate >= 10 ? 'amber' : 'red'}
        />
      </div>

      {/* Millionaire Goal Progress */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-violet-400" />
            <span className="text-sm font-medium text-white">Millionaire Goal Progress</span>
          </div>
          <span className="text-sm text-gray-400">
            <span className={netWorth < 0 ? 'text-red-400' : 'text-white'}>{fmt(netWorth)}</span>
            {' '}/{' '}{fmt(goal)}
          </span>
        </div>
        <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-500">
            {netWorth < 0
              ? <span className="text-red-400">Net worth is negative — pay down debt to start building toward your goal</span>
              : `${progress.toFixed(2)}% of your goal reached`}
          </p>
          {summary && (
            <p className="text-xs text-gray-600">
              Portfolio: {fmt(summary.portfolio_value ?? 0)} · Assets: {fmt(summary.total_assets ?? 0)}
            </p>
          )}
        </div>
      </div>

      {/* Goals at a Glance */}
      {activeGoals.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Target size={16} className="text-violet-400" />
              <span className="text-sm font-semibold text-white">Goals at a Glance</span>
              <span className="text-xs text-gray-500 ml-1">{activeGoals.length} active</span>
            </div>
            <Link to="/goals" className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {activeGoals.map((g) => {
              const meta   = GOAL_META[g.goal_type] ?? GOAL_META.custom
              const Icon   = meta.icon
              const target = Number(g.effective_target ?? 0)
              const pct    = Number(g.progress_pct ?? 0)
              const barCl  = pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-violet-500' : pct >= 40 ? 'bg-amber-400' : 'bg-blue-500'
              return (
                <div key={g.id} className={clsx('rounded-xl border p-4', meta.border, meta.bg)}>
                  <div className="flex items-center gap-2 mb-3">
                    <Icon size={14} className={meta.text} />
                    <span className="text-sm font-medium text-white truncate">{g.name}</span>
                    <span className={clsx('text-xs ml-auto flex-shrink-0', meta.text)}>{meta.label}</span>
                  </div>
                  {target > 0 ? (
                    <>
                      <div className="h-2 bg-black/20 rounded-full overflow-hidden mb-1.5">
                        <div className={clsx('h-full rounded-full', barCl)} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className={Number(g.current_amount) < 0 ? 'text-red-400' : 'text-gray-400'}>
                          {Number(g.current_amount) < 0
                            ? `−${fmt(Math.abs(Number(g.current_amount)))} net worth`
                            : `${fmt(g.current_amount)} saved`}
                        </span>
                        <span className={meta.text}>{pct.toFixed(1)}%</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-gray-500">No target set</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Net Worth History */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-sm font-semibold text-white">Net Worth Over Time</h2>
            {nwHistory && (
              <p className="text-xs text-gray-500 mt-0.5">
                Current: <span className="text-violet-400 font-semibold">{fmt(nwHistory.current_net_worth)}</span>
                {nwHistory.series.length >= 2 && (() => {
                  const first = nwHistory.series[0].net_worth
                  const last  = nwHistory.current_net_worth
                  const diff  = last - first
                  const pct   = first !== 0 ? ((diff / Math.abs(first)) * 100).toFixed(1) : null
                  return (
                    <span className={clsx('ml-2 font-semibold', diff >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {diff >= 0 ? '+' : ''}{fmtShort(diff)}
                      {pct && ` (${diff >= 0 ? '+' : ''}${pct}%)`}
                      <span className="text-gray-600 font-normal ml-1">this period</span>
                    </span>
                  )
                })()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
              {GRANULARITIES.map(({ id, label }) => (
                <button key={id} onClick={() => setGranularity(id)}
                  className={clsx('px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    granularity === id ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-gray-200')}
                >{label}</button>
              ))}
            </div>
            <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
              {RANGES.map(({ id, label }) => (
                <button key={id} onClick={() => setRange(id)}
                  className={clsx('px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    range === id ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200')}
                >{label}</button>
              ))}
            </div>
          </div>
        </div>

        {nwLoading ? (
          <div className="h-56 flex items-center justify-center text-gray-600 text-sm">Loading…</div>
        ) : !nwHistory?.series?.length ? (
          <div className="h-56 flex items-center justify-center text-gray-600 text-sm">No transaction data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={nwHistory.series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }}
                tickFormatter={(d) => {
                  const dt = new Date(d + 'T00:00:00')
                  if (granularity === 'daily')  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  if (granularity === 'weekly') return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  return dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
                }}
              />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={fmtShort} width={60} />
              <Tooltip content={<NetWorthTooltip />} />
              <ReferenceLine y={0} stroke="#374151" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="net_worth" stroke="#8b5cf6" fill="url(#nwGrad)"
                strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#8b5cf6' }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Charts row: pie + cash flow */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* Spending by category */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Spending by Category</h2>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-600 text-sm">No transactions yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={3}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                  formatter={(v) => [`$${Number(v).toLocaleString()}`, '']}
                />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Cash Flow */}
        <div className="xl:col-span-2 bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Cash Flow</h2>
            <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
              {SHORT_RANGES.map(({ id, label }) => (
                <button key={id} onClick={() => setCashflowRange(id)}
                  className={clsx('px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    cashflowRange === id ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200')}
                >{label}</button>
              ))}
            </div>
          </div>
          <CashFlowChart data={cashflowData?.series ?? []} />
        </div>
      </div>

      {/* Expense Trend — multi-line, filterable by category + granularity */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
        <ExpenseTimeseries
          data={timeseriesData}
          granularity={tsGranularity}
          onGranularity={setTsGranularity}
          range={tsRange}
          onRange={setTsRange}
          selected={tsSelected}
          onSelected={setTsSelected}
        />
      </div>

      {/* Category Breakdown — date-range + type selectable */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-sm font-semibold text-white">Category Breakdown</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {catSummary ? `${catSummary.items.length} categories · Total: ${fmt(catSummary.total)}` : 'Loading…'}
            </p>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Type toggle */}
            <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
              {[
                { id: 'expense', label: 'Expenses' },
                { id: 'income',  label: 'Income' },
                { id: 'all',     label: 'Both' },
              ].map(({ id, label }) => (
                <button key={id} onClick={() => setCatType(id)}
                  className={clsx('px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    catType === id
                      ? id === 'expense' ? 'bg-red-600 text-white'
                      : id === 'income'  ? 'bg-emerald-600 text-white'
                      :                   'bg-violet-600 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  )}
                >{label}</button>
              ))}
            </div>

            {/* Date range */}
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="date" value={catDateFrom}
                onChange={(e) => setCatDateFrom(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-violet-500"
              />
              <span>→</span>
              <input
                type="date" value={catDateTo}
                onChange={(e) => setCatDateTo(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-violet-500"
              />
            </div>

            {/* Quick presets */}
            <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
              {[
                { label: 'MTD',  from: firstOfMonth, to: todayStr },
                { label: '3M',   from: new Date(Date.now() - 90*864e5).toISOString().slice(0,10), to: todayStr },
                { label: '6M',   from: new Date(Date.now() - 180*864e5).toISOString().slice(0,10), to: todayStr },
                { label: 'YTD',  from: `${new Date().getFullYear()}-01-01`, to: todayStr },
              ].map(({ label, from, to }) => (
                <button key={label}
                  onClick={() => { setCatDateFrom(from); setCatDateTo(to) }}
                  className={clsx('px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    catDateFrom === from && catDateTo === to
                      ? 'bg-gray-600 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  )}
                >{label}</button>
              ))}
            </div>
          </div>
        </div>

        <CategoryBreakdown data={catSummary} loading={catFetching} type={catType} />
      </div>

      {/* Total Debt Over Time */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-sm font-semibold text-white">Total Debt Over Time</h2>
            {debtHistory && (
              <p className="text-xs text-gray-500 mt-0.5">
                Current debt: <span className="text-amber-400 font-semibold">{fmt(debtHistory.current_debt)}</span>
                <span className="ml-3 text-gray-600">· Green bars = payments made (right axis)</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
              {[{id:'daily',label:'Daily'},{id:'weekly',label:'Weekly'},{id:'monthly',label:'Monthly'}].map(({ id, label }) => (
                <button key={id} onClick={() => setDebtGranularity(id)}
                  className={clsx('px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    debtGranularity === id ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-gray-200')}
                >{label}</button>
              ))}
            </div>
            <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
              {RANGES.map(({ id, label }) => (
                <button key={id} onClick={() => setDebtRange(id)}
                  className={clsx('px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    debtRange === id ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200')}
                >{label}</button>
              ))}
            </div>
          </div>
        </div>
        <DebtHistoryChart data={debtHistory} loading={debtLoading} granularity={debtGranularity} />
      </div>

      {/* Savings Rate Trend */}
      {snapshots.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Savings Rate Trend</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Monthly savings rate over time
                {user?.savings_rate_target && (
                  <span className="ml-2 text-violet-400">
                    · Target: {Number(user.savings_rate_target).toFixed(0)}%
                  </span>
                )}
              </p>
            </div>
          </div>
          <SavingsRateTrend data={snapshots} target={Number(user?.savings_rate_target ?? 0)} />
        </div>
      )}

      {/* Budget vs Actual + Upcoming Payments */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-sm font-semibold text-white mb-1">Budget vs Actual</h2>
          <p className="text-xs text-gray-500 mb-4">This month — categories with a budget set</p>
          <BudgetVsActual data={budgetData} />
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <CalendarClock size={16} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-white">Upcoming Loan Payments</h2>
          </div>
          <UpcomingPayments payments={upcomingPayments} />
        </div>
      </div>
    </div>
  )
}

function CashFlowChart({ data }) {
  if (!data.length) return (
    <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data yet</div>
  )
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barGap={4}>
        <defs>
          <linearGradient id="incG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.5} />
          </linearGradient>
          <linearGradient id="expG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.5} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={(v) => fmtShort(v)} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#f9fafb', fontSize: 12 }}
          formatter={(v, n) => {
            if (n === 'savings_rate') return [`${v}%`, 'Savings Rate']
            return [fmt(v), n === 'income' ? 'Income' : 'Expenses']
          }}
        />
        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
        <Bar dataKey="income"   fill="url(#incG)" radius={[4,4,0,0]} name="income" />
        <Bar dataKey="expenses" fill="url(#expG)" radius={[4,4,0,0]} name="expenses" />
      </BarChart>
    </ResponsiveContainer>
  )
}

const TS_GRANULARITIES = [
  { id: 'daily',   label: 'Daily' },
  { id: 'weekly',  label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly',  label: 'Yearly' },
]
const TS_RANGES = [
  { id: '1m', label: '1M' },
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' },
  { id: '2y', label: '2Y' },
]

function ExpenseTimeseries({ data, granularity, onGranularity, range, onRange, selected, onSelected }) {
  const categories = data?.categories ?? []
  const series     = data?.series     ?? []

  // Auto-initialise selection when data first arrives
  const effectiveSelected = selected ?? new Set(categories.slice(0, 5).map((c) => c.name))

  function toggle(name) {
    const next = new Set(effectiveSelected)
    next.has(name) ? next.delete(name) : next.add(name)
    onSelected(next)
  }

  function selectAll()  { onSelected(new Set(categories.map((c) => c.name))) }
  function clearAll()   { onSelected(new Set()) }

  const activeCategories = categories.filter((c) => effectiveSelected.has(c.name))

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-sm font-semibold text-white">Expenses by Category</h2>
          <p className="text-xs text-gray-500 mt-0.5">Multi-line trend — select categories below</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Granularity */}
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
            {TS_GRANULARITIES.map(({ id, label }) => (
              <button key={id} onClick={() => onGranularity(id)}
                className={clsx('px-3 py-1 rounded-md text-xs font-medium transition-colors',
                  granularity === id ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-gray-200')}
              >{label}</button>
            ))}
          </div>
          {/* Range */}
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
            {TS_RANGES.map(({ id, label }) => (
              <button key={id} onClick={() => onRange(id)}
                className={clsx('px-3 py-1 rounded-md text-xs font-medium transition-colors',
                  range === id ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200')}
              >{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Category chips */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={selectAll}
            className="px-2.5 py-1 rounded-full text-xs font-medium border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >All</button>
          <button
            onClick={clearAll}
            className="px-2.5 py-1 rounded-full text-xs font-medium border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >None</button>
          <div className="w-px bg-gray-800 self-stretch" />
          {categories.map((cat) => {
            const active = effectiveSelected.has(cat.name)
            return (
              <button
                key={cat.name}
                onClick={() => toggle(cat.name)}
                className={clsx(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                  active ? 'opacity-100' : 'opacity-30 hover:opacity-60',
                )}
                style={active
                  ? { borderColor: cat.color, color: cat.color, background: cat.color + '20' }
                  : { borderColor: '#374151', color: '#9ca3af' }
                }
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                {cat.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Chart */}
      {!series.length ? (
        <div className="h-64 flex items-center justify-center text-gray-600 text-sm">No expense data yet</div>
      ) : activeCategories.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-gray-600 text-sm">Select at least one category</div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={fmtShort}
              width={56}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              labelStyle={{ color: '#f9fafb', fontSize: 12, marginBottom: 4 }}
              formatter={(v, name) => [fmt(v), name]}
            />
            <Legend
              wrapperStyle={{ color: '#9ca3af', fontSize: 11, paddingTop: 12 }}
            />
            {activeCategories.map((cat) => (
              <Line
                key={cat.name}
                type="monotone"
                dataKey={cat.name}
                stroke={cat.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, fill: cat.color }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </>
  )
}

function BudgetVsActual({ data }) {
  if (!data.length) return (
    <div className="flex flex-col gap-3 items-center justify-center h-48 text-gray-600 text-sm text-center">
      <span>No budget caps set.</span>
      <span className="text-xs text-gray-600">Add a monthly budget to categories in Transactions → Categories.</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {data.map((c) => {
        const pct = Math.min((c.actual / c.budget) * 100, 100)
        return (
          <div key={c.name}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-300">{c.name}</span>
              <span className={clsx('font-semibold', c.over ? 'text-red-400' : 'text-emerald-400')}>
                {fmt(c.actual)} / {fmt(c.budget)}
                {c.over && <span className="ml-1 text-red-500">over budget</span>}
              </span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={clsx('h-full rounded-full transition-all duration-500',
                  c.over ? 'bg-red-500' : pct > 80 ? 'bg-amber-400' : 'bg-emerald-500')}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function UpcomingPayments({ payments }) {
  if (!payments.length) return (
    <div className="flex items-center justify-center h-48 text-gray-600 text-sm">No upcoming payments</div>
  )

  return (
    <div className="flex flex-col gap-3">
      {payments.map((loan) => {
        const due     = new Date(loan.next_payment_date + 'T00:00:00')
        const today   = new Date()
        today.setHours(0,0,0,0)
        const daysOut = Math.round((due - today) / 86400000)
        const urgency = daysOut <= 3 ? 'text-red-400' : daysOut <= 7 ? 'text-amber-400' : 'text-gray-400'
        return (
          <div key={loan.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
            <div>
              <p className="text-sm text-white font-medium">{loan.name}</p>
              <p className={clsx('text-xs mt-0.5', urgency)}>
                {daysOut === 0 ? 'Due today' : daysOut < 0 ? `${Math.abs(daysOut)}d overdue` : `Due in ${daysOut}d`}
                {' · '}{due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-white">{fmt(loan.monthly_payment)}</p>
              <p className="text-xs text-gray-500 capitalize">{loan.loan_type.replace('_', ' ')}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DebtHistoryChart({ data, loading, granularity = 'monthly' }) {
  if (loading && !data) return (
    <div className="h-56 flex items-center justify-center text-gray-600 text-sm">Loading…</div>
  )
  if (!data?.series?.length) return (
    <div className="h-56 flex items-center justify-center text-gray-600 text-sm">No debt history available</div>
  )

  const series = data.series

  function fmtDate(d) {
    const dt = new Date(d + 'T00:00:00')
    if (granularity === 'daily')  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (granularity === 'weekly') return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }

  function fmtLabel(d) {
    const dt = new Date(d + 'T00:00:00')
    if (granularity === 'daily')  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    if (granularity === 'weekly') return `Week of ${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const periodLabel = granularity === 'daily' ? 'Today' : granularity === 'weekly' ? 'This Week' : 'This Month'

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={series} margin={{ top: 4, right: 56, left: 0, bottom: 0 }}
        style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}
      >
        <defs>
          <linearGradient id="debtGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickFormatter={fmtDate}
          interval="preserveStartEnd"
        />
        {/* Left axis — total debt */}
        <YAxis
          yAxisId="left"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickFormatter={fmtShort}
          width={56}
        />
        {/* Right axis — payments (separate scale so bars are always visible) */}
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fill: '#10b981', fontSize: 11 }}
          tickFormatter={fmtShort}
          width={56}
        />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#f9fafb', fontSize: 12 }}
          formatter={(v, name) => {
            if (name === 'total_debt') return [fmt(v), 'Total Debt']
            if (name === 'paid')       return [fmt(v), `Paid ${periodLabel}`]
            return [fmt(v), name]
          }}
          labelFormatter={fmtLabel}
        />
        <Legend
          wrapperStyle={{ color: '#9ca3af', fontSize: 11 }}
          formatter={(v) => v === 'total_debt' ? 'Total Debt' : `Payments (right axis)`}
        />
        <Bar dataKey="paid" fill="#10b981" fillOpacity={0.75} radius={[3,3,0,0]} yAxisId="right" name="paid" />
        <Area
          type="monotone" dataKey="total_debt" stroke="#f59e0b" fill="url(#debtGrad)"
          strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#f59e0b' }} yAxisId="left" name="total_debt"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function SavingsRateTrend({ data, target }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickFormatter={(v) => `${v.toFixed(0)}%`}
          width={42}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#f9fafb', fontSize: 12 }}
          formatter={(v, name) => {
            if (name === 'target') return [`${Number(v).toFixed(0)}%`, 'Target']
            return [`${Number(v).toFixed(1)}%`, 'Savings Rate']
          }}
        />
        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 11 }}
          formatter={(v) => v === 'savings_rate' ? 'Savings Rate' : 'Target'} />
        {target > 0 && (
          <ReferenceLine y={target} stroke="#8b5cf6" strokeDasharray="5 5"
            label={{ value: `Target ${target.toFixed(0)}%`, fill: '#8b5cf6', fontSize: 10, position: 'insideTopRight' }}
          />
        )}
        <Line
          type="monotone" dataKey="savings_rate" stroke="#10b981"
          strokeWidth={2.5} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function CategoryBreakdown({ data, loading, type }) {
  if (loading && !data) return (
    <div className="h-48 flex items-center justify-center text-gray-600 text-sm">Loading…</div>
  )
  if (!data?.items?.length) return (
    <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No transactions in this range</div>
  )

  const items = data.items.slice(0, 12)
  const maxVal = Math.max(...items.map((i) => i.total), 1)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Horizontal bar chart */}
      <div className="xl:col-span-2 space-y-2.5">
        {items.map((item, idx) => {
          const barPct = (item.total / maxVal) * 100
          const barColor = type === 'all'
            ? (item.type === 'income' ? '#10b981' : '#ef4444')
            : (type === 'income' ? '#10b981' : item.color || '#8b5cf6')
          return (
            <div key={`${item.name}-${item.type}-${idx}`}>
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: barColor }} />
                  <span className="text-gray-300 truncate">{item.name}</span>
                  {type === 'all' && (
                    <span className={clsx('text-xs px-1.5 py-0.5 rounded-full flex-shrink-0',
                      item.type === 'income' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                    )}>{item.type}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  <span className="text-gray-500">{item.count} tx</span>
                  <span className="text-gray-500 w-10 text-right">{item.pct}%</span>
                  <span className="text-white font-semibold w-24 text-right">{fmt(item.total)}</span>
                </div>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${barPct}%`, background: barColor, opacity: loading ? 0.5 : 1 }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Pie chart */}
      <div className="flex flex-col items-center justify-center">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={items} dataKey="total" nameKey="name" cx="50%" cy="50%"
              innerRadius={55} outerRadius={85} paddingAngle={2}
            >
              {items.map((item, i) => (
                <Cell key={i} fill={
                  type === 'all'
                    ? (item.type === 'income' ? '#10b981' : '#ef4444')
                    : (item.color || COLORS[i % COLORS.length])
                } />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              formatter={(v, n) => [fmt(v), n]}
            />
          </PieChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-500 -mt-2">
          Total: <span className="text-white font-semibold">{fmt(data.total)}</span>
        </p>
      </div>
    </div>
  )
}
