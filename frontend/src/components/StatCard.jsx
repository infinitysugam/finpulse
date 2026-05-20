import clsx from 'clsx'

export default function StatCard({ label, value, sub, icon: Icon, color = 'violet', trend }) {
  const colors = {
    violet: 'bg-violet-500/10 text-violet-400',
    green:  'bg-emerald-500/10 text-emerald-400',
    red:    'bg-red-500/10 text-red-400',
    blue:   'bg-blue-500/10 text-blue-400',
    amber:  'bg-amber-500/10 text-amber-400',
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
          {trend !== undefined && (
            <p className={clsx('text-xs font-medium mt-1', trend >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
            </p>
          )}
        </div>
        {Icon && (
          <div className={clsx('p-2.5 rounded-lg', colors[color])}>
            <Icon size={20} />
          </div>
        )}
      </div>
    </div>
  )
}
