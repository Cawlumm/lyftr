// What makes a new password acceptable, in one place for both apps.
//
// Three screens ask for one — web sign-up, web change-password, mobile change-password —
// and each used to carry its own copy of the same three checks, written slightly
// differently. The web pages compared lengths inline in their submit handlers; the mobile
// screen had its own MIN_PASSWORD constant. Nothing kept them in step with each other or
// with the backend's `min=8`, and a rule the two apps disagree about is worse than no
// rule: the same password is accepted on one and refused on the other.
//
// The server is still the authority. This exists so the user learns the answer while
// typing instead of after a round trip.

/** Mirrors the backend's `min=8` on RegisterRequest and ChangePasswordRequest. */
export const MIN_PASSWORD_LENGTH = 8

/**
 * `pending` is the untouched state. An empty field is not yet wrong, and marking it red
 * before the user has typed anything reads as an error they caused.
 */
export type RuleState = 'pending' | 'ok' | 'bad'

export function ruleState(touched: boolean, satisfied: boolean): RuleState {
  if (!touched) return 'pending'
  return satisfied ? 'ok' : 'bad'
}

export interface NewPasswordInput {
  password: string
  confirm: string
  /**
   * The account's existing password, when the screen collects one. Supplying it adds the
   * "must be different" rule and requires it to be non-empty before the form is ready —
   * omit it on sign-up, where there is nothing to differ from.
   */
  current?: string
}

export interface NewPasswordRules {
  length: RuleState
  /** Always `pending` when no current password was supplied. */
  different: RuleState
  match: RuleState
  /** Every applicable rule satisfied, so the form is worth submitting. */
  ready: boolean
}

export function newPasswordRules({ password, confirm, current }: NewPasswordInput): NewPasswordRules {
  const longEnough = password.length >= MIN_PASSWORD_LENGTH
  const matches = password === confirm
  // A change-password screen is the only caller that passes `current`; sign-up has no
  // previous password, so the rule does not apply rather than silently passing.
  const changing = current !== undefined
  const isDifferent = changing && password !== current

  return {
    length: ruleState(password.length > 0, longEnough),
    different: ruleState(changing && !!current && password.length > 0, isDifferent),
    match: ruleState(confirm.length > 0, matches),
    ready: longEnough && matches && (!changing || (!!current && isDifferent)),
  }
}

// The wording, next to the rules themselves. Sharing the states but hand-copying the
// labels across four screens leaves exactly the drift this module exists to stop — the
// apps could no longer disagree about what passes, only about what to call it.
export function lengthRuleLabel(): string {
  return `At least ${MIN_PASSWORD_LENGTH} characters`
}

export function differentRuleLabel(): string {
  return 'Different from your current password'
}

/**
 * Reads the state rather than fixing one string, because the match rule is the only one
 * whose phrasing flips. "Passwords match" in the `pending` state would assert something
 * untrue about a confirmation box nobody has typed into yet.
 */
export function matchRuleLabel(state: RuleState): string {
  switch (state) {
    case 'ok':
      return 'Passwords match'
    case 'bad':
      return 'Passwords do not match'
    default:
      return 'Repeat the new password'
  }
}
