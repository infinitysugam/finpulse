import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  Plus, Upload, ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, TrendingUp,
  X, Pencil, Trash2, Landmark, ChevronLeft, ChevronRight, Search,
} from 'lucide-react'
import api from '../lib/api'
import clsx from 'clsx'

const fmt = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })

const TYPE_META = {
  income:     { icon: ArrowUpCircle,  color: 'text-emerald-400', bg: 'bg-emerald-500/10', sign: '+' },
  expense:    { icon: ArrowDownCircle,color: 'text-red-400',     bg: 'bg-red-500/10',     sign: '-' },
  transfer:   { icon: ArrowLeftRight, color: 'text-blue-400',    bg: 'bg-blue-500/10',    sign: '' },
  investment: { icon: TrendingUp,     color: 'text-violet-400',  bg: 'bg-violet-500/10',  sign: '→' },
}

const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500'

// ─── Transaction row ──────────────────────────────────────────────────────────

function TransactionRow({ tx, onEdit, onDelete }) {
  const meta = TYPE_META[tx.transaction_type] ?? TYPE_META.expense
  const Icon = meta.icon
  const dot = tx.category_color || '#6b7280'

  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-800 last:border-0 group">
      <div className={clsx('p-2 rounded-lg flex-shrink-0', meta.bg, meta.color)}>
        <Icon size={16} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{tx.title}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-gray-500">{tx.date}</span>
          {tx.category_name && (
            <>
              <span className="text-gray-700">·</span>
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />
                {tx.category_name}
              </span>
            </>
          )}
          {tx.account_info && (
            <>
              <span className="text-gray-700">·</span>
              <span className="flex items-center gap-1 text-xs text-blue-400">
                <Landmark size={10} />{tx.account_info.name}
              </span>
            </>
          )}
          {tx.to_account_info && (
            <>
              <span className="text-gray-700">→</span>
              <span className="flex items-center gap-1 text-xs text-blue-300">
                <Landmark size={10} />{tx.to_account_info.name}
              </span>
            </>
          )}
          {tx.portfolio_info && tx.transaction_type === 'transfer' && (
            <>
              <span className="text-gray-700">→</span>
              <span className="text-xs text-violet-400">📁 {tx.portfolio_info.name} (cash)</span>
            </>
          )}
          {tx.loan_info && (
            <>
              <span className="text-gray-700">·</span>
              <span className="text-xs text-amber-400">↳ {tx.loan_info.name}</span>
            </>
          )}
          {tx.merchant && (
            <>
              <span className="text-gray-700">·</span>
              <span className="text-xs text-gray-600">{tx.merchant}</span>
            </>
          )}
        </div>
      </div>

      <span className={clsx('text-sm font-semibold flex-shrink-0', meta.color)}>
        {meta.sign}{fmt(tx.amount)}
      </span>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={() => onEdit(tx)} className="p-1.5 rounded-lg text-gray-500 hover:text-violet-400 hover:bg-gray-800 transition-colors">
          <Pencil size={13} />
        </button>
        <button onClick={() => onDelete(tx)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── Transaction form modal ───────────────────────────────────────────────────

function TransactionModal({ existing, onClose }) {
  const isEdit = !!existing
  const qc = useQueryClient()

  // For transfer type: 'account' (normal) or 'portfolio' (to portfolio cash)
  const [transferDest, setTransferDest] = useState(
    existing?.transaction_type === 'transfer' && existing?.portfolio_info ? 'portfolio' : 'account'
  )

  const { register, handleSubmit, watch, reset } = useForm({
    defaultValues: existing
      ? {
          title: existing.title,
          amount: existing.amount,
          date: existing.date,
          transaction_type: existing.transaction_type,
          category: existing.category ?? '',
          account_id: existing.account_info?.id ?? '',
          to_account_id: existing.to_account_info?.id ?? '',
          loan_id: existing.loan_info?.id ?? '',
          portfolio_id: existing.portfolio_info?.id ?? '',
          merchant: existing.merchant ?? '',
          notes: existing.notes ?? '',
        }
      : { transaction_type: 'expense', category: '', account_id: '', to_account_id: '', loan_id: '', portfolio_id: '' },
  })

  const txType = watch('transaction_type')

  const { data: catsData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/transactions/categories/').then((r) => r.data.results ?? r.data),
  })
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts/').then((r) => r.data),
  })
  const { data: loansData } = useQuery({
    queryKey: ['loans'],
    queryFn: () => api.get('/loans/').then((r) => r.data),
  })
  const { data: portfoliosData } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => api.get('/investments/portfolios/').then((r) => r.data.results ?? r.data),
    enabled: txType === 'investment' || txType === 'transfer',
  })

  const cats = (catsData ?? []).filter((c) =>
    txType === 'transfer' ? c.category_type === 'transfer' : c.category_type === txType
  )
  const accounts = accountsData?.results ?? accountsData ?? []
  const friendLoans = (loansData?.results ?? loansData ?? []).filter(
    (l) => l.loan_type === 'friend' && l.status === 'active'
  )
  const lentToFriendLoans = (loansData?.results ?? loansData ?? []).filter(
    (l) => l.loan_type === 'lent_to_friend' && l.status === 'active'
  )

  const { mutate, isPending, error } = useMutation({
    mutationFn: (data) => {
      const payload = { ...data }
      if (!payload.category) delete payload.category
      if (!payload.merchant) delete payload.merchant
      if (!payload.notes) delete payload.notes
      if (payload.account_id) payload.account_id = Number(payload.account_id)
      else delete payload.account_id
      if (payload.to_account_id && txType === 'transfer' && transferDest === 'account') payload.to_account_id = Number(payload.to_account_id)
      else delete payload.to_account_id
      // Send loan_id for expense (repaying borrowed) or income (received from lent)
      if (payload.loan_id && (txType === 'expense' || txType === 'income')) payload.loan_id = Number(payload.loan_id)
      else delete payload.loan_id
      // portfolio_id for investment OR transfer-to-portfolio
      if (payload.portfolio_id && (txType === 'investment' || (txType === 'transfer' && transferDest === 'portfolio'))) payload.portfolio_id = Number(payload.portfolio_id)
      else delete payload.portfolio_id
      return isEdit
        ? api.patch(`/transactions/${existing.id}/`, payload)
        : api.post('/transactions/', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['loans'] })
      qc.invalidateQueries({ queryKey: ['portfolios'] })
      reset()
      onClose()
    },
  })

  const apiError = error?.response?.data

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">{isEdit ? 'Edit Transaction' : 'Add Transaction'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
        </div>

        {apiError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
            {typeof apiError === 'string' ? apiError : JSON.stringify(apiError)}
          </div>
        )}

        <form onSubmit={handleSubmit((d) => mutate(d))} className="space-y-4">
          <input
            {...register('title', { required: true })}
            placeholder="Title (e.g. Grocery run)"
            className={inputCls}
          />

          <div className="grid grid-cols-2 gap-3">
            <input
              type="number" step="0.01"
              {...register('amount', { required: true })}
              placeholder="Amount"
              className={inputCls}
            />
            <input type="date" {...register('date', { required: true })} className={inputCls} />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {['expense', 'income', 'transfer', 'investment'].map((t) => (
              <label
                key={t}
                className={clsx(
                  'flex items-center justify-center gap-1 py-2 rounded-lg border text-xs font-medium cursor-pointer transition-colors capitalize',
                  watch('transaction_type') === t
                    ? t === 'income'     ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                    : t === 'expense'    ? 'border-red-500 bg-red-500/15 text-red-400'
                    : t === 'investment' ? 'border-violet-500 bg-violet-500/15 text-violet-400'
                    :                     'border-blue-500 bg-blue-500/15 text-blue-400'
                    : 'border-gray-700 text-gray-500 hover:border-gray-600'
                )}
              >
                <input type="radio" {...register('transaction_type')} value={t} className="hidden" />
                {t === 'investment' ? 'invest' : t}
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Category</label>
              <select {...register('category')} className={inputCls}>
                <option value="">No category</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                {txType === 'transfer' ? 'From Account' : 'Account'}
              </label>
              <select {...register('account_id')} className={inputCls}>
                <option value="">No account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {txType === 'transfer' && (
            <div className="space-y-3">
              {/* Destination type toggle */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Transfer To</label>
                <div className="flex gap-2">
                  {[['account', 'Bank Account'], ['portfolio', 'Portfolio Cash']].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setTransferDest(val)}
                      className={clsx(
                        'flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                        transferDest === val
                          ? 'bg-blue-500/15 border-blue-500 text-blue-400'
                          : 'border-gray-700 text-gray-500 hover:border-gray-600'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {transferDest === 'account' ? (
                <div>
                  <label className="text-xs text-gray-400 block mb-1">To Account</label>
                  <select {...register('to_account_id')} className={inputCls}>
                    <option value="">Select destination account</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}{a.account_type === 'credit_card' ? ' (Credit Card)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-600 mt-1">
                    Paying a credit card? Select it here — both balances will update automatically.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="text-xs text-gray-400 block mb-1">To Portfolio</label>
                  <select {...register('portfolio_id')} className={inputCls}>
                    <option value="">Select portfolio</option>
                    {(portfoliosData ?? []).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-600 mt-1">
                    Amount will be added as cash inside the portfolio.
                  </p>
                </div>
              )}
            </div>
          )}

          {txType === 'expense' && friendLoans.length > 0 && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Repaying a friend loan? (optional)</label>
              <select {...register('loan_id')} className={inputCls}>
                <option value="">— No loan repayment —</option>
                {friendLoans.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · ${Number(l.current_balance).toFixed(2)} remaining
                  </option>
                ))}
              </select>
            </div>
          )}

          {txType === 'income' && lentToFriendLoans.length > 0 && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Got from friend? (optional)</label>
              <select {...register('loan_id')} className={inputCls}>
                <option value="">— Not a friend repayment —</option>
                {lentToFriendLoans.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · ${Number(l.current_balance).toFixed(2)} outstanding
                  </option>
                ))}
              </select>
            </div>
          )}

          {txType === 'investment' && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Destination Portfolio</label>
              <select {...register('portfolio_id', { required: txType === 'investment' })} className={inputCls}>
                <option value="">— Select portfolio —</option>
                {(portfoliosData ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-600 mt-1">
                Amount will be added as cash to the portfolio. You can later convert it to holdings inside the portfolio.
              </p>
            </div>
          )}

          <input
            {...register('merchant')}
            placeholder="Merchant (optional)"
            className={inputCls}
          />
          <textarea
            {...register('notes')}
            placeholder="Notes (optional)"
            rows={2}
            className={clsx(inputCls, 'resize-none')}
          />

          <button
            type="submit" disabled={isPending}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Transaction'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteModal({ tx, onClose }) {
  const qc = useQueryClient()
  const { mutate, isPending } = useMutation({
    mutationFn: () => api.delete(`/transactions/${tx.id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['loans'] })
      onClose()
    },
  })
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-white mb-2">Delete transaction?</h2>
        <p className="text-sm text-gray-400 mb-6">
          "<span className="text-white">{tx.title}</span>" will be permanently removed.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors">Cancel</button>
          <button onClick={() => mutate()} disabled={isPending} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

export default function Transactions() {
  const [modal, setModal]           = useState(null)
  const [typeFilter, setTypeFilter]   = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch]           = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage]               = useState(1)

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts/').then((r) => r.data),
  })
  const accounts = accountsData?.results ?? accountsData ?? []

  const { data: catsAllData } = useQuery({
    queryKey: ['categories-all'],
    queryFn: () => api.get('/transactions/categories/').then((r) => r.data.results ?? r.data),
  })
  const allCategories = catsAllData ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', typeFilter, accountFilter, categoryFilter, search, page],
    queryFn: () =>
      api.get('/transactions/', {
        params: {
          ...(typeFilter      ? { transaction_type: typeFilter } : {}),
          ...(accountFilter   ? { account: accountFilter }       : {}),
          ...(categoryFilter  ? { category: categoryFilter }     : {}),
          ...(search          ? { search }                       : {}),
          page,
        },
      }).then((r) => r.data),
    keepPreviousData: true,
  })

  // Debounce search input so we don't fire on every keystroke
  const handleSearchChange = (e) => {
    setSearchInput(e.target.value)
    clearTimeout(handleSearchChange._timer)
    handleSearchChange._timer = setTimeout(() => {
      setSearch(e.target.value)
      setPage(1)
    }, 350)
  }

  const transactions = data?.results ?? []
  const totalPages = data?.count ? Math.ceil(data.count / PAGE_SIZE) : 1

  const resetPage = () => setPage(1)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Transactions</h1>
          <p className="text-gray-500 text-sm mt-1">Track every dollar in and out</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors">
            <Upload size={16} /> Import CSV
          </button>
          <button
            onClick={() => setModal({ type: 'add' })}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3 mb-6">
        {/* Search bar */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={handleSearchChange}
            placeholder="Search by title, merchant or notes…"
            className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(''); setSearch(''); setPage(1) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Type + category + account row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Type pills */}
          <div className="flex gap-1.5 flex-wrap">
            {['', 'income', 'expense', 'transfer', 'investment'].map((t) => (
              <button
                key={t}
                onClick={() => { setTypeFilter(t); resetPage() }}
                className={clsx(
                  'px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors',
                  typeFilter === t ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                )}
              >
                {t === '' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-gray-700 hidden sm:block" />

          {/* Category filter */}
          {allCategories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); resetPage() }}
              className={clsx(
                'bg-gray-800 border rounded-full px-4 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-violet-500',
                categoryFilter ? 'border-violet-500 text-white' : 'border-gray-700'
              )}
            >
              <option value="">All Categories</option>
              {allCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon ? `${c.icon} ` : ''}{c.name}
                </option>
              ))}
            </select>
          )}

          {/* Account filter */}
          {accounts.length > 0 && (
            <select
              value={accountFilter}
              onChange={(e) => { setAccountFilter(e.target.value); resetPage() }}
              className={clsx(
                'bg-gray-800 border rounded-full px-4 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-violet-500',
                accountFilter ? 'border-violet-500 text-white' : 'border-gray-700'
              )}
            >
              <option value="">All Accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}

          {/* Clear all filters */}
          {(typeFilter || accountFilter || categoryFilter || search) && (
            <button
              onClick={() => {
                setTypeFilter(''); setAccountFilter('')
                setCategoryFilter(''); setSearch(''); setSearchInput(''); setPage(1)
              }}
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors ml-auto"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 px-6 py-2">
        {isLoading ? (
          <p className="text-gray-500 text-sm text-center py-8">Loading…</p>
        ) : transactions.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No transactions found.</p>
        ) : (
          transactions.map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              onEdit={(t) => setModal({ type: 'edit', tx: t })}
              onDelete={(t) => setModal({ type: 'delete', tx: t })}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {data?.count > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>{transactions.length} of {data.count} transactions</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-gray-400">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {modal?.type === 'add'    && <TransactionModal onClose={() => setModal(null)} />}
      {modal?.type === 'edit'   && <TransactionModal existing={modal.tx} onClose={() => setModal(null)} />}
      {modal?.type === 'delete' && <DeleteModal tx={modal.tx} onClose={() => setModal(null)} />}
    </div>
  )
}
