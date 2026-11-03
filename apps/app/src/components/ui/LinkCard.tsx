import { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { ChevronRight } from './icons'
import { useTheme } from '../../theme/useTheme'
import { Card } from './Card'
import { interactive } from './interaction'
import { linkProps } from './link'

interface Props {
  href: string
  onPress: () => void
  /** The link's accessible name: what the card opens. */
  label: string
  children: ReactNode
  /** Buttons beside the content, outside the link. */
  actions?: ReactNode
}

// The web form of a list card that opens a page. A link cannot hold the card's own buttons (a
// button inside an <a> is invalid and axe flags it), so the link is laid over the whole card
// and the buttons sit above it as siblings: the "pseudo-content trick" from
// https://inclusive-components.design/cards/. The content lets clicks through to the link.
export function LinkCard({ href, onPress, label, children, actions }: Props) {
  const { colors } = useTheme()
  return (
    <Card className="group flex-row items-center gap-3 rounded-2xl motion-safe:transition-colors motion-safe:duration-[120ms] hover:border-brand-500/40">
      <Pressable
        {...linkProps(href, onPress)}
        accessibilityLabel={label}
        style={StyleSheet.absoluteFill}
        className={`rounded-2xl ${interactive('')}`}
      />
      <View style={{ pointerEvents: 'none' }} className="flex-1 flex-row items-center gap-3">
        {children}
      </View>
      {actions}
      <View style={{ pointerEvents: 'none' }}>
        <ChevronRight size={16} color={colors.txMuted} />
      </View>
    </Card>
  )
}
