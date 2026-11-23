import { Pressable, View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { AppText, interactive, linkProps } from '../ui'

// The instructions card, on an exercise's page and in gym mode, catalog and custom alike. The
// catalog's steps are numbered; a custom exercise's lines show as its owner typed them (other apps
// show a user's own instructions as written, and a one-line cue reads oddly as "1."). With none
// written, a catalog exercise says so; the owner of a custom one gets a link to add them.
export function InstructionSteps({ steps, numbered = true, addHref, onAdd, heading = true }: {
  steps: readonly string[]
  numbered?: boolean
  addHref?: string
  onAdd?: () => void
  /** A heading on its own page; gym mode's card sits inside a screen that has one. */
  heading?: boolean
}) {
  const { t } = useTranslation()
  return (
    <View className="rounded-2xl border border-surface-border bg-surface-raised p-4">
      <AppText variant="label" color="muted" className="mb-3 uppercase" headingLevel={heading ? 2 : undefined}>{t('exercises.detail.instructions')}</AppText>
      {steps.length > 0 ? (
        <View className="gap-2.5">
          {steps.map((step, i) => (
            <AppText key={i} variant="body" color="secondary">
              {numbered ? <AppText variant="bodySemibold" color="primary">{i + 1}. </AppText> : null}
              {step}
            </AppText>
          ))}
        </View>
      ) : addHref && onAdd ? (
        <Pressable {...linkProps(addHref, onAdd)} className={`min-h-[44px] justify-center ${interactive('hover:opacity-80')}`}>
          <AppText variant="bodySemibold" color="brand">{t('exercises.custom.addInstructions')}</AppText>
        </Pressable>
      ) : (
        <AppText variant="body" color="muted">{t('exercises.detail.noInstructions')}</AppText>
      )}
    </View>
  )
}
