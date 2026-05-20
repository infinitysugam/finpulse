import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Zap } from 'lucide-react'
import useAuthStore from '../store/authStore'

export default function Register() {
  const { register, handleSubmit, watch, formState: { errors } } = useForm()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const registerUser = useAuthStore((s) => s.register)
  const navigate = useNavigate()

  const onSubmit = async (data) => {
    setLoading(true)
    setError('')
    try {
      await registerUser(data)
      navigate('/')
    } catch (e) {
      const detail = e.response?.data
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Zap className="text-violet-400" size={28} />
          <span className="text-3xl font-bold text-white tracking-tight">FinPulse</span>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8">
          <h1 className="text-xl font-semibold text-white mb-6">Create your account</h1>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">First name</label>
                <input
                  {...register('first_name')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Last name</label>
                <input
                  {...register('last_name')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Username</label>
              <input
                {...register('username', { required: 'Required' })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500 transition-colors"
              />
              {errors.username && <p className="text-red-400 text-xs mt-1">{errors.username.message}</p>}
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Email</label>
              <input
                type="email"
                {...register('email', { required: 'Required' })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500 transition-colors"
              />
              {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Password</label>
              <input
                type="password"
                {...register('password', { required: 'Required', minLength: { value: 8, message: 'Min 8 characters' } })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500 transition-colors"
              />
              {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Confirm password</label>
              <input
                type="password"
                {...register('password2', {
                  required: 'Required',
                  validate: (v) => v === watch('password') || 'Passwords do not match',
                })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500 transition-colors"
              />
              {errors.password2 && <p className="text-red-400 text-xs mt-1">{errors.password2.message}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors mt-2"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-violet-400 hover:text-violet-300">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
