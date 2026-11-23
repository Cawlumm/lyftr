import { Pressable, View } from 'react-native'
import { useTranslation } from '@lyftr/shared'
import { AppText, interactive, linkProps } from '../ui'

// The instructions card of an exercise's page, catalog and custom alike. With none written, a
// catalog exercise says so; the owner of a custom one gets a link to add them.
export function InstructionSteps({ steps, addHref, onAdd }: { steps: readonly string[]; addHref?: string; onAdd?: () => void }) {
  const { t } = useTranslation()
  return (
    <View className="rounded-2xl border border-surface-border bg-surface-raised p-4">
      <AppText variant="label" color="muted" className="mb-3 uppercase" headingLevel={2}>{t('exercises.detail.instructions')}</AppText>
      {steps.length > 0 ? (
        <View className="gap-2.5">
          {steps.map((step, i) => (
            <AppText key={i} variant="body" color="secondary">
              <AppText variant="bodySemibold" color="primary">{i + 1}. </AppText>
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
