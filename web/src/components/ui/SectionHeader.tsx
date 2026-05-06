import type React from 'react'

interface Props {
  icon?: React.ElementType
  title: string
  right?: React.ReactNode
  className?: string
}

export default function SectionHeader({ icon: Icon, title, right, className = '' }: Props) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-brand-500 flex-shrink-0" />}
        <h2 className="section-title">{title}</h2>
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  )
}
