import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Dumbbell } from 'lucide-react'
import * as types from '../types'
import { muscleColor, muscleColorBordered, EQUIPMENT_LABEL } from '../utils/exerciseUtils'

interface Props {
  exercise: types.Exercise
  onClose: () => void
}

export default function ExerciseInfoDrawer({ exercise, onClose }: Props) {
  const [imgFailed, setImgFailed] = useState(false)

  const equipLabel = EQUIPMENT_LABEL[exercise.equipment?.toLowerCase()] || exercise.equipment
  const descLines = exercise.description
    ? exercise.description.split('\n').filter(l => l.trim())
    : []

  return createPortal((
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="bg-surface-base border border-surface-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle — mobile only */}
        <div className="mx-auto w-10 h-1 rounded-full bg-surface-muted mt-3 mb-1 sm:hidden" />

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-surface-border">
          <div className="flex-1 min-w-0 pr-3">
            <h3 className="font-display font-bold text-lg text-tx-primary leading-snug">{exercise.name}</h3>
            <span className={`inline-flex items-center mt-1.5 px-2 py-0.5 rounded text-xs font-medium border ${muscleColorBordered(exercise.muscle_group)}`}>
              {exercise.muscle_group}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-surface-muted rounded-lg transition-colors flex-shrink-0 mt-0.5">
            <X className="w-4 h-4 text-tx-muted" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Image */}
          {exercise.image_url && !imgFailed ? (
            <img
              src={exercise.image_url}
              alt={exercise.name}
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="w-full h-44 object-cover rounded-xl bg-surface-muted"
            />
          ) : (
            <div className="w-full h-32 rounded-xl bg-surface-muted/50 border border-surface-border flex items-center justify-center">
              <Dumbbell className="w-8 h-8 text-tx-muted opacity-40" />
            </div>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            {equipLabel && exercise.equipment !== 'other' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface-muted border border-surface-border text-xs font-medium text-tx-secondary">
                {equipLabel}
              </span>
            )}
            {exercise.category && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-500/10 border border-brand-500/20 text-xs font-medium text-brand-400 capitalize">
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
                  <span key={m} className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${muscleColor(m)}`}>
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Instructions */}
          {descLines.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-tx-muted uppercase tracking-wider mb-2">Instructions</p>
              <div className="space-y-2">
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
      </div>
    </div>
  ), document.body)
}
