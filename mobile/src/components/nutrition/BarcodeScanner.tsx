import { useEffect, useRef } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import { AlertCircle, X } from 'lucide-react-native'
import { AppText, Button } from '../ui'
import { useTheme } from '../../theme/useTheme'

interface Props {
  onResult: (code: string) => void
  onClose: () => void
}

// Native equivalent of web components/BarcodeScanner (react-zxing): a full-screen
// camera that resolves the first decoded EAN/UPC barcode exactly once, then hands the
// code back to LogFood (→ foodAPI.barcode). Web buzzed via navigator.vibrate on a hit;
// here that's a success haptic. Rendered inside a Modal so it fully covers the tab bar.
export function BarcodeScanner({ onResult, onClose }: Props) {
  const { colors } = useTheme()
  const [permission, requestPermission] = useCameraPermissions()
  const resolvedRef = useRef(false)

  // Ask once as soon as we mount without a decision yet (mirrors the web flow, where
  // opening the scanner triggers the browser camera prompt).
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission()
  }, [permission, requestPermission])

  const handleScanned = ({ data }: { data: string }) => {
    if (resolvedRef.current || !data) return
    resolvedRef.current = true
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    onResult(data)
  }

  const denied = permission != null && !permission.granted && !permission.canAskAgain

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={onClose}>
      {/* A Modal is its own native view hierarchy with NO SafeAreaProvider from the app
          root, so SafeAreaView insets would be 0 and the close button would jam under the
          status bar (untappable). Nest a provider here — same rule as DateInput. */}
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
              onBarcodeScanned={handleScanned}
            />
          ) : (
            <SafeAreaView className="flex-1 items-center justify-center px-8">
              <AlertCircle size={40} color={colors.txMuted} />
              <AppText variant="heading" color="white" className="mt-4 text-center">
                {denied ? 'Camera access denied' : 'Camera permission needed'}
              </AppText>
              <AppText variant="body" color="muted" className="mt-2 text-center">
                {denied
                  ? 'Enable camera access for Lyftr in your device settings to scan barcodes.'
                  : 'Allow camera access to scan a food barcode.'}
              </AppText>
              {!denied ? (
                <View className="mt-5 w-full">
                  <Button title="Allow camera" onPress={requestPermission} />
                </View>
              ) : null}
            </SafeAreaView>
          )}

          {/* Reticle + hint (non-interactive, so it never eats the close tap) */}
          {permission?.granted ? (
            <View style={StyleSheet.absoluteFill} className="items-center justify-center" pointerEvents="none">
              <View style={{ width: 260, height: 160, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', borderRadius: 16 }} />
              <AppText variant="body" color="white" className="mt-4">Point at a barcode</AppText>
            </View>
          ) : null}

          {/* Close — topmost layer, below the status bar via the (now real) top inset */}
          <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }} pointerEvents="box-none">
            <View className="flex-row justify-end px-4 pt-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close scanner"
                onPress={onClose}
                hitSlop={16}
                className="h-11 w-11 items-center justify-center rounded-full active:scale-90"
                style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
              >
                <X size={24} color="#ffffff" strokeWidth={2.4} />
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  )
}
