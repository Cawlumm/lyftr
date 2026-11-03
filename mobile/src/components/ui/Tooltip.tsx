import type { ReactElement } from 'react'
import type { Side } from './overlay'

export interface TooltipProps {
  /** The supplementary text. Never the control's only name: give the control a label too. */
  content: string
  side?: Side
  /** The trigger. Should be focusable; a non-focusable one is made a Tab stop on web. */
  children: ReactElement
}

// Native has no hover and no Tab order, so a tooltip has nothing to attach to; the trigger is
// rendered as it is. The web version is Tooltip.web.tsx.
export function Tooltip({ children }: TooltipProps) {
  return children
}
