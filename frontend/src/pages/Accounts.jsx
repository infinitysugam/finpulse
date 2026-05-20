import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Landmark, CreditCard, Wallet, PiggyBank, Plus, Pencil, Trash2, ExternalLink,
} from 'lucide-react'
import clsx from 'clsx'
import api from '../lib/api'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n) =>
  n == null ? '—' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const pct = (n) => (n == null ? '—' : `${Number(n).toFixed(2)}%`)

function utilizationColor(p) {
  if (p <= 30) return { bar: 'bg-emerald-500', text: 'text-emerald-400', label: 'Healthy' }
  if (p <= 60) return { bar: 'bg-amber-500',   text: 'text-amber-400',   label: 'Moderate' }
  return        { bar: 'bg-red-500',            text: 'text-red-400',     label: 'High' }
}

const ACCOUNT_TYPE_META = {
  checking:    { label: 'Checking',    icon: Landmark,  color: 'text-blue-400',    bg: 'bg-blue-500/15' },
  savings:     { label: 'Savings',     icon: PiggyBank, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  credit_card: { label: 'Credit Card', icon: CreditCard, color: 'text-violet-400', bg: 'bg-violet-500/15' },
  cash:        { label: 'Cash',        icon: Wallet,    color: 'text-amber-400',   bg: 'bg-amber-500/15' },
  other:       { label: 'Other',       icon: Landmark,  color: 'text-gray-400',    bg: 'bg-gray-700' },
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, max, colorClass }) {
  const p = max > 0 ? Math.min((Number(value) / Number(max)) * 100, 100) : 0
  return (
    <div className="w-full bg-gray-800 rounded-full h-1.5">
      <div className={clsx('h-1.5 rounded-full transition-all', colorClass)} style={{ width: `${p}%` }} />
    </div>
  )
}

// ─── Account cards ────────────────────────────────────────────────────────────

function CreditCardAccountCard({ account, onEdit, onDelete }) {
  const loan = account.loan
  const utilPct = account.utilization_pct ?? 0
  const { bar, text, label } = utilizationColor(utilPct)

  // Prefer live data from linked loan, fall back to account fields
  const balance = loan ? loan.current_balance : account.balance
  const limit   = loan ? loan.credit_limit    : account.credit_limit
  const apr     = loan ? loan.annual_interest_rate : account.annual_interest_rate
  const minPay  = loan ? loan.monthly_payment : account.monthly_payment

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center">
            <CreditCard size={15} className="text-violet-400" />
          </div>
          <div>
            <p className="font-semibold text-white">{account.name}</p>
            <p className="text-xs text-gray-500">{account.institution || 'Credit Card'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {loan && (
            <a
              href="/loans"
              onClick={(e) => { e.preventDefault(); window.location.href = '/loans' }}
              className="p-1.5 rounded-lg text-gray-500 hover:text-violet-400 hover:bg-gray-800 transition-colors"
              title="View in Loans"
            >
              <ExternalLink size={14} />
            </a>
          )}
          <button onClick={() => onEdit(account)} className="p-1.5 rounded-lg text-gray-500 hover:text-violet-400 hover:bg-gray-800 transition-colors">
            <Pencil size={14} />
          </button>
          <button onClick={() => onDelete(account)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Balance</p>
          <p className="text-lg font-bold text-white">{fmt(balance)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Limit</p>
          <p className="text-lg font-bold text-gray-300">{fmt(limit)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">APR</p>
          <p className="text-lg font-bold text-amber-400">{pct(apr)}</p>
        </div>
      </div>

      {limit && (
        <>
          <ProgressBar value={balance} max={limit} colorClass={bar} />
          <div className="flex items-center justify-between text-xs mt-1.5">
            <span className="text-gray-500">{utilPct}% utilized</span>
            <span className={clsx('font-medium', text)}>{label}</span>
          </div>
        </>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        {minPay ? (
          <span>Min payment: <span className="text-white font-medium">{fmt(minPay)}/mo</span></span>
        ) : <span />}
        {limit && (
          <span>Available: <span className="text-emerald-400 font-medium">{fmt(Number(limit) - Number(balance))}</span></span>
        )}
      </div>

      {loan && (
        <p className="text-xs text-violet-400/60 mt-2">Also tracked in Loans</p>
      )}
    </div>
  )
}

function BalanceAccountCard({ account, onEdit, onDelete }) {
  const meta = ACCOUNT_TYPE_META[account.account_type] || ACCOUNT_TYPE_META.other
  const Icon = meta.icon

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center', meta.bg)}>
            <Icon size={15} className={meta.color} />
          </div>
          <div>
            <p className="font-semibold text-white">{account.name}</p>
            <p className="text-xs text-gray-500">{account.institution || meta.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => onEdit(account)} className="p-1.5 rounded-lg text-gray-500 hover:text-violet-400 hover:bg-gray-800 transition-colors">
            <Pencil size={14} />
          </button>
          <button onClick={() => onDelete(account)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="bg-gray-800/60 rounded-xl p-4 text-center">
        <p className="text-xs text-gray-500 mb-1">Current Balance</p>
        <p className="text-3xl font-bold text-white">{fmt(account.balance)}</p>
      </div>

      {account.notes && (
        <p className="text-xs text-gray-500 italic px-1 mt-3">{account.notes}</p>
      )}
    </div>
  )
}

function AccountCard({ account, onEdit, onDelete }) {
  if (account.account_type === 'credit_card') {
    return <CreditCardAccountCard account={account} onEdit={onEdit} onDelete={onDelete} />
  }
  return <BalanceAccountCard account={account} onEdit={onEdit} onDelete={onDelete} />
}

// ─── Account form modal ───────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  account_type: 'checking',
  institution: '',
  balance: '',
  credit_limit: '',
  annual_interest_rate: '',
  monthly_payment: '',
  notes: '',
}

function AccountModal({ initial, onClose }) {
  const [form, setForm] = useState(() => {
    if (!initial) return EMPTY_FORM
    return {
      name: initial.name ?? '',
      account_type: initial.account_type ?? 'checking',
      institution: initial.institution ?? '',
      balance: initial.balance ?? '',
      credit_limit: initial.credit_limit ?? '',
      annual_interest_rate: initial.annual_interest_rate ?? '',
      monthly_payment: initial.monthly_payment ?? '',
      notes: initial.notes ?? '',
    }
  })
  const [errors, setErrors] = useState({})
  const qc = useQueryClient()
  const isEdit = !!initial?.id
  const isCC = form.account_type === 'credit_card'

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const saveMutation = useMutation({
    mutationFn: (data) =>
      isEdit ? api.patch(`/accounts/${initial.id}/`, data) : api.post('/accounts/', data),
    onSuccess: () => {
      qc.invalidateQueries(['accounts'])
      qc.invalidateQueries(['loans'])
      onClose()
    },
    onError: (err) => setErrors(err.response?.data || {}),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setErrors({})
    const payload = {
      name: form.name,
      account_type: form.account_type,
      institution: form.institution,
      notes: form.notes,
      balance: form.balance || 0,
    }
    if (isCC) {
      if (form.credit_limit)         payload.credit_limit = form.credit_limit
      if (form.annual_interest_rate) payload.annual_interest_rate = form.annual_interest_rate
      if (form.monthly_payment)      payload.monthly_payment = form.monthly_payment
    }
    saveMutation.mutate(payload)
  }

  const textField = (label, key, opts = {}) => (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        type={opts.type || 'text'}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        placeholder={opts.placeholder}
        required={opts.required}
        step={opts.step}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
      />
      {errors[key] && <p className="text-xs text-red-400 mt-1">{errors[key]}</p>}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-white mb-5">{isEdit ? 'Edit Account' : 'Add Account'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {textField('Account Name', 'name', { placeholder: 'e.g. Chase Sapphire', required: true })}

          <div>
            <label className="block text-xs text-gray-400 mb-1">Account Type</label>
            <select
              value={form.account_type}
              onChange={(e) => set('account_type', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit_card">Credit Card</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </div>

          {textField('Institution / Bank', 'institution', { placeholder: 'e.g. Chase, Wells Fargo' })}

          {isCC ? (
            <>
              {textField('Current Balance', 'balance', { type: 'number', step: '0.01', placeholder: '0.00' })}
              {textField('Credit Limit', 'credit_limit', { type: 'number', step: '0.01', placeholder: '0.00' })}
              {textField('APR (%)', 'annual_interest_rate', { type: 'number', step: '0.001', placeholder: 'e.g. 24.99' })}
              {textField('Minimum Monthly Payment', 'monthly_payment', { type: 'number', step: '0.01', placeholder: '0.00' })}
              <p className="text-xs text-gray-600 bg-gray-800/40 rounded-lg p-2.5">
                This card will also appear in the Loans section for debt tracking.
              </p>
            </>
          ) : (
            textField('Current Balance', 'balance', { type: 'number', step: '0.01', placeholder: '0.00' })
          )}

          <div>
            <label className="block text-xs text-gray-400 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 resize-none"
            />
          </div>

          {errors.non_field_errors && (
            <p className="text-xs text-red-400">{errors.non_field_errors}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-700 text-sm text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="flex-1 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm text-white font-medium transition-colors disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteModal({ account, onClose }) {
  const qc = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/accounts/${account.id}/`),
    onSuccess: () => {
      qc.invalidateQueries(['accounts'])
      qc.invalidateQueries(['loans'])
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-lg font-bold text-white mb-2">Delete Account?</h2>
        <p className="text-sm text-gray-400 mb-6">
          <span className="text-white font-medium">{account.name}</span> will be permanently deleted.
          {account.loan && ' The linked credit card entry in Loans will also be removed.'}
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-700 text-sm text-gray-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-sm text-white font-medium transition-colors disabled:opacity-50"
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Account group section ─────────────────────────────────────────────────────

function AccountSection({ title, icon: Icon, accounts, iconColor, onEdit, onDelete }) {
  if (!accounts.length) return null
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className={iconColor} />
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{title}</h2>
        <span className="text-xs text-gray-600 ml-1">{accounts.length}</span>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {accounts.map((a) => (
          <AccountCard key={a.id} account={a} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Accounts() {
  const [addModal, setAddModal] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data: accountsData, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts/').then((r) => r.data),
  })

  const accounts = accountsData?.results ?? accountsData ?? []

  const checking    = accounts.filter((a) => a.account_type === 'checking')
  const savings     = accounts.filter((a) => a.account_type === 'savings')
  const creditCards = accounts.filter((a) => a.account_type === 'credit_card')
  const cash        = accounts.filter((a) => a.account_type === 'cash')
  const other       = accounts.filter((a) => a.account_type === 'other')

  const totalAssets = [...checking, ...savings, ...cash, ...other].reduce(
    (s, a) => s + Number(a.balance), 0
  )
  const totalCreditUsed = creditCards.reduce((s, a) => {
    const bal = a.loan ? Number(a.loan.current_balance) : Number(a.balance)
    return s + bal
  }, 0)
  const totalCreditLimit = creditCards.reduce((s, a) => {
    const lim = a.loan ? Number(a.loan.credit_limit) : Number(a.credit_limit)
    return s + (lim || 0)
  }, 0)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Accounts</h1>
          <p className="text-sm text-gray-500 mt-1">All your financial accounts in one place</p>
        </div>
        <button
          onClick={() => setAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Plus size={16} /> Add Account
        </button>
      </div>

      {/* Summary strip */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <p className="text-xs text-gray-500 mb-1">Total Assets</p>
            <p className="text-2xl font-bold text-emerald-400">{fmt(totalAssets)}</p>
            <p className="text-xs text-gray-600 mt-1">
              {checking.length + savings.length + cash.length + other.length} accounts
            </p>
          </div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <p className="text-xs text-gray-500 mb-1">Credit Used</p>
            <p className="text-2xl font-bold text-white">{fmt(totalCreditUsed)}</p>
            <p className="text-xs text-gray-600 mt-1">of {fmt(totalCreditLimit)} total limit</p>
          </div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <p className="text-xs text-gray-500 mb-1">Available Credit</p>
            <p className="text-2xl font-bold text-violet-400">{fmt(totalCreditLimit - totalCreditUsed)}</p>
            <p className="text-xs text-gray-600 mt-1">
              {creditCards.length} credit {creditCards.length === 1 ? 'card' : 'cards'}
            </p>
          </div>
        </div>
      )}

      {/* Account sections */}
      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading accounts…</p>
      ) : accounts.length === 0 ? (
        <div className="text-center py-20 text-gray-600">
          <Landmark size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium text-gray-500">No accounts yet</p>
          <p className="text-sm mt-1">Add a checking account, savings, or credit card to get started.</p>
          <button
            onClick={() => setAddModal(true)}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-colors mx-auto"
          >
            <Plus size={16} /> Add Your First Account
          </button>
        </div>
      ) : (
        <>
          <AccountSection title="Checking"     icon={Landmark}  iconColor="text-blue-400"    accounts={checking}    onEdit={setEditTarget} onDelete={setDeleteTarget} />
          <AccountSection title="Savings"      icon={PiggyBank} iconColor="text-emerald-400" accounts={savings}     onEdit={setEditTarget} onDelete={setDeleteTarget} />
          <AccountSection title="Credit Cards" icon={CreditCard} iconColor="text-violet-400" accounts={creditCards} onEdit={setEditTarget} onDelete={setDeleteTarget} />
          <AccountSection title="Cash"         icon={Wallet}    iconColor="text-amber-400"   accounts={cash}        onEdit={setEditTarget} onDelete={setDeleteTarget} />
          <AccountSection title="Other"        icon={Landmark}  iconColor="text-gray-400"    accounts={other}       onEdit={setEditTarget} onDelete={setDeleteTarget} />
        </>
      )}

      {/* Modals */}
      {addModal    && <AccountModal onClose={() => setAddModal(false)} />}
      {editTarget  && <AccountModal initial={editTarget} onClose={() => setEditTarget(null)} />}
      {deleteTarget && <DeleteModal account={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </div>
  )
}
