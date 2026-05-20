import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ArrowLeftRight, CreditCard,
  TrendingUp, Bot, LogOut, Zap, Receipt, Landmark,
} from 'lucide-react'
import useAuthStore from '../store/authStore'
import clsx from 'clsx'

const nav = [
  { to: '/',            label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/accounts',    label: 'Accounts',    icon: Landmark },
  { to: '/transactions',label: 'Transactions', icon: ArrowLeftRight },
  { to: '/loans',       label: 'Loans',        icon: CreditCard },
  { to: '/investments', label: 'Investments',  icon: TrendingUp },
  { to: '/ai',          label: 'AI Agent',     icon: Bot },
  { to: '/subscriptions', label: 'Subscriptions', icon: Receipt },
]

export default function Layout({ children }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Zap className="text-violet-400" size={22} />
            <span className="text-xl font-bold text-white tracking-tight">FinPulse</span>
          </div>
          {user && (
            <p className="text-xs text-gray-500 mt-1 truncate">
              {user.first_name ? `${user.first_name} ${user.last_name}` : user.username}
            </p>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-4 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-violet-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User / logout */}
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-100 transition-colors"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
