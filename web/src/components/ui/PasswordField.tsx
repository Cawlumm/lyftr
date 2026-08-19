import { useState } from 'react'
import { AlertCircle, Check, Eye, EyeOff, X } from 'lucide-react'
import type { RuleState } from '@lyftr/shared'

export function Rule({ state, children }: { state: RuleState; children: React.ReactNode }) {
  const tone =
    state === 'ok' ? 'text-success-400' : state === 'bad' ? 'text-error-400' : 'text-tx-muted'
  return (
    <p className={`flex items-center gap-1.5 text-xs mt-1.5 ${tone}`}>
      {state === 'ok' ? <Check className="w-3 h-3 flex-shrink-0" />
        : state === 'bad' ? <X className="w-3 h-3 flex-shrink-0" />
        : <span className="w-3 h-3 flex-shrink-0 rounded-full border border-current opacity-40" aria-hidden="true" />}
      {children}
    </p>
  )
}

interface Props {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  placeholder?: string
  /** Rule rows rendered under the input. */
  children?: React.ReactNode
}

// Every password input in the app, so the three screens that ask for one behave the same:
// sign in, register, and change password.
//
// A reveal toggle and a Caps Lock warning are worth more on a password field than
// anywhere else, because the field hides the only evidence of what went wrong. Without
// them a typo and a forgotten password are indistinguishable — the user sees the same
// rejection either way and cannot tell which mistake they made.
export default function PasswordField({
  id, label, value, onChange, autoComplete, placeholder, children,
}: Props) {
  const [visible, setVisible] = useState(false)
  const [caps, setCaps] = useState(false)

  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="relative mt-2">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className="input pr-11"
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          // Caps Lock is only readable from a key event, so it is tracked per field —
          // the one being typed in is the only one with a current answer. Cleared on
          // blur so a stale warning cannot outlive the field it belonged to.
          onKeyUp={e => setCaps(e.getModifierState('CapsLock'))}
          onBlur={() => setCaps(false)}
          required
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          // tabIndex -1 keeps Tab running straight down the fields to the submit button,
          // which is the path someone filling this form actually wants.
          tabIndex={-1}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-0 px-3 flex items-center text-tx-muted hover:text-tx-primary transition-colors"
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {caps && (
        <p className="flex items-center gap-1.5 text-xs mt-1.5 text-warning-400">
          <AlertCircle className="w-3 h-3 flex-shrink-0" /> Caps Lock is on
        </p>
      )}
      {children}
    </div>
  )
}
