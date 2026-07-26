import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  Flame, Shield, TrendingDown, PiggyBank, TrendingUp,
  DollarSign, Target, Plus, Pencil, Trash2, X, CheckCircle2,
  Calendar, ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'
import api from '../lib/api'

const fmt = (n) => '$' + Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmt2 = (n) => '$' + Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const GOAL_META = {
  fire:           { label: 'FIRE',           icon: Flame,        color: 'amber',  bg: 'bg-amber-500/15',  text: 'text-amber-400',  border: 'border-amber-500/30' },
  emergency_fund: { label: 'Emergency Fund', icon: Shield,       color: 'blue',   bg: 'bg-blue-500/15',   text: 'text-blue-400',   border: 'border-blue-500/30' },
  debt_free:      { label: 'Debt Free',      icon: TrendingDown, color: 'red',    bg: 'bg-red-500/15',    text: 'text-red-400',    border: 'border-red-500/30' },
  savings:        { label: 'Savings',        icon: PiggyBank,    color: 'green',  bg: 'bg-emerald-500/15',text: 'text-emerald-400',border: 'border-emerald-500/30' },
  investment:     { label: 'Investment',     icon: TrendingUp,   color: 'violet', bg: 'bg-violet-500/15', text: 'text-violet-400', border: 'border-violet-500/30' },
  income:         { label: 'Passive Income', icon: DollarSign,   color: 'cyan',   bg: 'bg-cyan-500/15',   text: 'text-cyan-400',   border: 'border-cyan-500/30' },
  custom:         { label: 'Custom',         icon: Target,       color: 'gray',   bg: 'bg-gray-500/15',   text: 'text-gray-400',   border: 'border-gray-500/30' },
}

const STATUS_META = {
  active:    { label: 'Active',    cls: 'bg-emerald-500/15 text-emerald-400' },
  completed: { label: 'Completed', cls: 'bg-violet-500/15 text-violet-400' },
  paused:    { label: 'Paused',    cls: 'bg-amber-500/15 text-amber-400' },
  abandoned: { label: 'Abandoned', cls: 'bg-red-500/15 text-red-400' },
}

const PRIORITY_LABEL = { 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low' }

function daysUntil(dateStr) {
  if (!dateStr) return null
  const diff = Math.round((new Date(dateStr + 'T00:00:00') - new Date()) / 86400000)
  return diff
}

export default function Goals() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('active')

  const { data: goalsData, isLoading } = useQuery({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals/').then((r) => r.data),
  })

  const goals = (goalsData?.results ?? goalsData ?? [])

  const filtered = filter === 'all'
    ? goals
    : goals.filter((g) => g.status === filter)

  const stats = {
    active:    goals.filter((g) => g.status === 'active').length,
    completed: goals.filter((g) => g.status === 'completed').length,
    total:     goals.length,
  }

  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(g)   { setEditing(g);   setModalOpen(true) }
  function closeModal()  { setEditing(null); setModalOpen(false) }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Financial Goals</h1>
          <p className="text-gray-500 text-sm mt-1">Track your journey to financial freedom</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Add Goal
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Active Goals',    value: stats.active,    color: 'text-emerald-400' },
          { label: 'Completed',       value: stats.completed, color: 'text-violet-400' },
          { label: 'Total Goals',     value: stats.total,     color: 'text-white' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={clsx('text-2xl font-bold', color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 mb-6 w-fit">
        {[
          { id: 'active', label: 'Active' },
          { id: 'completed', label: 'Completed' },
          { id: 'paused', label: 'Paused' },
          { id: 'all', label: 'All' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={clsx(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              filter === id ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-gray-200',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Goals grid */}
      {isLoading ? (
        <div className="text-gray-500 text-sm py-20 text-center">Loading goals…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Target size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No goals yet. Add your first goal to start tracking your progress.</p>
          <button
            onClick={openCreate}
            className="mt-4 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-medium transition-colors"
          >
            Add Goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map((g) => (
            <GoalCard key={g.id} goal={g} onEdit={openEdit} qc={qc} />
          ))}
        </div>
      )}

      {modalOpen && (
        <GoalModal
          existing={editing}
          onClose={closeModal}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['goals'] }); closeModal() }}
        />
      )}
    </div>
  )
}

function GoalCard({ goal, onEdit, qc }) {
  const meta     = GOAL_META[goal.goal_type] ?? GOAL_META.custom
  const Icon     = meta.icon
  const target   = Number(goal.effective_target ?? 0)
  const current  = Number(goal.current_amount ?? 0)
  const pct      = Number(goal.progress_pct ?? 0)
  const days     = daysUntil(goal.target_date)
  const statusM  = STATUS_META[goal.status] ?? STATUS_META.active

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/goals/${goal.id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  })

  const barColor = pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-violet-500' : pct >= 40 ? 'bg-amber-400' : 'bg-blue-500'

  return (
    <div className={clsx('bg-gray-900 rounded-xl border p-5 flex flex-col gap-4', meta.border)}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={clsx('p-2.5 rounded-xl flex-shrink-0', meta.bg)}>
            <Icon size={18} className={meta.text} />
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold truncate">{goal.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={clsx('text-xs px-2 py-0.5 rounded-full', meta.bg, meta.text)}>{meta.label}</span>
              <span className={clsx('text-xs px-2 py-0.5 rounded-full', statusM.cls)}>{statusM.label}</span>
              <span className="text-xs text-gray-600">P{goal.priority}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onEdit(goal)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => { if (confirm('Delete this goal?')) deleteMut.mutate() }}
            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Progress */}
      {target > 0 && (
        <div>
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">
                {goal.goal_type === 'fire' ? 'Net Worth (auto-synced)' : 'Saved'}
              </p>
              <p className={clsx('text-lg font-bold', current < 0 ? 'text-red-400' : 'text-white')}>
                {current < 0 ? '-' : ''}{fmt(Math.abs(current))}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-0.5">
                {goal.goal_type === 'fire' ? 'FIRE Number' : 'Target'}
              </p>
              <p className="text-sm font-semibold text-gray-300">{fmt(target)}</p>
            </div>
          </div>

          {current < 0 && goal.goal_type === 'fire' ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <p className="text-xs text-red-400">
                Net worth is negative — pay down debt first to start building toward FIRE.
                You need {fmt(target)} net worth to reach your number.
              </p>
            </div>
          ) : (
            <>
              <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={clsx('h-full rounded-full transition-all duration-700', barColor)}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-xs text-gray-500">{pct.toFixed(1)}% complete</span>
                {Number(goal.amount_remaining ?? 0) > 0 && (
                  <span className="text-xs text-gray-500">{fmt(goal.amount_remaining)} to go</span>
                )}
                {pct >= 100 && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 size={12} /> Goal reached!
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* FIRE-specific info */}
      {goal.goal_type === 'fire' && goal.annual_expenses && (
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-800">
          <div>
            <p className="text-xs text-gray-500">Annual Expenses</p>
            <p className="text-sm font-semibold text-white mt-0.5">{fmt2(goal.annual_expenses)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Withdrawal Rate</p>
            <p className="text-sm font-semibold text-white mt-0.5">{Number(goal.withdrawal_rate).toFixed(2)}%</p>
          </div>
        </div>
      )}

      {/* Target date */}
      {goal.target_date && (
        <div className="flex items-center gap-2 pt-1 border-t border-gray-800">
          <Calendar size={13} className="text-gray-500" />
          <span className="text-xs text-gray-500">
            Target:{' '}
            <span className={clsx(
              'font-medium',
              days === null ? 'text-gray-400'
                : days < 0    ? 'text-red-400'
                : days <= 30  ? 'text-amber-400'
                : 'text-gray-300',
            )}>
              {new Date(goal.target_date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              {days !== null && (
                <span className="ml-1 text-gray-500">
                  ({days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'today' : `${days}d left`})
                </span>
              )}
            </span>
          </span>
        </div>
      )}

      {/* AI notes */}
      {goal.ai_notes && (
        <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-3">
          <p className="text-xs text-violet-300 leading-relaxed">{goal.ai_notes}</p>
        </div>
      )}
    </div>
  )
}

function GoalModal({ existing, onClose, onSaved }) {
  const isEdit = !!existing
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      goal_type:       existing?.goal_type        ?? 'savings',
      name:            existing?.name             ?? '',
      target_amount:   existing?.target_amount    ?? '',
      target_date:     existing?.target_date      ?? '',
      current_amount:  existing?.current_amount   ?? '0',
      annual_expenses: existing?.annual_expenses  ?? '',
      withdrawal_rate: existing?.withdrawal_rate  ?? '4',
      status:          existing?.status           ?? 'active',
      priority:        existing?.priority         ?? '3',
      ai_notes:        existing?.ai_notes         ?? '',
    },
  })

  const goalType = watch('goal_type')
  const annualExpenses = Number(watch('annual_expenses') ?? 0)
  const withdrawalRate = Number(watch('withdrawal_rate') ?? 4)
  const previewFire = annualExpenses > 0 && withdrawalRate > 0
    ? annualExpenses / (withdrawalRate / 100)
    : null

  async function onSubmit(data) {
    const payload = {
      goal_type:      data.goal_type,
      name:           data.name,
      current_amount: Number(data.current_amount || 0),
      status:         data.status,
      priority:       Number(data.priority),
      ai_notes:       data.ai_notes || '',
    }
    if (goalType === 'fire') {
      payload.annual_expenses = data.annual_expenses ? Number(data.annual_expenses) : null
      payload.withdrawal_rate = Number(data.withdrawal_rate || 4)
    } else {
      payload.target_amount = data.target_amount ? Number(data.target_amount) : null
      payload.target_date   = data.target_date   || null
    }

    if (isEdit) {
      await api.patch(`/goals/${existing.id}/`, payload)
    } else {
      await api.post('/goals/', payload)
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white">{isEdit ? 'Edit Goal' : 'New Goal'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          {/* Goal type */}
          <div>
            <label className="text-xs text-gray-400 mb-2 block">Goal Type</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(GOAL_META).map(([key, meta]) => {
                const Icon = meta.icon
                return (
                  <label
                    key={key}
                    className={clsx(
                      'flex flex-col items-center gap-1.5 p-3 rounded-xl border cursor-pointer transition-all text-xs font-medium',
                      goalType === key
                        ? clsx(meta.bg, meta.border, meta.text)
                        : 'border-gray-800 text-gray-500 hover:border-gray-700',
                    )}
                  >
                    <input type="radio" value={key} {...register('goal_type')} className="sr-only" />
                    <Icon size={16} />
                    <span>{meta.label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Goal Name</label>
            <input
              {...register('name', { required: 'Name is required' })}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
              placeholder="e.g. FIRE by 45, Emergency Fund, Pay off mortgage"
            />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
          </div>

          {/* FIRE fields */}
          {goalType === 'fire' ? (
            <div className="space-y-4 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
              <p className="text-xs font-semibold text-amber-400">FIRE Settings</p>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Annual Living Expenses ($)</label>
                <input
                  type="number" step="0.01"
                  {...register('annual_expenses')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500"
                  placeholder="e.g. 50000"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Safe Withdrawal Rate (%)</label>
                <input
                  type="number" step="0.1"
                  {...register('withdrawal_rate')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500"
                  placeholder="4.0"
                />
              </div>
              {previewFire && (
                <div className="bg-amber-500/10 rounded-lg p-3">
                  <p className="text-xs text-gray-400">Your FIRE number</p>
                  <p className="text-lg font-bold text-amber-400">{fmt(previewFire)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    = {fmt(annualExpenses)} / {withdrawalRate}%
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Target Amount ($)</label>
                <input
                  type="number" step="0.01"
                  {...register('target_amount')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                  placeholder="e.g. 10000"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Target Date</label>
                <input
                  type="date"
                  {...register('target_date')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>
          )}

          {/* Current amount — hidden for FIRE (auto-synced to net worth) */}
          {goalType !== 'fire' && (
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Current Amount ($)</label>
              <input
                type="number" step="0.01"
                {...register('current_amount')}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                placeholder="How much have you saved toward this goal?"
              />
            </div>
          )}
          {goalType === 'fire' && (
            <div className="bg-gray-800/50 rounded-xl px-4 py-3 text-xs text-gray-500">
              Current amount is automatically synced to your net worth — no need to enter it manually.
            </div>
          )}

          {/* Priority + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Priority</label>
              <select
                {...register('priority')}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
              >
                <option value="1">1 — Critical</option>
                <option value="2">2 — High</option>
                <option value="3">3 — Medium</option>
                <option value="4">4 — Low</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Status</label>
              <select
                {...register('status')}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="abandoned">Abandoned</option>
              </select>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Goal'}
          </button>
        </form>
      </div>
    </div>
  )
}
