import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  Plus, X, Pencil, Trash2, ChevronDown,
  Tv, Music, Gamepad2, Monitor, Phone, Shield,
  Zap, Dumbbell, Newspaper, GraduationCap, UtensilsCrossed, Tag, Landmark,
} from 'lucide-react'
import api from '../lib/api'
import clsx from 'clsx'

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'streaming',  label: 'Streaming',        icon: Tv,              color: '#ef4444', bg: 'bg-red-500/15',     text: 'text-red-400' },
  { value: 'music',      label: 'Music',             icon: Music,           color: '#a855f7', bg: 'bg-purple-500/15',  text: 'text-purple-400' },
  { value: 'gaming',     label: 'Gaming',            icon: Gamepad2,        color: '#06b6d4', bg: 'bg-cyan-500/15',    text: 'text-cyan-400' },
  { value: 'software',   label: 'Software / SaaS',   icon: Monitor,         color: '#3b82f6', bg: 'bg-blue-500/15',    text: 'text-blue-400' },
  { value: 'phone',      label: 'Phone / Mobile',    icon: Phone,           color: '#10b981', bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  { value: 'insurance',  label: 'Insurance',         icon: Shield,          color: '#f59e0b', bg: 'bg-amber-500/15',   text: 'text-amber-400' },
  { value: 'utilities',  label: 'Utilities',         icon: Zap,             color: '#eab308', bg: 'bg-yellow-500/15',  text: 'text-yellow-400' },
  { value: 'fitness',    label: 'Fitness / Gym',     icon: Dumbbell,        color: '#f97316', bg: 'bg-orange-500/15',  text: 'text-orange-400' },
  { value: 'news',       label: 'News / Media',      icon: Newspaper,       color: '#6366f1', bg: 'bg-indigo-500/15',  text: 'text-indigo-400' },
  { value: 'education',  label: 'Education',         icon: GraduationCap,   color: '#8b5cf6', bg: 'bg-violet-500/15',  text: 'text-violet-400' },
  { value: 'food',       label: 'Food / Delivery',   icon: UtensilsCrossed, color: '#ec4899', bg: 'bg-pink-500/15',    text: 'text-pink-400' },
  { value: 'other',      label: 'Other',             icon: Tag,             color: '#6b7280', bg: 'bg-gray-500/15',    text: 'text-gray-400' },
]

const BILLING_CYCLES = [
  { value: 'weekly',      label: 'Weekly' },
  { value: 'monthly',     label: 'Monthly' },
  { value: 'quarterly',   label: 'Quarterly' },
  { value: 'semi_annual', label: 'Semi-Annual' },
  { value: 'yearly',      label: 'Yearly' },
]

const CYCLE_TO_MONTHS = {
  weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, semi_annual: 1 / 6, yearly: 1 / 12,
}

const catMeta = (value) => CATEGORIES.find((c) => c.value === value) ?? CATEGORIES.at(-1)
const fmt  = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const monthlyCost = (s) => Number(s.amount) * (CYCLE_TO_MONTHS[s.billing_cycle] ?? 1)

// ─── Days until next billing ──────────────────────────────────────────────────

function DaysUntil({ date }) {
  if (!date) return null
  const days = Math.ceil((new Date(date) - new Date()) / 86400000)
  if (days < 0)  return <span className="text-xs text-red-400 font-medium">Overdue</span>
  if (days === 0) return <span className="text-xs text-amber-400 font-medium">Due today</span>
  const color = days <= 3 ? 'text-red-400' : days <= 7 ? 'text-amber-400' : 'text-gray-500'
  return <span className={clsx('text-xs', color)}>in {days}d</span>
}

// ─── Subscription card ────────────────────────────────────────────────────────

function SubCard({ sub, onEdit, onDelete }) {
  const meta    = catMeta(sub.category)
  const Icon    = meta.icon
  const monthly = monthlyCost(sub)

  return (
    <div className={clsx(
      'bg-gray-900 rounded-xl border p-4 flex items-center gap-4 group',
      sub.status === 'active'    ? 'border-gray-800' :
      sub.status === 'paused'    ? 'border-amber-900/40 opacity-70' :
                                   'border-gray-800 opacity-40'
    )}>
      {/* Icon */}
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', meta.bg)}>
        <Icon size={18} className={meta.text} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-white truncate">{sub.name}</p>
          {sub.status !== 'active' && (
            <span className={clsx(
              'text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0',
              sub.status === 'paused' ? 'bg-amber-500/15 text-amber-400' : 'bg-gray-700 text-gray-400'
            )}>
              {sub.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-500 capitalize">
            {fmt(sub.amount)} / {BILLING_CYCLES.find((b) => b.value === sub.billing_cycle)?.label.toLowerCase()}
          </span>
          {sub.next_billing_date && (
            <>
              <span className="text-gray-700">·</span>
              <DaysUntil date={sub.next_billing_date} />
            </>
          )}
          {sub.account && (
            <>
              <span className="text-gray-700">·</span>
              <span className="text-xs text-blue-400 flex items-center gap-1">
                <Landmark size={10} />{sub.account.name}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Monthly cost */}
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-white">{fmt(monthly)}<span className="text-xs text-gray-500 font-normal">/mo</span></p>
      </div>

      {/* Actions — show on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={onEdit}   className="p-1.5 rounded-lg text-gray-500 hover:text-violet-400 hover:bg-gray-800 transition-colors"><Pencil size={13} /></button>
        <button onClick={onDelete} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400   hover:bg-gray-800 transition-colors"><Trash2 size={13} /></button>
      </div>
    </div>
  )
}

// ─── Collapsible category section ────────────────────────────────────────────

function CategorySection({ category, subs, onEdit, onDelete }) {
  const [open, setOpen] = useState(true)
  const meta    = catMeta(category)
  const Icon    = meta.icon
  const total   = subs.reduce((s, sub) => s + monthlyCost(sub), 0)
  const active  = subs.filter((s) => s.status === 'active').length

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={clsx('p-1.5 rounded-lg', meta.bg)}>
            <Icon size={15} className={meta.text} />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">{meta.label}</p>
            <p className="text-xs text-gray-500">{active} active · {subs.length} total</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-gray-500">Monthly</p>
            <p className="text-sm font-bold text-white">{fmt(total)}</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-gray-500">Annual</p>
            <p className="text-sm font-bold text-gray-400">{fmt(total * 12)}</p>
          </div>
          <div className={clsx('text-gray-500 transition-transform duration-200', open && 'rotate-180')}>
            <ChevronDown size={16} />
          </div>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-800 space-y-2">
          {subs.map((s) => (
            <SubCard key={s.id} sub={s} onEdit={() => onEdit(s)} onDelete={() => onDelete(s)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Form modal ───────────────────────────────────────────────────────────────

const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500'

function SubFormModal({ existing, onClose }) {
  const isEdit = !!existing
  const qc = useQueryClient()
  const { register, handleSubmit } = useForm({
    defaultValues: existing
      ? { ...existing, account_id: existing.account?.id ?? '' }
      : { billing_cycle: 'monthly', status: 'active', category: 'streaming', account_id: '' },
  })

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts/').then((r) => r.data),
  })
  const accounts = accountsData?.results ?? accountsData ?? []

  const { mutate, isPending, error } = useMutation({
    mutationFn: (data) => {
      const payload = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== ''))
      if ('account_id' in payload && !payload.account_id) payload.account_id = null
      if (payload.account_id) payload.account_id = Number(payload.account_id)
      return isEdit ? api.patch(`/subscriptions/${existing.id}/`, payload) : api.post('/subscriptions/', payload)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['subscriptions'] }); qc.invalidateQueries({ queryKey: ['sub-summary'] }); onClose() },
  })

  const apiError = error?.response?.data

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-md p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">{isEdit ? 'Edit Subscription' : 'Add Subscription'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
        </div>

        {apiError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
            {typeof apiError === 'string' ? apiError : JSON.stringify(apiError)}
          </div>
        )}

        <form onSubmit={handleSubmit((d) => mutate(d))} className="space-y-4">
          <input {...register('name', { required: true })} placeholder="Name (e.g. Netflix)" className={inputCls} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Category</label>
              <select {...register('category')} className={inputCls}>
                {CATEGORIES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Status</label>
              <select {...register('status')} className={inputCls}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Amount ($)</label>
              <input type="number" step="0.01" {...register('amount', { required: true })} placeholder="e.g. 15.99" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Billing Cycle</label>
              <select {...register('billing_cycle')} className={inputCls}>
                {BILLING_CYCLES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Next Billing Date</label>
              <input type="date" {...register('next_billing_date')} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Start Date (optional)</label>
              <input type="date" {...register('start_date')} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Charged to Account</label>
            <select {...register('account_id')} className={inputCls}>
              <option value="">— No account linked —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.institution ? ` · ${a.institution}` : ''}
                </option>
              ))}
            </select>
          </div>

          <input {...register('website')} placeholder="Website (optional)" className={inputCls} />
          <textarea {...register('notes')} placeholder="Notes (optional)" rows={2} className={clsx(inputCls, 'resize-none')} />

          <button type="submit" disabled={isPending} className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors">
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Subscription'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteModal({ sub, onClose }) {
  const qc = useQueryClient()
  const { mutate, isPending } = useMutation({
    mutationFn: () => api.delete(`/subscriptions/${sub.id}/`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['subscriptions'] }); qc.invalidateQueries({ queryKey: ['sub-summary'] }); onClose() },
  })
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-white mb-2">Remove "{sub.name}"?</h2>
        <p className="text-sm text-gray-400 mb-6">This will permanently delete this subscription.</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors">Cancel</button>
          <button onClick={() => mutate()} disabled={isPending} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {isPending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Subscriptions() {
  const [modal, setModal] = useState(null)
  const [view,  setView]  = useState('monthly') // 'monthly' | 'annual'
  const [statusFilter, setStatusFilter] = useState('active')

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ['subscriptions', statusFilter],
    queryFn: () => api.get('/subscriptions/', { params: statusFilter !== 'all' ? { status: statusFilter } : {} }).then((r) => r.data.results ?? r.data),
  })

  const { data: summary } = useQuery({
    queryKey: ['sub-summary'],
    queryFn: () => api.get('/subscriptions/summary/').then((r) => r.data),
  })

  // Group by category preserving CATEGORIES order
  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    subs: subs.filter((s) => s.category === cat.value),
  })).filter((g) => g.subs.length > 0)

  const totalMonthly = subs.filter((s) => s.status === 'active').reduce((sum, s) => sum + monthlyCost(s), 0)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Subscriptions</h1>
          <p className="text-gray-500 text-sm mt-1">Recurring charges & memberships</p>
        </div>
        <button
          onClick={() => setModal({ type: 'add' })}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Add Subscription
        </button>
      </div>

      {/* Summary bar */}
      {summary && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Monthly Spend',  value: fmt(summary.total_monthly), color: 'text-white' },
            { label: 'Annual Spend',   value: fmt(summary.total_annual),  color: 'text-red-400' },
            { label: 'Active',         value: summary.active_count,        color: 'text-emerald-400' },
            {
              label: 'Biggest Category',
              value: (() => {
                const top = Object.entries(summary.by_category ?? {})[0]
                return top ? `${catMeta(top[0]).label} (${fmt(top[1])}/mo)` : '—'
              })(),
              color: 'text-violet-400',
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-900 rounded-xl border border-gray-800 px-5 py-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
              <p className={clsx('text-xl font-bold mt-1', color)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-2">
          {['active', 'paused', 'cancelled', 'all'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={clsx(
                'px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors',
                statusFilter === s ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
          {['monthly', 'annual'].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={clsx('px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors', view === v ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200')}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <p className="text-gray-500 text-sm text-center py-16">Loading…</p>
      ) : subs.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-lg font-medium text-gray-500">No subscriptions yet</p>
          <p className="text-sm text-gray-600 mt-1">Add Netflix, Spotify, insurance — anything that bills you regularly</p>
        </div>
      ) : (
        <div>
          {grouped.map(({ value, subs: catSubs }) => (
            <CategorySection
              key={value}
              category={value}
              subs={catSubs}
              onEdit={(s)    => setModal({ type: 'edit',   sub: s })}
              onDelete={(s)  => setModal({ type: 'delete', sub: s })}
            />
          ))}

          {/* Total footer */}
          <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center justify-between">
            <p className="text-sm text-gray-400">
              Total ({statusFilter === 'all' ? 'all' : statusFilter} subscriptions shown)
            </p>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-xs text-gray-500">Monthly</p>
                <p className="text-sm font-bold text-white">{fmt(totalMonthly)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Annually</p>
                <p className="text-sm font-bold text-red-400">{fmt(totalMonthly * 12)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {(modal?.type === 'add' || modal?.type === 'edit') && (
        <SubFormModal existing={modal.type === 'edit' ? modal.sub : null} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'delete' && (
        <DeleteModal sub={modal.sub} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
