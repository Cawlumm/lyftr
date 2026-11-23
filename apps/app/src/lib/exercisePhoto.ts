import { Platform } from 'react-native'
import { loadImageManipulator, loadImagePicker } from './photoModules'

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

export async function pickExercisePhoto(source: PhotoSource): Promise<PhotoPick> {
  const ImagePicker = await loadImagePicker()
  if (Platform.OS !== 'web') {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) return { status: 'denied', source }
  }

  // quality 1 lets the picker hand over the original file untouched. Below 1, iOS decodes the
  // whole photo, redraws it upright and re-encodes it at full size before we ever see it: a 48 MP
  // shot is several ~200 MB bitmaps at once, enough for iOS to kill the app now and then.
  const options = { mediaTypes: ['images' as const], quality: 1, allowsEditing: false }
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options)
  const asset = result.canceled ? undefined : result.assets?.[0]
  if (!asset) return { status: 'cancelled' }

  // Decoded straight to the upload size (CGImageSource / BitmapFactory thumbnails): the full-size
  // bitmap is never in memory, and EXIF orientation is applied on the way.
  const { ImageManipulator, SaveFormat } = await loadImageManipulator()
  const context = ImageManipulator.manipulate(asset.uri, { maxWidth: PHOTO_LONG_EDGE, maxHeight: PHOTO_LONG_EDGE })
  const image = await context.renderAsync()
  let out: { uri: string }
  try {
    out = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG })
  } finally {
    image.release()
    context.release()
  }

  const photo: ExercisePhoto = { uri: out.uri, name: 'photo.jpg', type: 'image/jpeg' }
  if (Platform.OS === 'web') {
    const blob = await (await fetch(out.uri)).blob()
    photo.blob = new File([blob], photo.name, { type: photo.type })
  }
  return { status: 'picked', photo }
}
