import { useState } from 'react'
import { Image, Pressable, View } from 'react-native'
import { Camera, ImagePlus, RefreshCw, Trash2 } from './icons'
import { ActionSheet, type SheetAction } from './ActionSheet'
import { AppText } from './Typography'
import { interactive } from './interaction'
import { useTheme } from '../../theme/useTheme'
import { cameraSupported, type PhotoSource } from '../../lib/exercisePhoto'

export interface PhotoSlotLabels {
  add: string
  addHint: string
  replace: string
  remove: string
  choose: string
  take: string
  sourceTitle: string
  preview: string
  /** Over a picture that is chosen but not yet uploaded. */
  pending: string
}

interface Props {
  /** The picture to show; absent while empty or while a stored one is still loading. */
  uri?: string
  /** A picture is set (even if its pixels are not here yet). */
  filled: boolean
  /** Chosen here and not yet sent anywhere. */
  pending?: boolean
  busy?: boolean
  error?: string
  labels: PhotoSlotLabels
  onPick: (source: PhotoSource) => void
  onRemove: () => void
}

const OVERLAY = 'min-h-[44px] flex-row items-center gap-1.5 rounded-full bg-black/60 px-4 active:bg-black/80'

// An optional picture: a dashed "add" slot that becomes the picture with Replace and Remove on
// it. Where there is no camera (the web) Add goes straight to the file picker.
export function PhotoSlot({ uri, filled, pending, busy, error, labels, onPick, onRemove }: Props) {
  const { accent } = useTheme()
  const [sourceOpen, setSourceOpen] = useState(false)
  const choose = () => { if (cameraSupported) setSourceOpen(true); else onPick('library') }
  const sources: SheetAction[] = [
    { label: labels.choose, icon: ImagePlus, onPress: () => onPick('library') },
    { label: labels.take, icon: Camera, onPress: () => onPick('camera') },
  ]
  return (
    <View className="gap-1.5">
      {filled ? (
        <View className="overflow-hidden rounded-2xl bg-surface-muted" style={{ height: 200 }}>
          {uri ? <Image source={{ uri }} accessibilityLabel={labels.preview} resizeMode="cover" style={{ width: '100%', height: '100%' }} /> : null}
          <View className="absolute bottom-3 right-3 flex-row gap-2">
            <Pressable accessibilityRole="button" disabled={busy} onPress={choose} className={`${OVERLAY} ${interactive('hover:bg-black/80')}`}>
              <RefreshCw size={15} color="#ffffff" />
              <AppText variant="bodySemibold" className="text-[13px] text-white">{labels.replace}</AppText>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onRemove} className={`${OVERLAY} ${interactive('hover:bg-black/80')}`}>
              <Trash2 size={15} color="#ffffff" />
              <AppText variant="bodySemibold" className="text-[13px] text-white">{labels.remove}</AppText>
            </Pressable>
          </View>
          {pending ? (
            <View className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1">
              <AppText variant="caption" className="text-white">{labels.pending}</AppText>
            </View>
          ) : null}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={labels.add}
          disabled={busy}
          onPress={choose}
          className={`items-center justify-center gap-1 rounded-2xl border-[1.5px] border-dashed border-brand-500 bg-brand-500/10 px-4 py-5 active:opacity-70 ${interactive('hover:bg-brand-500/15')}`}
          style={{ minHeight: 132 }}
        >
          <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-500/20">
            <Camera size={22} color={accent} strokeWidth={2.2} />
          </View>
          <AppText variant="subheading">{labels.add}</AppText>
          <AppText variant="caption" color="muted" className="text-center">{labels.addHint}</AppText>
        </Pressable>
      )}
      {error ? <AppText variant="caption" color="error">{error}</AppText> : null}
      <ActionSheet open={sourceOpen} title={labels.sourceTitle} actions={sources} onClose={() => setSourceOpen(false)} />
    </View>
  )
}
