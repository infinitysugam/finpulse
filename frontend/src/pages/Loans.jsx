import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { Plus, X, ChevronDown, ChevronUp, Zap, CreditCard, Pencil, Trash2, Users, DollarSign, Landmark, Calculator, CreditCard as PayIcon } from 'lucide-react'
import api from '../lib/api'
import clsx from 'clsx'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import LoanMathEngineModal from '../components/LoanMathEngineModal'
import CreditCardMathEngineModal from '../components/CreditCardMathEngineModal'

const fmt = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })
const pct = (n) => Number(n).toFixed(2) + '%'

const LOAN_TYPES = [
  { value: 'personal',        label: 'Personal Loan' },
  { value: 'mortgage',        label: 'Mortgage' },
  { value: 'auto',            label: 'Auto Loan' },
  { value: 'student',         label: 'Student Loan' },
  { value: 'credit_card',     label: 'Credit Card' },
  { value: 'business',        label: 'Business Loan' },
  { value: 'friend',          label: 'Borrowed from Friend' },
  { value: 'lent_to_friend',  label: 'Lent to Friend' },
  { value: 'other',           label: 'Other' },
]

function utilizationColor(pct) {
  if (pct <= 30) return { bar: 'bg-emerald-500', text: 'text-emerald-400', label: 'Healthy' }
  if (pct <= 60) return { bar: 'bg-amber-500',   text: 'text-amber-400',   label: 'Moderate' }
  return             { bar: 'bg-red-500',         text: 'text-red-400',     label: 'High' }
}

function ProgressBar({ value, max, colorClass = 'bg-violet-500' }) {
  const pctVal = Math.min((Number(value) / Number(max)) * 100, 100)
  return (
    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
      <div className={clsx('h-full rounded-full transition-all', colorClass)} style={{ width: `${pctVal}%` }} />
    </div>
  )
}

// ─── What-If Simulator (regular loans) ──────────────────────────────────────

function WhatIfPanel({ loan }) {
  const [extra, setExtra] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true)
    try {
      const { data } = await api.post(`/loans/${loan.id}/what-if/`, { extra_monthly_payment: extra })
      setResult(data)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-4 bg-gray-800/60 rounded-xl p-4 border border-gray-700">
      <p className="text-xs font-semibold text-violet-400 mb-3 uppercase tracking-wider">What-If Simulator</p>
      <div className="flex gap-2 mb-4">
        <input
          type="number"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="Extra $/month"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
        />
        <button
          onClick={run}
          disabled={!extra || loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
        >
          <Zap size={14} /> {loading ? '…' : 'Run'}
        </button>
      </div>
      {result && (
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: 'Months saved', value: result.months_saved },
            { label: 'Interest saved', value: fmt(result.interest_saved) },
            { label: 'New payoff', value: result.payoff_date_accelerated?.slice(0, 10) ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="text-sm font-bold text-emerald-400">{value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Credit Card Insights Panel ───────────────────────────────────────────────

function CreditCardInsights({ loan }) {
  const balance      = Number(loan.current_balance)
  const limit        = Number(loan.credit_limit)
  const apr          = Number(loan.annual_interest_rate)
  const minPayment   = Number(loan.monthly_payment)
  const monthlyRate  = apr / 100 / 12

  // 1. Next month's interest (always shown, no input)
  const nextInterest = balance * monthlyRate

  // 2. Target utilization calculator
  const [targetUtil, setTargetUtil] = useState('30')
  const payToTarget  = Math.max(0, balance - limit * (Number(targetUtil) / 100))

  // 3. Payoff planner — target number of months
  const [targetMonths, setTargetMonths] = useState('')
  const [planResult, setPlanResult] = useState(null)
  const [planLoading, setPlanLoading] = useState(false)

  const runPlan = async () => {
    const months = parseInt(targetMonths, 10)
    if (!months || months < 1) return
    setPlanLoading(true)
    try {
      // Required monthly payment to clear balance in N months:
      // PMT = (balance × r) / (1 − (1+r)^−n)
      let required
      if (monthlyRate === 0) {
        required = balance / months
      } else {
        required = (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
      }
      const extra = Math.max(0, required - minPayment)
      const { data } = await api.post(`/loans/${loan.id}/what-if/`, {
        extra_monthly_payment: extra.toFixed(2),
      })
      setPlanResult({ ...data, required_payment: required })
    } finally {
      setPlanLoading(false)
    }
  }

  return (
    <div className="mt-4 space-y-3">

      {/* 1 — Next month's interest */}
      <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700">
        <p className="text-xs font-semibold text-violet-400 mb-3 uppercase tracking-wider">Next Month's Interest</p>
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">
            At {pct(apr)} APR on {fmt(balance)} balance
          </p>
          <p className="text-xl font-bold text-red-400">{fmt(nextInterest)}</p>
        </div>
        {nextInterest > minPayment * 0.8 && (
          <p className="text-xs text-amber-400 mt-2">
            ⚠ Interest is eating {((nextInterest / minPayment) * 100).toFixed(0)}% of your minimum payment.
          </p>
        )}
      </div>

      {/* 2 — Target utilization */}
      <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700">
        <p className="text-xs font-semibold text-violet-400 mb-3 uppercase tracking-wider">Target Utilization</p>
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-2 flex-1">
            <input
              type="range"
              min="5" max="90" step="5"
              value={targetUtil}
              onChange={(e) => setTargetUtil(e.target.value)}
              className="flex-1 accent-violet-500"
            />
            <span className="text-sm font-semibold text-white w-10 text-right">{targetUtil}%</span>
          </div>
        </div>
        {payToTarget > 0 ? (
          <div className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-2.5">
            <span className="text-sm text-gray-400">Pay to reach {targetUtil}% utilization</span>
            <span className="text-sm font-bold text-emerald-400">{fmt(payToTarget)}</span>
          </div>
        ) : (
          <p className="text-sm text-emerald-400 text-center py-1">
            You're already below {targetUtil}% utilization ✓
          </p>
        )}
      </div>

      {/* 3 — Payoff planner */}
      <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700">
        <p className="text-xs font-semibold text-violet-400 mb-3 uppercase tracking-wider">Payoff Planner</p>
        <div className="flex gap-2 mb-3">
          <input
            type="number"
            value={targetMonths}
            onChange={(e) => { setTargetMonths(e.target.value); setPlanResult(null) }}
            placeholder="Pay off in how many months?"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
          />
          <button
            onClick={runPlan}
            disabled={!targetMonths || planLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm rounded-lg transition-colors whitespace-nowrap"
          >
            <Zap size={14} /> {planLoading ? '…' : 'Calculate'}
          </button>
        </div>
        {planResult && (
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Monthly payment', value: fmt(planResult.required_payment), color: 'text-violet-400' },
              { label: 'Total interest',  value: fmt(planResult.accelerated_total_interest), color: 'text-red-400' },
              { label: 'Payoff date',     value: planResult.payoff_date_accelerated?.slice(0, 10) ?? '—', color: 'text-emerald-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className={clsx('text-sm font-bold', color)}>{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

// ─── Payment due badge ───────────────────────────────────────────────────────

function PaymentDueBadge({ dueDay }) {
  if (!dueDay) return null

  const today = new Date()
  const currentDay = today.getDate()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()

  // Next due date this month or next
  let dueDate = new Date(currentYear, currentMonth, dueDay)
  if (dueDate <= today) {
    dueDate = new Date(currentYear, currentMonth + 1, dueDay)
  }

  const daysUntil = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24))

  const ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }

  const urgency =
    daysUntil <= 3  ? { bg: 'bg-red-500/15',    text: 'text-red-400',    dot: 'bg-red-400' } :
    daysUntil <= 7  ? { bg: 'bg-amber-500/15',  text: 'text-amber-400',  dot: 'bg-amber-400' } :
                      { bg: 'bg-gray-700/60',   text: 'text-gray-400',   dot: 'bg-gray-500' }

  return (
    <div className={clsx('inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-xs font-medium', urgency.bg, urgency.text)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', urgency.dot)} />
      Due {ordinal(dueDay)} of each month
      {' · '}
      {daysUntil === 0 ? 'due today' : `${daysUntil}d away`}
    </div>
  )
}

// ─── Card components ─────────────────────────────────────────────────────────

function CardActions({ onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onEdit}
        className="p-1.5 rounded-lg text-gray-500 hover:text-violet-400 hover:bg-gray-800 transition-colors"
        title="Edit"
      >
        <Pencil size={14} />
      </button>
      <button
        onClick={onDelete}
        className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"
        title="Delete"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function CreditCardCard({ loan, onEdit, onDelete, onMathEngine }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const utilPct = loan.utilization_pct ?? 0
  const { bar, text, label } = utilizationColor(utilPct)

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <CreditCard size={16} className="text-violet-400" />
          <div>
            <p className="font-semibold text-white">{loan.name}</p>
            <p className="text-xs text-gray-500">{loan.lender || 'Unknown issuer'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx(
            'text-xs px-2.5 py-1 rounded-full font-medium',
            loan.status === 'active'   ? 'bg-blue-500/15 text-blue-400' :
            loan.status === 'paid_off' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-700 text-gray-400'
          )}>
            {loan.status}
          </span>
          <CardActions onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Balance</p>
          <p className="text-lg font-bold text-white">{fmt(loan.current_balance)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Credit Limit</p>
          <p className="text-lg font-bold text-gray-300">{fmt(loan.credit_limit)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">APR</p>
          <p className="text-lg font-bold text-amber-400">{pct(loan.annual_interest_rate)}</p>
        </div>
      </div>

      <ProgressBar value={loan.current_balance} max={loan.credit_limit} colorClass={bar} />
      <div className="flex items-center justify-between text-xs mt-1.5">
        <span className="text-gray-500">{utilPct}% utilized</span>
        <span className={clsx('font-medium', text)}>{label}</span>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span>Min payment: <span className="text-white font-medium">{fmt(loan.monthly_payment)}/mo</span></span>
        <span>Available: <span className="text-emerald-400 font-medium">{fmt(Number(loan.credit_limit) - Number(loan.current_balance))}</span></span>
      </div>
      <PaymentDueBadge dueDay={loan.payment_due_day} />

      {loan.account && (
        <button
          onClick={() => navigate('/accounts')}
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 mt-3 transition-colors"
        >
          <Landmark size={12} /> {loan.account.name}
        </button>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
        >
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {open ? 'Hide' : 'Show'} Card Insights
        </button>
        <button
          onClick={() => onMathEngine(loan)}
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors ml-auto"
        >
          <Calculator size={14} /> Payoff Planner
        </button>
      </div>
      {open && <CreditCardInsights loan={loan} />}
    </div>
  )
}

function PaymentHistoryPanel({ loan }) {
  const qc = useQueryClient()
  const [deleting, setDeleting] = useState(null)

  if (!loan.payments?.length) {
    return <p className="text-xs text-gray-600 text-center py-3">No payments recorded yet.</p>
  }

  const sorted = [...loan.payments].sort(
    (a, b) => new Date(b.payment_date) - new Date(a.payment_date)
  )

  const handleDelete = async (payment) => {
    if (!window.confirm(`Delete payment of ${fmt(payment.amount)} on ${payment.payment_date}? This will restore the loan balance.`)) return
    setDeleting(payment.id)
    try {
      await api.delete(`/loans/${loan.id}/payments/${payment.id}/`)
      qc.invalidateQueries({ queryKey: ['loans'] })
    } catch {
      alert('Failed to delete payment.')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="mt-3 space-y-1.5">
      {sorted.map((p) => (
        <div key={p.id} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2 text-xs">
          <span className="text-gray-400 w-24 shrink-0">{p.payment_date}</span>
          <span className="text-white font-medium">{fmt(p.amount)}</span>
          <span className="text-violet-400">P: {fmt(p.principal_component)}</span>
          <span className="text-amber-400">I: {fmt(p.interest_component)}</span>
          <button
            onClick={() => handleDelete(p)}
            disabled={deleting === p.id}
            className="text-gray-600 hover:text-red-400 transition-colors ml-1"
            title="Delete payment"
          >
            {deleting === p.id ? '…' : <Trash2 size={12} />}
          </button>
        </div>
      ))}
    </div>
  )
}

function RegularLoanCard({ loan, onEdit, onDelete, onMathEngine, onRecordPayment }) {
  const [open, setOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const paidOff = Number(loan.principal) - Number(loan.current_balance)
  const paidPct = ((paidOff / Number(loan.principal)) * 100).toFixed(1)

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-white">{loan.name}</p>
          <p className="text-xs text-gray-500 capitalize">{loan.loan_type.replace('_', ' ')} · {loan.lender || 'Unknown lender'}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx(
            'text-xs px-2.5 py-1 rounded-full font-medium',
            loan.status === 'active'   ? 'bg-blue-500/15 text-blue-400' :
            loan.status === 'paid_off' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-700 text-gray-400'
          )}>
            {loan.status}
          </span>
          <CardActions onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Balance</p>
          <p className="text-lg font-bold text-white">{fmt(loan.current_balance)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Rate</p>
          <p className="text-lg font-bold text-amber-400">{pct(loan.annual_interest_rate)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Monthly</p>
          <p className="text-lg font-bold text-violet-400">{fmt(loan.monthly_payment)}</p>
        </div>
      </div>

      <ProgressBar value={paidOff} max={loan.principal} colorClass="bg-violet-500" />
      <p className="text-xs text-gray-500 mt-1.5">
        {fmt(paidOff)} paid of {fmt(loan.principal)} ({paidPct}%)
      </p>
      <PaymentDueBadge dueDay={loan.payment_due_day} />

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
        >
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {open ? 'Hide' : 'Show'} What-If Simulator
        </button>
        <button
          onClick={() => onRecordPayment(loan)}
          className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          <PayIcon size={14} /> Record Payment
        </button>
        <button
          onClick={() => onMathEngine(loan)}
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors ml-auto"
        >
          <Calculator size={14} /> Math Engine
        </button>
        {(loan.payments?.length > 0) && (
          <button
            onClick={() => setShowHistory((h) => !h)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300 transition-colors"
          >
            {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {loan.payments.length} Payment{loan.payments.length !== 1 ? 's' : ''}
          </button>
        )}
      </div>
      {open && <WhatIfPanel loan={loan} />}
      {showHistory && <PaymentHistoryPanel loan={loan} />}
    </div>
  )
}

function FriendLoanCard({ loan, onEdit, onDelete }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-violet-600/20 flex items-center justify-center">
            <Users size={15} className="text-violet-400" />
          </div>
          <div>
            <p className="font-semibold text-white">{loan.name}</p>
            <p className="text-xs text-gray-500">
              {loan.lender ? `From ${loan.lender}` : 'Personal loan from friend'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx(
            'text-xs px-2.5 py-1 rounded-full font-medium',
            loan.status === 'active'   ? 'bg-blue-500/15 text-blue-400' :
            loan.status === 'paid_off' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-700 text-gray-400'
          )}>
            {loan.status}
          </span>
          <CardActions onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>

      {/* Amount owed */}
      <div className="bg-gray-800/60 rounded-xl p-4 mb-3 text-center">
        <p className="text-xs text-gray-500 mb-1">Amount Owed</p>
        <p className="text-3xl font-bold text-white">{fmt(loan.current_balance)}</p>
        <p className="text-xs text-emerald-400 mt-1">0% interest · No formal due date</p>
      </div>

      {loan.notes && (
        <p className="text-xs text-gray-500 italic px-1">{loan.notes}</p>
      )}

      <PaymentDueBadge dueDay={loan.payment_due_day} />
    </div>
  )
}

// ─── Record Payment Modal ─────────────────────────────────────────────────────

function RecordPaymentModal({ loan, onClose }) {
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)

  const [amount, setAmount]       = useState(String(loan.monthly_payment || ''))
  const [payDate, setPayDate]     = useState(today)
  const [accountId, setAccountId] = useState('')
  const [notes, setNotes]         = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState(null)
  const [success, setSuccess]     = useState(null)

  // Fetch liquid accounts for the selector
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts/').then((r) => r.data),
  })
  const accounts = (accountsData?.results ?? accountsData ?? [])
    .filter((a) => a.is_active && ['checking', 'savings', 'cash'].includes(a.account_type))

  // Determine anchor date: latest payment strictly before selected payDate, then start_date
  // If the anchor is on or after payDate (e.g. start_date set to today for first payment),
  // treat it as absent so we fall back to the 30-day default.
  const anchorDateStr = (() => {
    const before = (loan.payments ?? [])
      .filter((p) => p.payment_date < payDate)
      .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))
    const candidate = before[0]?.payment_date ?? loan.start_date ?? null
    if (candidate && candidate >= payDate) return null
    return candidate
  })()

  // Compute actual days between anchor and selected payment date
  const daysElapsed = (() => {
    if (!anchorDateStr) return 30
    const anchor = new Date(anchorDateStr + 'T00:00:00')
    const pay    = new Date(payDate    + 'T00:00:00')
    const d = Math.round((pay - anchor) / 86400000)
    return Math.max(1, d)
  })()

  // Live principal/interest preview using TRUE_DAILY (same formula as lender)
  const balance    = Number(loan.current_balance)
  const annualRate = Number(loan.annual_interest_rate) / 100
  const amt        = parseFloat(amount) || 0
  const interest   = balance > 0 ? Math.min(balance * (annualRate / 365) * daysElapsed, amt) : 0
  const principal  = Math.max(0, amt - interest)
  const balanceAfter = Math.max(0, balance - principal)

  // What the interest would be at 30 days (for early-payment savings display)
  const interestAt30 = balance > 0 ? balance * (annualRate / 365) * 30 : 0
  const earlyInterestSaving = daysElapsed < 30 ? Math.max(0, interestAt30 - interest) : 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const payload = { amount: amt, payment_date: payDate, notes }
      if (accountId) payload.account_id = parseInt(accountId, 10)
      const { data } = await api.post(`/loans/${loan.id}/record-payment/`, payload)
      setSuccess(data)
      qc.invalidateQueries({ queryKey: ['loans'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (err) {
      setError(err?.response?.data?.detail ?? 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {loan.loan_type === 'lent_to_friend' ? 'Record Repayment' : 'Record Payment'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{loan.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
              <p className="text-emerald-400 font-semibold text-sm mb-3">
                {loan.loan_type === 'lent_to_friend' ? 'Repayment recorded' : `Payment recorded · ${success.days_used}d accrual (TRUE_DAILY)`}
              </p>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: 'Principal',   value: '$' + Number(success.principal).toLocaleString('en-US', { minimumFractionDigits: 2 }), color: 'text-emerald-400' },
                  { label: 'Interest',    value: '$' + Number(success.interest).toLocaleString('en-US', { minimumFractionDigits: 2 }),  color: 'text-red-400' },
                  { label: 'New Balance', value: '$' + Number(success.balance_after).toLocaleString('en-US', { minimumFractionDigits: 2 }), color: 'text-white' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-gray-800 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className={clsx('text-sm font-bold', color)}>{value}</p>
                  </div>
                ))}
              </div>
              {success.loan_status === 'paid_off' && (
                <p className="text-emerald-400 font-semibold text-sm mt-3">🎉 Loan fully paid off!</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-lg text-sm transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Current state */}
            <div className="bg-gray-800/60 rounded-xl p-3 grid grid-cols-3 gap-3 text-center text-xs">
              <div>
                <p className="text-gray-500 mb-0.5">Balance</p>
                <p className="font-semibold text-white">{fmt(balance)}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-0.5">APR</p>
                <p className="font-semibold text-amber-400">{Number(loan.annual_interest_rate).toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-gray-500 mb-0.5">Min Payment</p>
                <p className="font-semibold text-violet-400">{fmt(loan.monthly_payment)}</p>
              </div>
            </div>

            {/* Amount + date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Payment Amount ($)</label>
                <input
                  type="number" step="0.01" min="0.01" required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Payment Date</label>
                <input
                  type="date" required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            {/* Days elapsed + split — hidden for 0% loans */}
            {annualRate > 0 && (
              <>
                <div className="bg-gray-800/60 rounded-xl p-3 flex items-center justify-between text-xs">
                  <div>
                    <p className="text-gray-500">Days since last payment</p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {anchorDateStr
                        ? `From ${anchorDateStr} → ${payDate}`
                        : 'No anchor date — defaulting to 30 days'}
                    </p>
                  </div>
                  <p className={clsx('text-lg font-bold',
                    daysElapsed < 28 ? 'text-emerald-400' : daysElapsed > 32 ? 'text-amber-400' : 'text-white'
                  )}>
                    {daysElapsed}d
                  </p>
                </div>

                {amt > 0 && (
                  <div className="bg-gray-800/60 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider font-semibold">
                      Computed Split — TRUE_DAILY ({daysElapsed}d × {(annualRate / 365 * 100).toFixed(5)}%/day)
                    </p>
                    <div className="grid grid-cols-3 gap-3 text-center text-xs">
                      <div>
                        <p className="text-gray-500 mb-0.5">Interest</p>
                        <p className="font-bold text-red-400">{fmt(interest)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 mb-0.5">Principal</p>
                        <p className="font-bold text-emerald-400">{fmt(principal)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 mb-0.5">Balance After</p>
                        <p className="font-bold text-white">{fmt(balanceAfter)}</p>
                      </div>
                    </div>
                    {earlyInterestSaving > 0.005 && (
                      <p className="text-xs text-emerald-400 mt-2 text-center font-medium">
                        Paying {30 - daysElapsed}d early saves {fmt(earlyInterestSaving)} in interest
                      </p>
                    )}
                    {amt < interest && (
                      <p className="text-xs text-amber-400 mt-2 text-center">
                        Payment doesn't cover interest — balance will grow.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            {annualRate === 0 && amt > 0 && (
              <div className="bg-gray-800/60 rounded-xl p-3 flex items-center justify-between text-xs">
                <span className="text-gray-500">Full repayment goes to principal</span>
                <span className="text-emerald-400 font-bold">{fmt(Math.max(0, balance - amt))} remaining</span>
              </div>
            )}

            {/* Account selector */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                {loan.loan_type === 'lent_to_friend' ? 'Credit Account' : 'Debit Account'}
                <span className="text-gray-600"> (optional — also creates a transaction)</span>
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className={inputCls}
              >
                <option value="">{loan.loan_type === 'lent_to_friend' ? "— Don't credit an account —" : "— Don't debit an account —"}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.account_type}) — {fmt(a.balance)}
                  </option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <input
              type="text"
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputCls}
            />

            {error && (
              <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || amt <= 0}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
            >
              {submitting ? 'Recording…' : 'Record Payment'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function LentToFriendCard({ loan, onEdit, onDelete, onRecordPayment }) {
  const repaid  = Number(loan.principal) - Number(loan.current_balance)
  const repaidPct = loan.principal > 0 ? ((repaid / Number(loan.principal)) * 100).toFixed(1) : 0

  return (
    <div className="bg-gray-900 rounded-xl border border-emerald-800/40 p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-600/20 flex items-center justify-center">
            <Users size={15} className="text-emerald-400" />
          </div>
          <div>
            <p className="font-semibold text-white">{loan.name}</p>
            <p className="text-xs text-gray-500">
              {loan.lender ? `Lent to ${loan.lender}` : 'Personal loan to friend'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx(
            'text-xs px-2.5 py-1 rounded-full font-medium',
            loan.status === 'active'   ? 'bg-emerald-500/15 text-emerald-400' :
            loan.status === 'paid_off' ? 'bg-gray-700/60 text-gray-400' : 'bg-gray-700 text-gray-400'
          )}>
            {loan.status === 'paid_off' ? 'repaid' : loan.status}
          </span>
          <CardActions onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>

      <div className="bg-gray-800/60 rounded-xl p-4 mb-3 text-center">
        <p className="text-xs text-gray-500 mb-1">Still Owed to You</p>
        <p className="text-3xl font-bold text-emerald-400">{fmt(loan.current_balance)}</p>
        <p className="text-xs text-gray-500 mt-1">0% interest · Receivable</p>
      </div>

      {Number(loan.principal) > 0 && (
        <>
          <ProgressBar value={repaid} max={loan.principal} colorClass="bg-emerald-500" />
          <p className="text-xs text-gray-500 mt-1.5">
            {fmt(repaid)} repaid of {fmt(loan.principal)} ({repaidPct}%)
          </p>
        </>
      )}

      {loan.notes && (
        <p className="text-xs text-gray-500 italic px-1 mt-2">{loan.notes}</p>
      )}

      <PaymentDueBadge dueDay={loan.payment_due_day} />

      {loan.status !== 'paid_off' && (
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => onRecordPayment(loan)}
            className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <PayIcon size={14} /> Record Repayment
          </button>
          {(loan.payments?.length > 0) && (
            <span className="text-xs text-gray-600">
              {loan.payments.length} repayment{loan.payments.length !== 1 ? 's' : ''} recorded
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function LoanCard({ loan, onEdit, onDelete, onMathEngine, onRecordPayment }) {
  if (loan.loan_type === 'credit_card')    return <CreditCardCard    loan={loan} onEdit={onEdit} onDelete={onDelete} onMathEngine={onMathEngine} />
  if (loan.loan_type === 'friend')         return <FriendLoanCard    loan={loan} onEdit={onEdit} onDelete={onDelete} />
  if (loan.loan_type === 'lent_to_friend') return <LentToFriendCard  loan={loan} onEdit={onEdit} onDelete={onDelete} onRecordPayment={onRecordPayment} />
  return <RegularLoanCard loan={loan} onEdit={onEdit} onDelete={onDelete} onMathEngine={onMathEngine} onRecordPayment={onRecordPayment} />
}

// ─── Collapsible debt section ─────────────────────────────────────────────────

function DebtSection({ title, icon: Icon, loans, iconColor = 'text-violet-400', onEdit, onDelete, onMathEngine, onRecordPayment, summary }) {
  const [open, setOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const active  = loans.filter((l) => l.status === 'active')
  const history = loans.filter((l) => l.status !== 'active')

  if (!loans.length) return null

  return (
    <div className="mb-5 bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
      {/* Section header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={clsx('p-1.5 rounded-lg bg-gray-800', iconColor)}>
            <Icon size={15} />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {active.length} active{history.length > 0 ? ` · ${history.length} paid off` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 mr-3">
          {summary.map(({ label, value, color }) => (
            <div key={label} className="text-right hidden sm:block">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={clsx('text-sm font-bold', color ?? 'text-white')}>{value}</p>
            </div>
          ))}
        </div>

        <div className={clsx('text-gray-500 transition-transform duration-200', open && 'rotate-180')}>
          <ChevronDown size={16} />
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-800">
          {/* Active cards */}
          {active.length > 0 ? (
            <div className="px-5 pt-4 pb-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
              {active.map((l) => (
                <LoanCard key={l.id} loan={l} onEdit={() => onEdit(l)} onDelete={() => onDelete(l)} onMathEngine={onMathEngine} onRecordPayment={onRecordPayment} />
              ))}
            </div>
          ) : (
            <p className="px-5 py-4 text-sm text-gray-600">No active {title.toLowerCase()}.</p>
          )}

          {/* History toggle */}
          {history.length > 0 && (
            <div className="border-t border-gray-800/60">
              <button
                onClick={() => setHistoryOpen((o) => !o)}
                className="w-full flex items-center gap-2 px-5 py-3 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800/30 transition-colors"
              >
                <div className={clsx('transition-transform duration-200', historyOpen && 'rotate-180')}>
                  <ChevronDown size={13} />
                </div>
                {historyOpen ? 'Hide' : 'Show'} paid-off history ({history.length})
              </button>

              {historyOpen && (
                <div className="px-5 pb-4 grid grid-cols-1 xl:grid-cols-2 gap-3 border-t border-gray-800/40 pt-3">
                  {history.map((l) => (
                    <div key={l.id} className="opacity-50 hover:opacity-75 transition-opacity">
                      <LoanCard loan={l} onEdit={() => onEdit(l)} onDelete={() => onDelete(l)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Debt Priority Panel ──────────────────────────────────────────────────────

// Palette for multi-debt chart lines
const DEBT_COLORS = ['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316']

function calcMonthsToPayoff(balance, aprPct, monthlyPayment) {
  const r = Number(aprPct) / 100 / 12
  let bal = Number(balance)
  const payment = Number(monthlyPayment)
  if (payment <= 0) return Infinity
  let months = 0
  while (bal > 0.01 && months < 600) {
    const interest = bal * r
    if (payment <= interest) return Infinity
    bal = Math.max(0, bal - (payment - interest))
    months++
  }
  return months
}

/**
 * Core simulation engine.
 * Runs a month-by-month debt payoff with a fixed total budget.
 * strategy: 'minimum' | 'avalanche' | 'snowball'
 * Returns { months, totalInterest, payoffOrder, chartData }
 */
function runDebtSimulation(debts, totalBudget, strategy) {
  // state per debt
  const states = debts.map((d) => ({
    id:       d.id,
    name:     d.name,
    bal:      Number(d.current_balance),
    apr:      Number(d.annual_interest_rate),
    minPay:   Number(d.monthly_payment),
    payoffMonth: null,
  }))

  let month = 0
  let totalInterest = 0
  const chartData = []

  while (states.some((s) => s.bal > 0.01) && month < 600) {
    month++

    // 1. Accrue interest on every active debt
    for (const s of states) {
      if (s.bal <= 0.01) { s.bal = 0; continue }
      const interest = s.bal * (s.apr / 100 / 12)
      totalInterest += interest
      s.bal += interest
    }

    // 2. Pay minimums (consume from budget)
    let remaining = totalBudget
    for (const s of states) {
      if (s.bal <= 0.01) continue
      const pay = Math.min(s.minPay, s.bal)
      s.bal = Math.max(0, s.bal - pay)
      remaining -= pay
    }

    // 3. Put extra toward the priority debt (skip for minimum strategy)
    if (strategy !== 'minimum' && remaining > 0.01) {
      const active = states.filter((s) => s.bal > 0.01)
      if (active.length > 0) {
        const sorted = [...active].sort((a, b) =>
          strategy === 'avalanche' ? b.apr - a.apr : a.bal - b.bal
        )
        sorted[0].bal = Math.max(0, sorted[0].bal - remaining)
      }
    }

    // 4. Clamp and record payoffs
    for (const s of states) {
      s.bal = Math.max(0, s.bal)
      if (s.bal <= 0.01 && s.payoffMonth === null) {
        s.bal = 0
        s.payoffMonth = month
      }
    }

    // 5. Snapshot for chart (every 3 months or on payoff)
    const anyPayoff = states.some((s) => s.payoffMonth === month)
    if (month % 3 === 0 || anyPayoff || !states.some((s) => s.bal > 0.01)) {
      const entry = { month }
      for (const s of states) entry[s.id] = parseFloat(s.bal.toFixed(0))
      chartData.push(entry)
    }
  }

  const payoffOrder = states
    .filter((s) => s.payoffMonth !== null)
    .sort((a, b) => a.payoffMonth - b.payoffMonth)
    .map((s) => {
      const d = new Date()
      d.setMonth(d.getMonth() + s.payoffMonth)
      return {
        id:    s.id,
        name:  s.name,
        month: s.payoffMonth,
        date:  d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      }
    })

  return { months: month, totalInterest, payoffOrder, chartData }
}

function DebtPriorityPanel({ loans }) {
  const [open, setOpen]               = useState(false)
  const [rankStrategy, setRankStrategy] = useState('avalanche')
  const [budget, setBudget]           = useState('')
  const [simResult, setSimResult]     = useState(null)
  const [simStrategy, setSimStrategy] = useState('avalanche')

  const active = loans.filter((l) => l.status === 'active' && Number(l.current_balance) > 0)
  if (!active.length) return null

  const withMetrics = active.map((l) => {
    const bal      = Number(l.current_balance)
    const apr      = Number(l.annual_interest_rate)
    const payment  = Number(l.monthly_payment)
    const monthlyInterest = bal * (apr / 100 / 12)
    const months   = calcMonthsToPayoff(bal, apr, payment)
    return { ...l, monthlyInterest, months }
  })

  const totalMonthlyInterest = withMetrics.reduce((s, l) => s + l.monthlyInterest, 0)
  const totalMinimums        = withMetrics.reduce((s, l) => s + Number(l.monthly_payment), 0)

  const sorted = [...withMetrics].sort((a, b) =>
    rankStrategy === 'avalanche'
      ? Number(b.annual_interest_rate) - Number(a.annual_interest_rate)
      : Number(a.current_balance)      - Number(b.current_balance)
  )

  const typeLabel = (t) => ({
    personal: 'Personal', mortgage: 'Mortgage', auto: 'Auto',
    student: 'Student', credit_card: 'Credit Card',
    business: 'Business', friend: 'Friend', other: 'Other',
  }[t] ?? t)

  // Run all three strategies for comparison
  const runSim = () => {
    const b = parseFloat(budget)
    if (!b || b < totalMinimums) return
    const minimum   = runDebtSimulation(active, totalMinimums, 'minimum')
    const avalanche = runDebtSimulation(active, b, 'avalanche')
    const snowball  = runDebtSimulation(active, b, 'snowball')
    setSimResult({ minimum, avalanche, snowball, budget: b })
    setSimStrategy('avalanche')
  }

  // Current-month payment allocation for the chosen sim strategy
  const thisMonthAllocation = useMemo(() => {
    if (!simResult) return []
    const b = simResult.budget
    const strat = simStrategy

    // Simulate just one month to get exact allocation
    const states = active.map((d) => ({
      id:     d.id,
      name:   d.name,
      bal:    Number(d.current_balance),
      apr:    Number(d.annual_interest_rate),
      minPay: Number(d.monthly_payment),
      pay:    0,
    }))

    // Pay minimums
    let remaining = b
    for (const s of states) {
      const pay = Math.min(s.minPay, s.bal)
      s.pay += pay
      remaining -= pay
    }

    // Extra to priority
    if (strat !== 'minimum' && remaining > 0.01) {
      const actives = states.filter((s) => s.bal > 0.01)
      if (actives.length > 0) {
        const sorted = [...actives].sort((a, b) =>
          strat === 'avalanche' ? b.apr - a.apr : a.bal - b.bal
        )
        sorted[0].pay += remaining
      }
    }

    return states.map((s) => ({ ...s, isTarget: strat !== 'minimum' && s.pay > s.minPay + 0.01 }))
  }, [simResult, simStrategy, active])

  const debtFreeDate = (months) => {
    if (!months || months >= 600) return '∞'
    const d = new Date()
    d.setMonth(d.getMonth() + months)
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  return (
    <div className="mb-5 bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-gray-800 text-amber-400">
            <DollarSign size={15} />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">Debt Priority & Optimizer</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {active.length} active debts · {fmt(totalMonthlyInterest)}/mo in interest · min {fmt(totalMinimums)}/mo
            </p>
          </div>
        </div>
        <div className={clsx('text-gray-500 transition-transform duration-200', open && 'rotate-180')}>
          <ChevronDown size={16} />
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-800 px-5 pb-6 pt-4 space-y-6">

          {/* ── Section 1: Priority ranking ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Priority Order</p>
              <div className="flex gap-1">
                {[
                  { id: 'avalanche', label: 'Avalanche', tip: 'Highest APR first — saves the most money' },
                  { id: 'snowball',  label: 'Snowball',  tip: 'Lowest balance first — fastest individual wins' },
                ].map(({ id, label, tip }) => (
                  <button key={id} onClick={() => setRankStrategy(id)} title={tip}
                    className={clsx('px-3 py-1 rounded-lg text-xs font-medium transition-colors',
                      rankStrategy === id ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                    )}
                  >{label}</button>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-600 mb-3">
              {rankStrategy === 'avalanche'
                ? 'Pay minimums on everything — put any extra cash toward the #1 debt. Mathematically optimal for minimizing total interest.'
                : 'Pay minimums on everything — put any extra cash toward the smallest balance. Builds momentum with faster individual payoffs.'}
            </p>

            <div className="space-y-2">
              {sorted.map((l, i) => (
                <div key={l.id} className={clsx(
                  'flex items-center gap-4 p-3 rounded-xl border',
                  i === 0 ? 'border-amber-500/40 bg-amber-500/5' : 'border-gray-800 bg-gray-800/30'
                )}>
                  <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                    i === 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-700 text-gray-400'
                  )}>{i + 1}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white truncate">{l.name}</p>
                      {i === 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium shrink-0">Pay first</span>}
                    </div>
                    <p className="text-xs text-gray-500">{typeLabel(l.loan_type)}</p>
                  </div>

                  <div className="hidden sm:grid grid-cols-4 gap-4 text-right">
                    <div>
                      <p className="text-xs text-gray-500">Balance</p>
                      <p className="text-sm font-semibold text-white">{fmt(l.current_balance)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">APR</p>
                      <p className={clsx('text-sm font-semibold',
                        Number(l.annual_interest_rate) >= 20 ? 'text-red-400' :
                        Number(l.annual_interest_rate) >= 10 ? 'text-amber-400' : 'text-emerald-400'
                      )}>{pct(l.annual_interest_rate)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Mo. interest</p>
                      <p className="text-sm font-semibold text-red-400">{fmt(l.monthlyInterest)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Payoff</p>
                      <p className="text-sm font-semibold text-gray-300">
                        {l.months === Infinity ? '∞' : `${l.months} mo`}
                      </p>
                    </div>
                  </div>
                  <div className="sm:hidden text-right">
                    <p className="text-sm font-semibold text-red-400">{fmt(l.monthlyInterest)}/mo</p>
                    <p className="text-xs text-gray-500">{pct(l.annual_interest_rate)} APR</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800 text-xs text-gray-500">
              <span>Total interest drain / month</span>
              <span className="text-red-400 font-semibold text-sm">{fmt(totalMonthlyInterest)}/mo</span>
            </div>
          </div>

          {/* ── Section 2: Budget Optimizer ── */}
          <div className="border-t border-gray-800 pt-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Budget Optimizer</p>
            <p className="text-xs text-gray-600 mb-4">
              Enter how much you can put toward all debts each month. The optimizer will show you
              exactly how to split it across Avalanche and Snowball strategies, and compare against paying minimums only.
            </p>

            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-xs text-gray-400 block mb-1">Total monthly debt budget ($)</label>
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => { setBudget(e.target.value); setSimResult(null) }}
                  placeholder={`Min: ${Math.ceil(totalMinimums)}`}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                />
              </div>
              <button
                onClick={runSim}
                disabled={!budget || parseFloat(budget) < totalMinimums}
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
              >
                <Zap size={14} /> Optimize
              </button>
            </div>
            {budget && parseFloat(budget) < totalMinimums && (
              <p className="text-xs text-red-400 mt-1.5">
                Budget must be at least {fmt(totalMinimums)} to cover all minimum payments.
              </p>
            )}

            {simResult && (
              <div className="mt-5 space-y-5">

                {/* Three-way comparison */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: 'minimum',   label: 'Minimums Only', accent: 'border-gray-700',        badge: null },
                    { key: 'avalanche', label: 'Avalanche',     accent: 'border-violet-500/40',   badge: 'Best for interest' },
                    { key: 'snowball',  label: 'Snowball',      accent: 'border-blue-500/40',     badge: 'Best for momentum' },
                  ].map(({ key, label, accent, badge }) => {
                    const r = simResult[key]
                    const saved = key !== 'minimum'
                      ? simResult.minimum.totalInterest - r.totalInterest
                      : null
                    return (
                      <div key={key} className={clsx('rounded-xl border p-4 space-y-2', accent)}>
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-300">{label}</p>
                          {badge && <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400">{badge}</span>}
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Debt-free</p>
                          <p className="text-sm font-bold text-white">{debtFreeDate(r.months)}</p>
                          <p className="text-xs text-gray-600">{r.months} months</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Total interest</p>
                          <p className="text-sm font-bold text-red-400">{fmt(r.totalInterest)}</p>
                        </div>
                        {saved != null && saved > 0 && (
                          <div className="pt-1 border-t border-gray-800">
                            <p className="text-xs text-emerald-400 font-semibold">
                              Saves {fmt(saved)} · {simResult.minimum.months - r.months} mo faster
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Strategy selector for detail view */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Show detail for:</span>
                  {['avalanche','snowball'].map((s) => (
                    <button key={s} onClick={() => setSimStrategy(s)}
                      className={clsx('px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors',
                        simStrategy === s ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                      )}
                    >{s}</button>
                  ))}
                </div>

                {/* This month's allocation */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    This Month's Payment Plan ({simStrategy})
                  </p>
                  <div className="space-y-1.5">
                    {thisMonthAllocation.map((s) => (
                      <div key={s.id} className={clsx(
                        'flex items-center justify-between px-3 py-2.5 rounded-lg border',
                        s.isTarget ? 'border-violet-500/40 bg-violet-500/5' : 'border-gray-800 bg-gray-800/40'
                      )}>
                        <div className="flex items-center gap-2">
                          {s.isTarget && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />}
                          <span className="text-sm text-white">{s.name}</span>
                          {s.isTarget && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400">+ extra here</span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className={clsx('text-sm font-bold', s.isTarget ? 'text-violet-400' : 'text-gray-300')}>
                            {fmt(s.pay)}
                          </span>
                          {s.isTarget && (
                            <p className="text-xs text-gray-500">min {fmt(s.minPay)} + {fmt(s.pay - s.minPay)} extra</p>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-3 py-2 mt-1 border-t border-gray-800 text-xs text-gray-500">
                      <span>Total budget used</span>
                      <span className="text-white font-semibold">{fmt(simResult.budget)}/mo</span>
                    </div>
                  </div>
                </div>

                {/* Payoff order */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Payoff Order ({simStrategy})
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {simResult[simStrategy].payoffOrder.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-3 text-sm">
                        <span className="w-5 h-5 rounded-full bg-gray-800 text-gray-400 text-xs flex items-center justify-center font-bold shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-white flex-1">{p.name}</span>
                        <span className="text-gray-400">{p.date}</span>
                        <span className="text-gray-600 text-xs">({p.month} mo)</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Balance over time chart */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Balance Over Time ({simStrategy})
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={simResult[simStrategy].chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v) => `Mo ${v}`} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip
                        contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                        labelStyle={{ color: '#9ca3af', fontSize: 12 }}
                        formatter={(v, name) => [fmt(v), active.find((d) => String(d.id) === String(name))?.name ?? name]}
                        labelFormatter={(v) => `Month ${v}`}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11, color: '#9ca3af' }}
                        formatter={(value) => active.find((d) => String(d.id) === String(value))?.name ?? value}
                      />
                      {active.map((d, i) => (
                        <Line
                          key={d.id}
                          type="monotone"
                          dataKey={String(d.id)}
                          stroke={DEBT_COLORS[i % DEBT_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          name={String(d.id)}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ─── Shared form ─────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500'

function LoanFormModal({ existing, onClose }) {
  const isEdit = !!existing
  const qc = useQueryClient()
  const [sourceAccountId, setSourceAccountId] = useState('')

  const { register, handleSubmit, control } = useForm({
    defaultValues: existing ?? { loan_type: 'personal' },
  })
  const loanType = useWatch({ control, name: 'loan_type' })
  const isCreditCard  = loanType === 'credit_card'
  const isFriend      = loanType === 'friend'
  const isLentFriend  = loanType === 'lent_to_friend'

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts/').then((r) => r.data),
    enabled: isLentFriend && !isEdit,
  })
  const debitableAccounts = (accountsData?.results ?? accountsData ?? [])
    .filter((a) => a.is_active && ['checking', 'savings', 'cash'].includes(a.account_type))

  const { mutate, isPending, error } = useMutation({
    mutationFn: (data) => {
      // react-hook-form retains previously registered fields as empty strings
      // when the user switches loan type. Strip fields that don't apply.
      if (data.loan_type === 'credit_card') {
        const { term_months, start_date, principal, ...rest } = data
        const payload = Object.fromEntries(
          Object.entries(rest).filter(([, v]) => v !== '')
        )
        return isEdit ? api.patch(`/loans/${existing.id}/`, payload) : api.post('/loans/', payload)
      }
      const payload = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== '')
      )
      if (data.loan_type === 'lent_to_friend' && !isEdit && sourceAccountId) {
        payload.source_account_id = parseInt(sourceAccountId, 10)
      }
      return isEdit ? api.patch(`/loans/${existing.id}/`, payload) : api.post('/loans/', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      onClose()
    },
  })

  const apiError = error?.response?.data

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-lg p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">
            {isEdit
              ? `Edit ${existing.loan_type === 'credit_card' ? 'Credit Card' : existing.loan_type === 'friend' ? 'Borrowed from Friend' : existing.loan_type === 'lent_to_friend' ? 'Lent to Friend' : 'Loan'}`
              : isLentFriend ? 'Lend to Friend' : isFriend ? 'Borrow from Friend' : isCreditCard ? 'Add Credit Card' : 'Add Loan'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
        </div>

        {apiError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
            {typeof apiError === 'string' ? apiError : JSON.stringify(apiError)}
          </div>
        )}

        <form onSubmit={handleSubmit((d) => mutate(d))} className="space-y-4">
          <input
            {...register('name', { required: true })}
            placeholder="Name (e.g. Chase Sapphire)"
            className={inputCls}
          />

          <div className="grid grid-cols-2 gap-3">
            <select
              {...register('loan_type')}
              disabled={isEdit}
              className={clsx(inputCls, isEdit && 'opacity-50 cursor-not-allowed')}
            >
              {LOAN_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <input
              {...register('lender')}
              placeholder={isCreditCard ? 'Issuer (e.g. Chase)' : isFriend ? "Friend's name" : 'Lender'}
              className={inputCls}
            />
          </div>

          {(isFriend || isLentFriend) ? (
            /* ── Borrowed from / Lent to friend ── */
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label={isLentFriend ? 'Amount Lent ($)' : 'Amount Borrowed ($)'}>
                  <input type="number" step="0.01" {...register('current_balance', { required: true })} placeholder="e.g. 500" className={inputCls} />
                </Field>
                <Field label="Date">
                  <input type="date" {...register('start_date')} className={inputCls} />
                </Field>
              </div>
              {isLentFriend && !isEdit && (
                <Field label="Debit From Account (optional)">
                  <select
                    value={sourceAccountId}
                    onChange={(e) => setSourceAccountId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— Don't debit an account —</option>
                    {debitableAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} · ${Number(a.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}</option>
                    ))}
                  </select>
                  {sourceAccountId && (
                    <p className="text-xs text-emerald-400 mt-1">Account balance will be reduced and a transaction created.</p>
                  )}
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Expected Repayment Day (optional)">
                  <input type="number" min="1" max="31" placeholder="e.g. 1" {...register('payment_due_day', { min: 1, max: 31 })} className={inputCls} />
                </Field>
                <Field label="Status">
                  <select {...register('status')} className={inputCls}>
                    <option value="active">Active</option>
                    <option value="paid_off">{isLentFriend ? 'Fully Repaid' : 'Paid Back'}</option>
                  </select>
                </Field>
              </div>
            </>
          ) : isCreditCard ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Credit Limit ($)">
                  <input type="number" step="0.01" {...register('credit_limit', { required: true })} className={inputCls} />
                </Field>
                <Field label="Current Balance ($)">
                  <input type="number" step="0.01" {...register('current_balance', { required: true })} className={inputCls} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="APR (%)">
                  <input type="number" step="0.001" {...register('annual_interest_rate', { required: true })} placeholder="e.g. 24.990" className={inputCls} />
                </Field>
                <Field label="Minimum Payment ($)">
                  <input type="number" step="0.01" {...register('monthly_payment', { required: true })} className={inputCls} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Payment Due Day (optional)">
                  <input
                    type="number"
                    min="1" max="31"
                    placeholder="e.g. 2"
                    {...register('payment_due_day', { min: 1, max: 31 })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Status">
                  <select {...register('status')} className={inputCls}>
                    <option value="active">Active</option>
                    <option value="paid_off">Paid Off</option>
                  </select>
                </Field>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Principal ($)">
                  <input type="number" step="0.01" {...register('principal', { required: true })} className={inputCls} />
                </Field>
                <Field label="Current Balance ($)">
                  <input type="number" step="0.01" {...register('current_balance', { required: true })} className={inputCls} />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Annual Rate (%)">
                  <input type="number" step="0.001" {...register('annual_interest_rate', { required: true })} className={inputCls} />
                </Field>
                <Field label="Term (months)">
                  <input type="number" {...register('term_months', { required: true })} className={inputCls} />
                </Field>
                <Field label="Monthly Payment ($)">
                  <input type="number" step="0.01" {...register('monthly_payment', { required: true })} className={inputCls} />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Start Date">
                  <input type="date" {...register('start_date', { required: true })} className={inputCls} />
                </Field>
                <Field label="Due Day (optional)">
                  <input
                    type="number"
                    min="1" max="31"
                    placeholder="e.g. 15"
                    {...register('payment_due_day', { min: 1, max: 31 })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Status">
                  <select {...register('status')} className={inputCls}>
                    <option value="active">Active</option>
                    <option value="paid_off">Paid Off</option>
                    <option value="refinanced">Refinanced</option>
                  </select>
                </Field>
              </div>
            </>
          )}

          <textarea
            {...register('notes')}
            placeholder="Notes (optional)"
            rows={2}
            className={clsx(inputCls, 'resize-none')}
          />

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : isCreditCard ? 'Add Credit Card' : isLentFriend ? 'Record Loan to Friend' : isFriend ? 'Record Borrowed Loan' : 'Add Loan'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Delete confirmation ──────────────────────────────────────────────────────

function DeleteConfirmModal({ loan, onClose }) {
  const qc = useQueryClient()
  const { mutate, isPending } = useMutation({
    mutationFn: () => api.delete(`/loans/${loan.id}/`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); onClose() },
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-white mb-2">Delete "{loan.name}"?</h2>
        <p className="text-sm text-gray-400 mb-6">This will permanently remove the record and all payment history.</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors">
            Cancel
          </button>
          <button
            onClick={() => mutate()}
            disabled={isPending}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Loans() {
  const [modal, setModal] = useState(null) // null | { type: 'add' | 'edit' | 'delete', loan?: {} }
  const [mathEngineLoan, setMathEngineLoan] = useState(null)
  const [ccMathEngineLoan, setCcMathEngineLoan] = useState(null)
  const [recordPaymentLoan, setRecordPaymentLoan] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['loans'],
    queryFn: () => api.get('/loans/').then((r) => r.data),
  })

  const loans          = data?.results ?? []
  const debtLoans      = loans.filter((l) => l.loan_type !== 'lent_to_friend')
  const activeDebts    = debtLoans.filter((l) => l.status === 'active')
  const totalDebt      = activeDebts.reduce((s, l) => s + Number(l.current_balance), 0)
  const totalReceivable = loans.filter((l) => l.loan_type === 'lent_to_friend' && l.status === 'active')
                               .reduce((s, l) => s + Number(l.current_balance), 0)
  const creditCards    = loans.filter((l) => l.loan_type === 'credit_card')
  const friendLoans    = loans.filter((l) => l.loan_type === 'friend')
  const lentLoans      = loans.filter((l) => l.loan_type === 'lent_to_friend')
  const regularLoans   = loans.filter((l) => !['credit_card', 'friend', 'lent_to_friend'].includes(l.loan_type))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Debt Engine</h1>
          <p className="text-gray-500 text-sm mt-1">
            {activeDebts.length} active debt{activeDebts.length !== 1 ? 's' : ''} · Total outstanding:{' '}
            <span className="text-red-400 font-semibold">{fmt(totalDebt)}</span>
            {totalReceivable > 0 && (
              <> · <span className="text-emerald-400 font-semibold">{fmt(totalReceivable)}</span> owed to you</>
            )}
          </p>
        </div>
        <button
          onClick={() => setModal({ type: 'add' })}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Add Loan / Card
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm text-center py-16">Loading…</p>
      ) : loans.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-lg font-medium text-gray-500">No debts tracked yet</p>
          <p className="text-sm text-gray-600 mt-1">Add a loan, credit card, or record money lent to a friend</p>
        </div>
      ) : (
        <>
          <DebtSection
            title="Credit Cards"
            icon={CreditCard}
            iconColor="text-violet-400"
            loans={creditCards}
            onEdit={(l) => setModal({ type: 'edit', loan: l })}
            onDelete={(l) => setModal({ type: 'delete', loan: l })}
            onMathEngine={(l) => setCcMathEngineLoan(l)}
            summary={(() => {
              const active = creditCards.filter((l) => l.status === 'active')
              const avg = active.length ? active.reduce((s, l) => s + (l.utilization_pct ?? 0), 0) / active.length : 0
              return [
                { label: 'Total Balance', value: fmt(active.reduce((s, l) => s + Number(l.current_balance), 0)), color: 'text-red-400' },
                { label: 'Avg Utilization', value: active.length ? avg.toFixed(1) + '%' : '—', color: avg <= 30 ? 'text-emerald-400' : avg <= 60 ? 'text-amber-400' : 'text-red-400' },
                { label: 'Min Payments', value: fmt(active.reduce((s, l) => s + Number(l.monthly_payment), 0)) + '/mo', color: 'text-gray-300' },
              ]
            })()}
          />

          <DebtSection
            title="Borrowed from Friends"
            icon={Users}
            iconColor="text-blue-400"
            loans={friendLoans}
            onEdit={(l) => setModal({ type: 'edit', loan: l })}
            onDelete={(l) => setModal({ type: 'delete', loan: l })}
            summary={(() => {
              const active = friendLoans.filter((l) => l.status === 'active')
              return [
                { label: 'Total Owed', value: fmt(active.reduce((s, l) => s + Number(l.current_balance), 0)), color: 'text-red-400' },
                { label: 'Interest', value: '0%', color: 'text-emerald-400' },
              ]
            })()}
          />

          <DebtSection
            title="Lent to Friends"
            icon={Users}
            iconColor="text-emerald-400"
            loans={lentLoans}
            onEdit={(l) => setModal({ type: 'edit', loan: l })}
            onDelete={(l) => setModal({ type: 'delete', loan: l })}
            summary={(() => {
              const active = lentLoans.filter((l) => l.status === 'active')
              return [
                { label: 'Total Owed to You', value: fmt(active.reduce((s, l) => s + Number(l.current_balance), 0)), color: 'text-emerald-400' },
                { label: 'Interest', value: '0%', color: 'text-gray-400' },
              ]
            })()}
          />

          <DebtSection
            title="Loans"
            icon={DollarSign}
            iconColor="text-amber-400"
            loans={regularLoans}
            onEdit={(l) => setModal({ type: 'edit', loan: l })}
            onDelete={(l) => setModal({ type: 'delete', loan: l })}
            onMathEngine={(l) => setMathEngineLoan(l)}
            onRecordPayment={(l) => setRecordPaymentLoan(l)}
            summary={(() => {
              const active = regularLoans.filter((l) => l.status === 'active')
              return [
                { label: 'Total Balance', value: fmt(active.reduce((s, l) => s + Number(l.current_balance), 0)), color: 'text-red-400' },
                { label: 'Monthly Payments', value: fmt(active.reduce((s, l) => s + Number(l.monthly_payment), 0)) + '/mo', color: 'text-gray-300' },
                { label: 'Avg Rate', value: active.length ? (active.reduce((s, l) => s + Number(l.annual_interest_rate), 0) / active.length).toFixed(2) + '%' : '—', color: 'text-amber-400' },
              ]
            })()}
          />

          <DebtPriorityPanel loans={debtLoans} />
        </>
      )}

      {(modal?.type === 'add' || modal?.type === 'edit') && (
        <LoanFormModal
          existing={modal.type === 'edit' ? modal.loan : null}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'delete' && (
        <DeleteConfirmModal loan={modal.loan} onClose={() => setModal(null)} />
      )}
      {mathEngineLoan && (
        <LoanMathEngineModal loan={mathEngineLoan} onClose={() => setMathEngineLoan(null)} />
      )}
      {ccMathEngineLoan && (
        <CreditCardMathEngineModal loan={ccMathEngineLoan} onClose={() => setCcMathEngineLoan(null)} />
      )}
      {recordPaymentLoan && (
        <RecordPaymentModal loan={recordPaymentLoan} onClose={() => setRecordPaymentLoan(null)} />
      )}
    </div>
  )
}
