import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Dumbbell } from 'lucide-react'
import { programAPI } from '../services/api'
import { useSettingsStore, lbsToDisplay } from '../stores/settings'
import ProgramBuilder, { BuilderInitial, BuilderDay, newClientId } from '../components/ProgramBuilder'
import * as types from '../types'

// toBuilderDay maps an API ProgramDay into the builder's local shape, converting stored
// lbs targets into the user's display unit and stamping stable client ids for keys.
function toBuilderDay(day: types.ProgramDay, weightUnit: string, defaultRest: number): BuilderDay {
  return {
    clientId: newClientId(),
    name: day.name,
    is_rest_day: day.is_rest_day,
    exercises: (day.exercises || []).map(ex => ({
      clientId: newClientId(),
      exercise_id: ex.exercise_id,
      exercise: ex.exercise,
      notes: ex.notes || '',
      rest_seconds: ex.rest_seconds ?? defaultRest,
      sets: (ex.sets || []).map(s => ({
        set_number: s.set_number,
        target_reps: s.target_reps,
        target_weight: lbsToDisplay(s.target_weight, weightUnit),
      })),
    })),
  }
}

export default function EditProgram() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { settings } = useSettingsStore()
  const [initial, setInitial] = useState<BuilderInitial | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const programId = Number(id)
    if (!programId) { navigate('/programs'); return }
    const defaultRest = settings.rest_seconds_default ?? 90
    programAPI.get(programId)
      .then(p => {
        // Prefer the day-structured shape; fall back to wrapping a legacy flat program.
        const days = (p.days && p.days.length > 0)
          ? p.days.map(d => toBuilderDay(d, settings.weight_unit, defaultRest))
          : [toBuilderDay({ name: 'Day 1', order_index: 0, is_rest_day: false, exercises: p.exercises || [] }, settings.weight_unit, defaultRest)]
        setInitial({ name: p.name, notes: p.notes || '', days })
      })
      .catch(() => setError('Failed to load program'))
  }, [id])

  if (error) {
    return <div className="alert-error m-4"><span>{error}</span></div>
  }
  if (!initial) {
    return (
      <div className="flex items-center justify-center py-20">
        <Dumbbell className="w-6 h-6 text-brand-500 animate-pulse" />
      </div>
    )
  }

  return (
    <ProgramBuilder
      heading="Edit Program"
      submitLabel="Save Changes"
      initial={initial}
      onSubmit={payload => programAPI.update(Number(id), payload).then(() => {})}
    />
  )
}
