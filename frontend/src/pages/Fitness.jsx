import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, Pencil, CheckCircle2, Circle, Droplets, Flame, Moon, Scale, Dumbbell, ChevronDown, ChevronUp } from 'lucide-react'
import api from '../lib/api'
import clsx from 'clsx'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MUSCLE_GROUPS = ['chest','back','shoulders','biceps','triceps','legs','core','cardio','full_body','other']

const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500'

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = ['Today', 'Plan', 'Progress', 'History']

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, unit, goal, color = 'text-violet-400' }) {
  const pct = goal && value != null ? Math.min(100, Math.round((value / goal) * 100)) : null
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className={color} />
        <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-end gap-1">
        <span className="text-2xl font-bold text-white">{value ?? '—'}</span>
        {unit && <span className="text-sm text-gray-500 mb-0.5">{unit}</span>}
      </div>
      {goal != null && (
        <div className="mt-2">
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all', pct >= 100 ? 'bg-emerald-500' : 'bg-violet-500')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-gray-600 mt-1">Goal: {goal} {unit} · {pct}%</p>
        </div>
      )}
    </div>
  )
}

// ─── Today Tab ───────────────────────────────────────────────────────────────

function TodayTab() {
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data: todayWorkout } = useQuery({
    queryKey: ['fitness-today-workout'],
    queryFn: () => api.get('/fitness/workout-days/today/').then(r => r.data),
  })
  const { data: todayLog, refetch: refetchLog } = useQuery({
    queryKey: ['fitness-today-log'],
    queryFn: () => api.get('/fitness/logs/today/').then(r => r.data),
  })
  const { data: goal } = useQuery({
    queryKey: ['fitness-goals'],
    queryFn: () => api.get('/fitness/goals/').then(r => r.data),
  })

  const [form, setForm] = useState({ water_liters: '', calories: '', body_weight_kg: '', sleep_hours: '' })
  const [saving, setSaving] = useState(false)
  const [checkedExercises, setCheckedExercises] = useState(new Set())

  const saveLog = async (extra = {}) => {
    setSaving(true)
    try {
      const payload = {}
      if (form.water_liters)     payload.water_liters     = parseFloat(form.water_liters)
      if (form.calories)         payload.calories         = parseInt(form.calories)
      if (form.body_weight_kg)   payload.body_weight_kg   = parseFloat(form.body_weight_kg)
      if (form.sleep_hours)      payload.sleep_hours      = parseFloat(form.sleep_hours)
      Object.assign(payload, extra)
      await api.post('/fitness/logs/today/', payload)
      qc.invalidateQueries({ queryKey: ['fitness-today-log'] })
    } finally {
      setSaving(false)
    }
  }

  const toggleExercise = async (exId) => {
    const next = new Set(checkedExercises)
    next.has(exId) ? next.delete(exId) : next.add(exId)
    setCheckedExercises(next)
    const log = await api.post('/fitness/logs/today/', { workout_completed: next.size > 0 }).then(r => r.data)
    if (next.has(exId) && !checkedExercises.has(exId)) {
      const ex = todayWorkout?.exercises?.find(e => e.id === exId)
      if (ex) {
        await api.post(`/fitness/logs/${log.id}/log_exercise/`, {
          planned_exercise: exId, name: ex.name,
          sets_completed: ex.sets, reps_completed: ex.reps,
        })
      }
    }
    qc.invalidateQueries({ queryKey: ['fitness-today-log'] })
  }

  const log = todayLog
  const water = log?.water_liters ? parseFloat(log.water_liters) : null
  const calories = log?.calories ?? null
  const weight = log?.body_weight_kg ? parseFloat(log.body_weight_kg) : null
  const sleep = log?.sleep_hours ? parseFloat(log.sleep_hours) : null

  return (
    <div className="space-y-6">
      {/* Stat summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Droplets} label="Water" value={water} unit="L" goal={goal ? parseFloat(goal.daily_water_liters) : null} color="text-blue-400" />
        <StatCard icon={Flame} label="Calories" value={calories} unit="kcal" goal={goal?.daily_calories} color="text-orange-400" />
        <StatCard icon={Scale} label="Weight" value={weight} unit="kg" color="text-violet-400" />
        <StatCard icon={Moon} label="Sleep" value={sleep} unit="h" goal={8} color="text-indigo-400" />
      </div>

      {/* Today's workout */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Dumbbell size={16} className="text-violet-400" />
          <h2 className="text-sm font-semibold text-white">
            {todayWorkout ? todayWorkout.name : "Today's Workout"}
          </h2>
          {todayWorkout?.is_rest_day && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">Rest Day</span>
          )}
        </div>

        {!todayWorkout ? (
          <p className="text-sm text-gray-500 text-center py-4">No workout planned for today. Set up your plan in the <strong>Plan</strong> tab.</p>
        ) : todayWorkout.is_rest_day ? (
          <p className="text-sm text-gray-500 text-center py-4">Rest & recover! Come back tomorrow 💪</p>
        ) : todayWorkout.exercises?.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No exercises added for this day yet.</p>
        ) : (
          <div className="space-y-2">
            {todayWorkout.exercises.map((ex) => {
              const done = checkedExercises.has(ex.id) ||
                log?.exercise_logs?.some(l => l.planned_exercise === ex.id && l.completed)
              return (
                <button
                  key={ex.id}
                  onClick={() => toggleExercise(ex.id)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all',
                    done
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-gray-800 bg-gray-800/40 hover:border-gray-700'
                  )}
                >
                  {done
                    ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    : <Circle size={16} className="text-gray-600 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className={clsx('text-sm font-medium', done ? 'text-emerald-300 line-through' : 'text-white')}>
                      {ex.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {ex.sets} sets × {ex.reps} reps
                      {ex.target_weight ? ` @ ${ex.target_weight}kg` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-gray-600 capitalize shrink-0">{ex.muscle_group}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Daily log form */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Log Today's Stats</h2>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { key: 'water_liters',   label: '💧 Water (L)',      placeholder: 'e.g. 2.5' },
            { key: 'calories',       label: '🔥 Calories (kcal)', placeholder: 'e.g. 2200' },
            { key: 'body_weight_kg', label: '⚖️ Weight (kg)',     placeholder: 'e.g. 76.5' },
            { key: 'sleep_hours',    label: '😴 Sleep (hours)',   placeholder: 'e.g. 7.5' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="text-xs text-gray-400 block mb-1">{label}</label>
              <input
                type="number" step="0.1"
                placeholder={placeholder}
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className={inputCls}
              />
            </div>
          ))}
        </div>
        <button
          onClick={() => saveLog()}
          disabled={saving}
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
        >
          {saving ? 'Saving…' : 'Save Stats'}
        </button>
      </div>
    </div>
  )
}

// ─── Plan Tab ─────────────────────────────────────────────────────────────────

function ExerciseForm({ dayId, onSaved }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', muscle_group: 'other', sets: 3, reps: '10', target_weight: '' })
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...form }
      if (!payload.target_weight) delete payload.target_weight
      await api.post(`/fitness/workout-days/${dayId}/add_exercise/`, payload)
      qc.invalidateQueries({ queryKey: ['fitness-plan'] })
      setForm({ name: '', muscle_group: 'other', sets: 3, reps: '10', target_weight: '' })
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="mt-3 space-y-2 bg-gray-800/40 rounded-xl p-3 border border-gray-700">
      <input
        required placeholder="Exercise name"
        value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        className={inputCls}
      />
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Sets</label>
          <input type="number" min="1" value={form.sets}
            onChange={e => setForm(f => ({ ...f, sets: e.target.value }))}
            className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Reps</label>
          <input placeholder="10 or 8-12" value={form.reps}
            onChange={e => setForm(f => ({ ...f, reps: e.target.value }))}
            className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Weight (kg)</label>
          <input type="number" step="0.5" placeholder="optional"
            value={form.target_weight}
            onChange={e => setForm(f => ({ ...f, target_weight: e.target.value }))}
            className={inputCls} />
        </div>
      </div>
      <div className="flex gap-2">
        <select value={form.muscle_group}
          onChange={e => setForm(f => ({ ...f, muscle_group: e.target.value }))}
          className={clsx(inputCls, 'flex-1 capitalize')}>
          {MUSCLE_GROUPS.map(g => <option key={g} value={g} className="capitalize">{g}</option>)}
        </select>
        <button type="submit" disabled={saving}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm rounded-lg transition-colors">
          {saving ? '…' : 'Add'}
        </button>
      </div>
    </form>
  )
}

function WorkoutDayCard({ day }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const deleteExercise = async (exId) => {
    await api.delete(`/fitness/exercises/${exId}/`)
    qc.invalidateQueries({ queryKey: ['fitness-plan'] })
  }

  const deleteDay = async () => {
    if (!window.confirm(`Delete "${day.name}"?`)) return
    await api.delete(`/fitness/workout-days/${day.id}/`)
    qc.invalidateQueries({ queryKey: ['fitness-plan'] })
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-500 w-10 text-left">{day.day_name.slice(0, 3).toUpperCase()}</span>
          <span className="text-sm font-medium text-white">{day.name}</span>
          {day.is_rest_day && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">Rest</span>}
          {!day.is_rest_day && (
            <span className="text-xs text-gray-600">{day.exercises.length} exercises</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={(e) => { e.stopPropagation(); deleteDay() }}
            className="p-1 text-gray-600 hover:text-red-400 transition-colors">
            <Trash2 size={13} />
          </button>
          {open ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-800 px-4 py-3">
          {!day.is_rest_day && (
            <>
              {day.exercises.length === 0 ? (
                <p className="text-xs text-gray-600 text-center py-2">No exercises yet.</p>
              ) : (
                <div className="space-y-1.5 mb-3">
                  {day.exercises.map((ex, i) => (
                    <div key={ex.id} className="flex items-center gap-2 text-sm text-gray-300 group">
                      <span className="text-gray-600 text-xs w-4">{i + 1}.</span>
                      <span className="flex-1">{ex.name}</span>
                      <span className="text-xs text-gray-500">{ex.sets}×{ex.reps}</span>
                      {ex.target_weight && <span className="text-xs text-gray-600">{ex.target_weight}kg</span>}
                      <button onClick={() => deleteExercise(ex.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {showForm
                ? <ExerciseForm dayId={day.id} onSaved={() => setShowForm(false)} />
                : (
                  <button onClick={() => setShowForm(true)}
                    className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors">
                    <Plus size={13} /> Add exercise
                  </button>
                )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function PlanTab() {
  const qc = useQueryClient()
  const [showAddDay, setShowAddDay] = useState(false)
  const [newDay, setNewDay] = useState({ day_of_week: 0, name: '', is_rest_day: false })
  const [saving, setSaving] = useState(false)

  const { data: plan = [] } = useQuery({
    queryKey: ['fitness-plan'],
    queryFn: () => api.get('/fitness/workout-days/').then(r => r.data?.results ?? r.data ?? []),
  })

  const usedDays = new Set(plan.map(d => d.day_of_week))
  const availableDays = DAY_NAMES.map((name, i) => ({ i, name })).filter(d => !usedDays.has(d.i))

  const addDay = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/fitness/workout-days/', newDay)
      qc.invalidateQueries({ queryKey: ['fitness-plan'] })
      setShowAddDay(false)
      setNewDay({ day_of_week: availableDays[0]?.i ?? 0, name: '', is_rest_day: false })
    } finally {
      setSaving(false)
    }
  }

  // Sort by day_of_week
  const sorted = [...plan].sort((a, b) => a.day_of_week - b.day_of_week)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-gray-400">Plan your weekly workout split. Click a day to add exercises.</p>
        {availableDays.length > 0 && (
          <button
            onClick={() => setShowAddDay(s => !s)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
          >
            <Plus size={13} /> Add Day
          </button>
        )}
      </div>

      {showAddDay && (
        <form onSubmit={addDay} className="bg-gray-900 rounded-xl border border-violet-500/30 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Day</label>
              <select value={newDay.day_of_week}
                onChange={e => setNewDay(d => ({ ...d, day_of_week: parseInt(e.target.value) }))}
                className={inputCls}>
                {availableDays.map(d => <option key={d.i} value={d.i}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Name</label>
              <input required placeholder="e.g. Push Day"
                value={newDay.name}
                onChange={e => setNewDay(d => ({ ...d, name: e.target.value }))}
                className={inputCls} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" checked={newDay.is_rest_day}
              onChange={e => setNewDay(d => ({ ...d, is_rest_day: e.target.checked }))}
              className="accent-violet-500" />
            Rest day
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm py-2 rounded-lg transition-colors">
              {saving ? 'Saving…' : 'Save Day'}
            </button>
            <button type="button" onClick={() => setShowAddDay(false)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {sorted.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-sm">No workout days set up yet.</p>
          <p className="text-gray-600 text-xs mt-1">Click "Add Day" to build your split.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(day => <WorkoutDayCard key={day.id} day={day} />)}
        </div>
      )}
    </div>
  )
}

// ─── Progress Tab ─────────────────────────────────────────────────────────────

function ProgressTab() {
  const { data: logs = [] } = useQuery({
    queryKey: ['fitness-progress'],
    queryFn: () => api.get('/fitness/logs/progress/').then(r => r.data),
  })
  const { data: goal } = useQuery({
    queryKey: ['fitness-goals'],
    queryFn: () => api.get('/fitness/goals/').then(r => r.data),
  })
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [goalForm, setGoalForm] = useState(null)

  const saveGoals = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/fitness/goals/', goalForm)
      qc.invalidateQueries({ queryKey: ['fitness-goals'] })
      setGoalForm(null)
    } finally {
      setSaving(false)
    }
  }

  const recent = logs.slice(-30)
  const weightData = logs.filter(l => l.body_weight_kg).map(l => ({ date: l.date.slice(5), weight: l.body_weight_kg }))
  const streakData = recent.map(l => ({ date: l.date.slice(5), workout: l.workout_completed ? 1 : 0 }))
  const waterCalData = recent.map(l => ({
    date: l.date.slice(5),
    water: l.water_liters ?? 0,
    calories: l.calories ?? 0,
  }))

  if (!goal) return <p className="text-sm text-gray-500 text-center py-12">Loading…</p>

  return (
    <div className="space-y-6">
      {/* Goals editor */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Daily Goals</h2>
          {!goalForm ? (
            <button onClick={() => setGoalForm({ daily_water_liters: goal.daily_water_liters, daily_calories: goal.daily_calories, target_weight_kg: goal.target_weight_kg ?? '' })}
              className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300">
              <Pencil size={12} /> Edit
            </button>
          ) : null}
        </div>
        {goalForm ? (
          <form onSubmit={saveGoals} className="grid grid-cols-3 gap-3">
            {[
              { key: 'daily_water_liters', label: '💧 Water (L)', step: '0.1' },
              { key: 'daily_calories',     label: '🔥 Calories',  step: '50' },
              { key: 'target_weight_kg',   label: '⚖️ Target kg',  step: '0.1' },
            ].map(({ key, label, step }) => (
              <div key={key}>
                <label className="text-xs text-gray-400 block mb-1">{label}</label>
                <input type="number" step={step} value={goalForm[key]}
                  onChange={e => setGoalForm(f => ({ ...f, [key]: e.target.value }))}
                  className={inputCls} />
              </div>
            ))}
            <div className="col-span-3 flex gap-2">
              <button type="submit" disabled={saving}
                className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm py-2 rounded-lg">
                {saving ? 'Saving…' : 'Save Goals'}
              </button>
              <button type="button" onClick={() => setGoalForm(null)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { label: '💧 Water', value: `${goal.daily_water_liters}L` },
              { label: '🔥 Calories', value: `${goal.daily_calories} kcal` },
              { label: '⚖️ Target', value: goal.target_weight_kg ? `${goal.target_weight_kg}kg` : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-800/60 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-sm font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-sm">No data yet. Start logging with /checkin on Telegram or the Today tab.</p>
        </div>
      ) : (
        <>
          {/* Weight trend */}
          {weightData.length > 1 && (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Weight Trend (kg)</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={weightData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} labelStyle={{ color: '#9ca3af', fontSize: 11 }} />
                  <Line type="monotone" dataKey="weight" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Workout streak */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Workout Streak (last 30 days)</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={streakData}>
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 9 }} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                <Bar dataKey="workout" fill="#10b981" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Water & calories */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Water & Calories</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={waterCalData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
                <Line yAxisId="left" type="monotone" dataKey="water" stroke="#3b82f6" strokeWidth={2} dot={false} name="Water (L)" />
                <Line yAxisId="right" type="monotone" dataKey="calories" stroke="#f97316" strokeWidth={2} dot={false} name="Calories" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab() {
  const { data: logs = [] } = useQuery({
    queryKey: ['fitness-logs'],
    queryFn: () => api.get('/fitness/logs/').then(r => r.data?.results ?? r.data ?? []),
  })

  if (logs.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-12">No logs yet. Start with /checkin on Telegram!</p>
  }

  return (
    <div className="space-y-2">
      {logs.map(log => (
        <div key={log.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-white">{log.date}</p>
            {log.workout_completed
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">Workout ✓</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">Rest</span>}
          </div>
          <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
            {log.water_liters && <span>💧 {log.water_liters}L</span>}
            {log.calories && <span>🔥 {log.calories} kcal</span>}
            {log.body_weight_kg && <span>⚖️ {log.body_weight_kg}kg</span>}
            {log.sleep_hours && <span>😴 {log.sleep_hours}h</span>}
          </div>
          {log.exercise_logs?.length > 0 && (
            <p className="text-xs text-gray-600 mt-1.5">{log.exercise_logs.length} exercises logged</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Fitness() {
  const [tab, setTab] = useState('Today')

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Fitness Tracker</h1>
        <p className="text-gray-500 text-sm mt-1">Track workouts, water, calories, weight and sleep</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 rounded-xl p-1 border border-gray-800 w-fit">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === t ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-gray-200'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Today'    && <TodayTab />}
      {tab === 'Plan'     && <PlanTab />}
      {tab === 'Progress' && <ProgressTab />}
      {tab === 'History'  && <HistoryTab />}
    </div>
  )
}
