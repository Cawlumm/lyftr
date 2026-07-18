import { ReactNode } from 'react'
import { Text as RNText, TextProps, TextStyle } from 'react-native'

// The ONLY sanctioned way to render text. The brand fonts (Outfit for display,
// Plus Jakarta Sans for body) are loaded per-weight in app/_layout.tsx — each weight
// is a separate fontFamily, so bare `font-bold`/`font-semibold` classNames silently
// fall back to the SYSTEM font. Routing all text through these variants is what
// actually puts the loaded fonts on screen (and keeps the type scale consistent
// with the web app: Outfit headings, Jakarta body, same token colors).

export type TextVariant =
  | 'display' // hero / brand moments (Outfit 800)
  | 'title' // page titles — the H1 (Outfit 700, 2xl)
  | 'heading' // card / modal headings (Outfit 700, lg)
  | 'subheading' // row titles, small headings (Jakarta 700, sm)
  | 'body' // default copy (Jakarta 500)
  | 'bodySemibold' // emphasized copy, button-ish text (Jakarta 600)
  | 'caption' // secondary small print (Jakarta 500, xs)
  | 'label' // uppercase micro-labels above fields/sections (Jakarta 700)
  | 'numeric' // big metric values (Outfit 800, tabular)

export type TextColor =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'inverse'
  | 'brand'
  | 'success'
  | 'error'
  | 'white'

const VARIANT: Record<TextVariant, string> = {
  display: 'font-display-heavy text-[28px] tracking-tight',
  title: 'font-display text-2xl tracking-tight',
  heading: 'font-display text-lg',
  subheading: 'font-sans-bold text-sm',
  body: 'font-sans text-[15px]',
  bodySemibold: 'font-sans-semibold text-[15px]',
  caption: 'font-sans text-xs',
  label: 'font-sans-bold text-[11px] uppercase tracking-widest',
  numeric: 'font-display-heavy text-3xl',
}

const COLOR: Record<TextColor, string> = {
  primary: 'text-tx-primary',
  secondary: 'text-tx-secondary',
  muted: 'text-tx-muted',
  inverse: 'text-tx-inverse',
  brand: 'text-brand-500',
  success: 'text-success-500',
  error: 'text-error-400',
  white: 'text-white',
}

// Small print defaults to the softer text color so callers don't have to repeat it.
const DEFAULT_COLOR: Record<TextVariant, TextColor> = {
  display: 'primary',
  title: 'primary',
  heading: 'primary',
  subheading: 'primary',
  body: 'primary',
  bodySemibold: 'primary',
  caption: 'secondary',
  label: 'secondary',
  numeric: 'primary',
}

// `fontVariant` has no NativeWind utility, so numeric gets it inline — tabular digits
// stop metric values from jittering as they tick (mirrors the web's tabular-nums).
const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] }

export interface AppTextProps extends TextProps {
  variant?: TextVariant
  color?: TextColor
  className?: string
  children?: ReactNode
}

export function AppText({
  variant = 'body',
  color,
  className = '',
  style,
  ...rest
}: AppTextProps) {
  const resolved = COLOR[color ?? DEFAULT_COLOR[variant]]
  return (
    <RNText
      className={`${VARIANT[variant]} ${resolved} ${className}`}
      style={variant === 'numeric' ? [TABULAR, style] : style}
      {...rest}
    />
  )
}

// Convenience wrappers so call sites read like a type scale, not a prop soup.
type VariantlessProps = Omit<AppTextProps, 'variant'>

export function Heading(props: VariantlessProps) {
  return <AppText variant="heading" {...props} />
}

export function Body(props: VariantlessProps) {
  return <AppText variant="body" {...props} />
}

export function Label(props: VariantlessProps) {
  return <AppText variant="label" {...props} />
}

export function Numeric(props: VariantlessProps) {
  return <AppText variant="numeric" {...props} />
}

// Pre-existing exports, preserved verbatim in API but re-based on the brand fonts
// (this is the fix for tab screens rendering headings in the system font).
export function H1({ children }: { children: ReactNode }) {
  return <AppText variant="title">{children}</AppText>
}

// Muted deliberately does NOT set a font size: existing callers size it via
// className (`text-xs`, etc.), and stacking a variant size class against theirs
// would leave the winner to stylesheet order rather than intent.
export function Muted({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <RNText className={`font-sans text-tx-secondary ${className}`}>{children}</RNText>
}
