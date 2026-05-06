import type React from 'react'

interface Props {
  icon: React.ElementType
  label: string
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  variant?: 'brand' | 'danger' | 'ghost' | 'secondary' | 'solid'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
}

const CONTAINER: Record<string, string> = {
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-10 h-10 rounded-xl',
  lg: 'w-12 h-12 rounded-xl',
}
const ICON_SIZE: Record<string, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
}
const VARIANT: Record<string, string> = {
  brand:     'bg-brand-500/10 border border-brand-500/20 text-brand-400 hover:bg-brand-500/20',
  danger:    'text-tx-muted hover:bg-error-500/10 hover:text-error-400',
  ghost:     'text-tx-muted hover:bg-surface-muted hover:text-tx-primary',
  secondary: 'bg-surface-muted border border-surface-border text-tx-primary hover:bg-surface-overlay',
  solid:     'bg-brand-500 text-white hover:bg-brand-600 shadow-sm',
}

export default function IconButton({
  icon: Icon, label, onClick, variant = 'ghost', size = 'sm',
  disabled, className = '', type = 'button',
}: Props) {
  return (
    <button
      type={type}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center flex-shrink-0 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${CONTAINER[size]} ${VARIANT[variant]} ${className}`}
    >
      <Icon className={ICON_SIZE[size]} />
    </button>
  )
}
