import { useEffect, useRef } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
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

        {/* Reticle + hint overlay */}
        {permission?.granted ? (
          <SafeAreaView className="flex-1" pointerEvents="box-none">
            <View className="flex-1 items-center justify-center" pointerEvents="none">
              <View style={{ width: 260, height: 160, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', borderRadius: 16 }} />
              <AppText variant="body" color="white" className="mt-4">Point at a barcode</AppText>
            </View>
          </SafeAreaView>
        ) : null}

        {/* Close */}
        <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }} pointerEvents="box-none">
          <View className="flex-row justify-end p-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close scanner"
              onPress={onClose}
              hitSlop={8}
              className="h-10 w-10 items-center justify-center rounded-full active:scale-95"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            >
              <X size={22} color="#ffffff" />
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  )
}
