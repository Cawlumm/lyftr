import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Dumbbell, Trophy } from 'lucide-react'
import { format } from 'date-fns'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import Model, { IExerciseData } from 'react-body-highlighter'
import { exerciseAPI } from '../services/api'
import { useWorkoutSession } from '../stores/workoutSession'
import { useSettingsStore, weightShort } from '../stores/settings'
import { useTheme } from '../hooks/useTheme'
import * as types from '../types'
import { muscleColor, muscleColorBordered, EQUIPMENT_LABEL, muscleToBodySlugs } from '../utils/exerciseUtils'

function buildBodyData(exercise: types.Exercise): IExerciseData[] {
  const primarySlugs = muscleToBodySlugs(exercise.muscle_group)
  const secondarySlugs = (exercise.secondary_muscles || [])
    .flatMap(m => muscleToBodySlugs(m))
    .filter(s => !primarySlugs.includes(s))

  const data: IExerciseData[] = []
  if (primarySlugs.length > 0) {
    data.push({ name: 'Primary', muscles: primarySlugs as any, frequency: 2 })
  }
  if (secondarySlugs.length > 0) {
    data.push({ name: 'Secondary', muscles: secondarySlugs as any, frequency: 1 })
  }
  return data
}

export default function ExerciseDetail() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const navigate = useNavigate()
  const { session } = useWorkoutSession()
  const { isDark } = useTheme()
  const { settings } = useSettingsStore()
  const wUnit = weightShort(settings.weight_unit)
  const [exercise, setExercise] = useState<types.Exercise | null>(null)
  const [pr, setPR] = useState<types.PersonalRecord | null>(null)
  const [history, setHistory] = useState<types.ExerciseHistoryPoint[]>([])
  const [imgFailed, setImgFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const id = Number(exerciseId)
    if (!id) { navigate(-1); return }

    const fromSession = session?.exercises.find(e => e.exercise_id === id)?.exercise

    const exercisePromise = fromSession
      ? Promise.resolve(fromSession)
      : exerciseAPI.get(id)

    Promise.all([
      exercisePromise,
      exerciseAPI.getPRs(id).catch(() => null),
      exerciseAPI.getHistory(id, 15).catch(() => []),
    ])
      .then(([ex, prData, histData]) => {
        setExercise(ex)
        setPR(prData)
        setHistory(histData || [])
      })
      .catch(() => navigate(-1))
      .finally(() => setLoading(false))
  }, [exerciseId])

  const bodyColor = isDark ? '#162240' : '#e2e8f0'
  const highlightColors = ['#0e7490', '#22d3ee'] // [secondary=cyan-700, primary=cyan-400]

  if (loading || !exercise) {
    return (
      <div className="flex items-center justify-center py-20">
        <Dumbbell className="w-6 h-6 text-brand-500 animate-pulse" />
      </div>
    )
  }

  const bodyData = buildBodyData(exercise)
  const equipLabel = EQUIPMENT_LABEL[exercise.equipment?.toLowerCase()] || exercise.equipment
  const descLines = exercise.description
    ? exercise.description.split('\n').filter(l => l.trim())
    : []

  return (
    <div className="space-y-5 animate-slide-up pb-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-surface-muted rounded-lg transition-colors mt-0.5 flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-tx-muted" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-bold text-2xl text-tx-primary leading-tight">{exercise.name}</h1>
          <span className={`inline-flex items-center mt-1.5 px-2 py-0.5 rounded text-xs font-medium border ${muscleColorBordered(exercise.muscle_group)}`}>
            {exercise.muscle_group}
          </span>
        </div>
      </div>

      {/* Muscle diagram */}
      <div className="card p-4">
        <p className="text-xs font-semibold text-tx-muted uppercase tracking-wider mb-3">Muscles Worked</p>

        <div className="flex items-start justify-center gap-6">
          <div className="flex flex-col items-center gap-1">
            <Model
              data={bodyData}
              type="anterior"
              bodyColor={bodyColor}
              highlightedColors={highlightColors}
              style={{ width: '140px' }}
            />
            <span className="text-xs text-tx-muted">Front</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Model
              data={bodyData}
              type="posterior"
              bodyColor={bodyColor}
              highlightedColors={highlightColors}
              style={{ width: '140px' }}
            />
            <span className="text-xs text-tx-muted">Back</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 justify-center">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#22d3ee' }} />
            <span className="text-xs text-tx-muted">Primary</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#0e7490' }} />
            <span className="text-xs text-tx-muted">Secondary</span>
          </div>
        </div>
      </div>

      {/* Image */}
      {exercise.image_url && !imgFailed && (
        <img
          src={exercise.image_url}
          alt={exercise.name}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="w-full h-52 object-cover rounded-2xl bg-surface-muted"
        />
      )}

      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        {equipLabel && exercise.equipment !== 'other' && (
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-surface-muted border border-surface-border text-xs font-medium text-tx-secondary">
            {equipLabel}
          </span>
        )}
        {exercise.category && (
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-xs font-medium text-brand-400 capitalize">
            {exercise.category}
          </span>
        )}
      </div>

      {/* Secondary muscles */}
      {exercise.secondary_muscles?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-tx-muted uppercase tracking-wider mb-2">Also works</p>
          <div className="flex flex-wrap gap-1.5">
            {exercise.secondary_muscles.map(m => (
              <span key={m} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${muscleColor(m)}`}>
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Personal Record */}
      {pr && pr.weight > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-warning-400" />
            <p className="text-xs font-semibold text-tx-muted uppercase tracking-wider">Your Best</p>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold text-tx-primary tabular-nums">{pr.weight}</span>
            <span className="text-sm text-tx-muted mb-0.5">{wUnit} × {pr.reps} reps</span>
          </div>
          <p className="text-xs text-tx-muted mt-1">
            Est. 1RM: {Math.round(pr.estimated_1rm)} {wUnit} · {format(new Date(pr.date), 'MMM d, yyyy')}
          </p>
        </div>
      )}

      {/* History chart */}
      {history.length >= 2 && (() => {
        const chartData = [...history].reverse().map(h => ({
          date: format(new Date(h.date), 'M/d'),
          weight: Math.round(h.max_weight * 10) / 10,
        }))
        return (
          <div className="card p-4">
            <p className="text-xs font-semibold text-tx-muted uppercase tracking-wider mb-3">
              Weight Progression
            </p>
            <ResponsiveContainer width="100%" height={110}>
              <LineChart data={chartData}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'var(--color-tx-muted)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-surface-border)',
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  formatter={(v: number) => [`${v} ${wUnit}`, 'Max weight']}
                />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="#0891b2"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#0891b2' }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )
      })()}

      {/* Instructions */}
      {descLines.length > 0 && (
        <div className="card p-4">
          <p className="text-xs font-semibold text-tx-muted uppercase tracking-wider mb-3">Instructions</p>
          <div className="space-y-2.5">
            {descLines.map((line, i) => {
              const stepMatch = line.match(/^(\d+\.)\s*(.*)/)
              if (stepMatch) {
                return (
                  <p key={i} className="text-sm text-tx-secondary leading-relaxed">
                    <span className="font-semibold text-tx-primary">{stepMatch[1]}</span>{' '}{stepMatch[2]}
                  </p>
                )
              }
              return <p key={i} className="text-sm text-tx-secondary leading-relaxed">{line}</p>
            })}
          </div>
        </div>
      )}
    </div>
  )
}
