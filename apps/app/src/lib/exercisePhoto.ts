import { Platform } from 'react-native'

export type PhotoSource = 'library' | 'camera'

// What a pick produces: a local picture already downsized to a JPEG. `blob` is set on web only,
// where a FormData part must be a real File; native sends the { uri, name, type } descriptor.
export interface ExercisePhoto {
  uri: string
  name: string
  type: 'image/jpeg'
  blob?: Blob
}

export type PhotoPick =
  | { status: 'picked'; photo: ExercisePhoto }
  | { status: 'cancelled' }
  // The user said no to the permission. The screen explains it; a throw would read as a bug.
  | { status: 'denied'; source: PhotoSource }

// The server re-encodes to the same bound; sending less keeps the upload small on a phone's upstream.
export const PHOTO_LONG_EDGE = 1600
export const PHOTO_QUALITY = 0.8

// The browser has no camera picker worth offering: on desktop it opens a file dialog, which
// Choose photo already is.
export const cameraSupported = Platform.OS !== 'web'

export function uploadPart(photo: ExercisePhoto): unknown {
  return photo.blob ?? { uri: photo.uri, name: photo.name, type: photo.type }
}

// Both native modules are imported on demand, so the web bundle's entry chunk does not carry them.
export async function pickExercisePhoto(source: PhotoSource): Promise<PhotoPick> {
  const ImagePicker = await import('expo-image-picker')
  if (Platform.OS !== 'web') {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) return { status: 'denied', source }
  }

  const options = { mediaTypes: ['images' as const], quality: PHOTO_QUALITY, allowsEditing: false }
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options)
  const asset = result.canceled ? undefined : result.assets?.[0]
  if (!asset) return { status: 'cancelled' }

  const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator')
  const save = { compress: PHOTO_QUALITY, format: SaveFormat.JPEG }
  let { width, height } = asset
  let uri = asset.uri
  // The system may not report a size (0): a no-op pass reads it, and re-encodes to JPEG either way.
  if (!width || !height) {
    const probed = await manipulateAsync(uri, [], save)
    ;({ uri, width, height } = probed)
  }
  const long = Math.max(width, height)
  const actions = long > PHOTO_LONG_EDGE
    ? [{ resize: width >= height ? { width: PHOTO_LONG_EDGE } : { height: PHOTO_LONG_EDGE } }]
    : []
  const out = await manipulateAsync(uri, actions, save)

  const photo: ExercisePhoto = { uri: out.uri, name: 'photo.jpg', type: 'image/jpeg' }
  if (Platform.OS === 'web') {
    const blob = await (await fetch(out.uri)).blob()
    photo.blob = new File([blob], photo.name, { type: photo.type })
  }
  return { status: 'picked', photo }
}
