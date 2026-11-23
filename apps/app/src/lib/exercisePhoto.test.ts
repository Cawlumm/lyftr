import { pickExercisePhoto, PHOTO_LONG_EDGE, PHOTO_QUALITY } from './exercisePhoto'

const mockPicker = {
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}

const mockImage = { saveAsync: jest.fn(async () => ({ uri: 'file:///out.jpg', width: 1200, height: 1600 })), release: jest.fn() }
const mockContext = { renderAsync: jest.fn(async () => mockImage), release: jest.fn() }
const mockManipulate = jest.fn((_uri: string, _opts: unknown) => mockContext)
jest.mock('./photoModules', () => ({
  loadImagePicker: async () => mockPicker,
  loadImageManipulator: async () => ({
    ImageManipulator: { manipulate: (uri: string, opts: unknown) => mockManipulate(uri, opts) },
    SaveFormat: { JPEG: 'jpeg' },
  }),
}))

const picked = { canceled: false, assets: [{ uri: 'file:///IMG_0001.HEIC', width: 6048, height: 8064 }] }

beforeEach(() => jest.clearAllMocks())

describe('pickExercisePhoto', () => {
  it('takes the original from the picker, never a full-size re-encode', async () => {
    mockPicker.launchImageLibraryAsync.mockResolvedValue(picked)
    await pickExercisePhoto('library')
    expect(mockPicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ quality: 1 }))
  })

  it('decodes straight to the upload size and saves a JPEG, freeing the native images', async () => {
    mockPicker.launchCameraAsync.mockResolvedValue(picked)
    const out = await pickExercisePhoto('camera')

    expect(mockManipulate).toHaveBeenCalledWith('file:///IMG_0001.HEIC', { maxWidth: PHOTO_LONG_EDGE, maxHeight: PHOTO_LONG_EDGE })
    expect(mockImage.saveAsync).toHaveBeenCalledWith({ compress: PHOTO_QUALITY, format: 'jpeg' })
    expect(out).toEqual({ status: 'picked', photo: { uri: 'file:///out.jpg', name: 'photo.jpg', type: 'image/jpeg' } })
    expect(mockImage.release).toHaveBeenCalled()
    expect(mockContext.release).toHaveBeenCalled()
  })

  it('frees the native images when saving fails', async () => {
    mockPicker.launchImageLibraryAsync.mockResolvedValue(picked)
    mockImage.saveAsync.mockRejectedValueOnce(new Error('disk full'))
    await expect(pickExercisePhoto('library')).rejects.toThrow('disk full')
    expect(mockImage.release).toHaveBeenCalled()
    expect(mockContext.release).toHaveBeenCalled()
  })

  it('reports a cancel and a refused permission without touching the image', async () => {
    mockPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null })
    expect(await pickExercisePhoto('library')).toEqual({ status: 'cancelled' })
    mockPicker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false })
    expect(await pickExercisePhoto('camera')).toEqual({ status: 'denied', source: 'camera' })
    expect(mockManipulate).not.toHaveBeenCalled()
  })
})
