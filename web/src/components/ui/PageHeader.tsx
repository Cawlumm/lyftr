import type React from 'react'

interface Props {
  title: string
  subtitle?: string
  action?: React.ReactNode
}

export default function PageHeader({ title, subtitle, action }: Props) {
  return (
    <div className="flex justify-between items-center gap-3">
      <div className="min-w-0">
        <h1 className="font-display font-bold text-2xl text-tx-primary">{title}</h1>
        {subtitle && <p className="text-tx-muted text-sm mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}
