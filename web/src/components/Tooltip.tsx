import { useState, useRef, useEffect } from 'react'
import { HelpCircle } from 'lucide-react'

interface TooltipProps {
  content: string
  children?: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const positions = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left:   'right-full top-1/2 -translate-y-1/2 mr-2',
    right:  'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  return (
    <div
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className={`absolute ${positions[side]} z-50 animate-fade-in`}>
          <div className="px-2.5 py-1.5 bg-surface-overlay border border-surface-border rounded-lg shadow-dropdown text-xs text-tx-secondary whitespace-nowrap max-w-xs">
            {content}
          </div>
        </div>
      )}
    </div>
  )
}

export function HelpTip({ content }: { content: string }) {
  return (
    <Tooltip content={content}>
      <HelpCircle className="w-3.5 h-3.5 help-icon" />
    </Tooltip>
  )
}
