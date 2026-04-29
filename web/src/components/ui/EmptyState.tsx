import type React from 'react'

interface Props {
  icon: React.ElementType
  title: string
  subtitle?: string
  action?: React.ReactNode
  compact?: boolean
}

export default function EmptyState({ icon: Icon, title, subtitle, action, compact = false }: Props) {
  return (
    <div className={compact
      ? 'flex flex-col items-center justify-center py-8 text-center px-4 gap-1'
      : 'empty-state'
    }>
      <div className="w-12 h-12 rounded-xl bg-surface-muted border border-surface-border flex items-center justify-center mb-2">
        <Icon className="w-6 h-6 text-tx-muted opacity-60" />
      </div>
      <p className="text-sm font-medium text-tx-primary">{title}</p>
      {subtitle && <p className="text-xs text-tx-muted mt-0.5">{subtitle}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
