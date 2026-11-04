import { lazy, Suspense, type ComponentProps } from 'react'
import { ActivityIndicator, Modal, View } from 'react-native'
import { useTranslation } from '@lyftr/shared'

// Web: expo-camera loads only when Scan is pressed. Expo CLI splits a bundle at an async
// import on web (docs.expo.dev/guides/customizing-metro, "Bundle splitting"), so the log
// route no longer carries the camera for the many visits that never scan.
const Scanner = lazy(() => import('./BarcodeScanner').then((m) => ({ default: m.BarcodeScanner })))

export function BarcodeScanner(props: ComponentProps<typeof Scanner>) {
  const { t } = useTranslation()
  return (
    <Suspense
      fallback={
        <Modal visible transparent={false}>
          <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#ffffff" accessibilityLabel={t('common.loading')} />
          </View>
        </Modal>
      }
    >
      <Scanner {...props} />
    </Suspense>
  )
}
