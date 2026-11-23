import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { AccessibilityInfo, Linking, Platform } from 'react-native'
import type { Exercise } from '@lyftr/shared'

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) }
let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a), back: () => mockRouter.back(), replace: (...a: unknown[]) => mockRouter.replace(...a),
    canGoBack: () => mockRouter.canGoBack(),
  },
  useLocalSearchParams: () => mockParams,
  usePreventRemove: () => () => {},
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  SafeAreaView: ({ children }: { children: unknown }) => children,
}))
// The figures are SVG; stand-ins with two tappable regions keep this about what a tap does.
jest.mock('react-native-body-highlighter', () => {
  const { Pressable, View } = require('react-native')
  return {
    __esModule: true,
    default: ({ side, onBodyPartPress }: { side: string; onBodyPartPress: (p: { slug: string }) => void }) => (
      <View>
        {['chest', 'hamstring', 'head'].map((slug) => (
          <Pressable key={slug} accessibilityLabel={`${side}-${slug}`} onPress={() => onBodyPartPress({ slug })} />
        ))}
      </View>
    ),
  }
})

let mockPhotos = false
jest.mock('@lyftr/shared', () => {
  const actual = jest.requireActual('@lyftr/shared')
  return { ...actual, customExercisePhotos: () => mockPhotos }
})
const mockPick = jest.fn()
jest.mock('../../lib/exercisePhoto', () => ({
  cameraSupported: true,
  uploadPart: (p: { uri: string }) => ({ uri: p.uri }),
  pickExercisePhoto: (...a: unknown[]) => mockPick(...a),
}))

let mockInfo: unknown = null
jest.mock('../../lib/lyftr', () => {
  const actual = jest.requireActual('../../lib/lyftr')
  return { ...actual, useServerInfo: () => mockInfo }
})
import { client } from '../../lib/lyftr'
import { hasExerciseCreate, requestExerciseCreate } from '../../lib/exerciseCreateRequests'
import { CustomExerciseForm } from './CustomExerciseForm'

const saved: Exercise = {
  id: 7, name: 'Soleus Slouch', muscle_group: 'calves', secondary_muscles: [], category: 'strength',
  equipment: 'body-only', description: '', is_custom: true,
}

beforeEach(() => {
  mockPhotos = false
  mockInfo = null
  mockPick.mockReset()
  mockParams = { name: '  Soleus Slouch ' }
  Object.values(mockRouter).forEach((f) => f.mockClear())
  mockRouter.canGoBack.mockReturnValue(true)
})
afterEach(() => { jest.restoreAllMocks() })

const renderCreate = async () => { await render(<CustomExerciseForm mode="create" base="/workouts" />) }
// Two pickers on the page, main muscle first: each has its own Map/List switch.
const listButtons = () => screen.getAllByRole('button', { name: 'List' })
const pickFromList = async (name: RegExp = /^calves$/i) => {
  await fireEvent.press(listButtons()[0])
  await fireEvent.press(screen.getByRole('radio', { name }))
}
const pressCreate = (label = 'Create') => fireEvent.press(screen.getByRole('button', { name: label }))

describe('CustomExerciseForm', () => {
  it('pre-fills the trimmed name and says only the user can see it', async () => {
    await renderCreate()
    expect(screen.getByDisplayValue('Soleus Slouch')).toBeTruthy()
    expect(screen.getByText('New exercise')).toBeTruthy()
    expect(screen.getByText('Only you can see it.')).toBeTruthy()
  })

  it('without a muscle shows the inline error and does not call the API', async () => {
    const create = jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    await renderCreate()
    await pressCreate()
    expect(screen.getByText('Pick the main muscle.')).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it('without a name shows the inline error', async () => {
    mockParams = { name: '   ' }
    const create = jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    await renderCreate()
    await pickFromList()
    await pressCreate()
    expect(screen.getByText('Give the exercise a name.')).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it('Create with nothing filled in says what is missing, in words a screen reader is given too', async () => {
    mockParams = {}
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    await renderCreate()
    await pressCreate()
    expect(screen.getByText('Give the exercise a name.')).toBeTruthy()
    expect(announce).toHaveBeenCalledWith('Give the exercise a name.')
    // The muscle's error is below the fold, so the bar beside Create points at it as well.
    expect(screen.getAllByText('Pick the main muscle.')).toHaveLength(2)
    // The main muscle's "nothing picked" gives way to its message; the other muscles wait for it.
    expect(screen.queryByText('Nothing picked yet')).toBeNull()
    expect(screen.getByText('Pick the main muscle first, then tap any others it works')).toBeTruthy()
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Soleus Slouch'), 'Soleus Slouch')
    await pressCreate()
    expect(screen.getByText('Pick the main muscle.')).toBeTruthy()
    expect(announce).toHaveBeenLastCalledWith('Pick the main muscle.')
    expect(screen.queryByText('Nothing picked yet')).toBeNull()
  })

  it('Cancel sits beside Create and leaves like Back', async () => {
    await renderCreate()
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockRouter.back).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy()
  })

  it('every field is on the page at once: optional ones unmarked, required ones starred and explained', async () => {
    await renderCreate()
    for (const label of ['Name', 'Main muscle', 'Other muscles', 'Equipment', 'Category', 'Instructions']) expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    expect(screen.queryByText(/optional/i)).toBeNull()
    expect(screen.queryByText(/More details/)).toBeNull()
    expect(screen.getByText('Required')).toBeTruthy()
    expect(screen.getAllByLabelText('required')).toHaveLength(2)
    expect(screen.getByRole('radio', { name: 'Stretching' })).toBeTruthy()
  })

  it('Instructions are one text box, kept as typed: each line an entry, blank lines dropped, numbering left alone', async () => {
    const create = jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    await renderCreate()
    expect(screen.getByText('One step per line')).toBeTruthy()
    // Blank lines are dropped; what is on each line is the user's, numbering included.
    await fireEvent.changeText(screen.getByLabelText('Instructions'), '1. Stand tall\n\n  Press up  \n')
    await pickFromList()
    await pressCreate()
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      instructions: ['1. Stand tall', 'Press up'], description: '1. Stand tall\nPress up',
    })))
  })

  it('says so under the box when there are more than 30 steps, and does not save', async () => {
    const create = jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    await renderCreate()
    await fireEvent.changeText(screen.getByLabelText('Instructions'), Array.from({ length: 31 }, (_, i) => `Step ${i + 1}`).join('\n'))
    await pickFromList()
    await pressCreate()
    expect(await screen.findByText('An exercise can have up to 30 steps.')).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it('with no steps written, an empty list and an empty description are sent', async () => {
    const create = jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    await renderCreate()
    await pickFromList()
    await pressCreate()
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ instructions: [], description: '' })))
  })

  it('a name with a control character is refused before anything is sent', async () => {
    const create = jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    await renderCreate()
    await pickFromList()
    await fireEvent.changeText(screen.getByDisplayValue('Soleus Slouch'), 'Soleus\u0007 Slouch')
    await pressCreate()
    expect(screen.getByText("Names can't contain control characters.")).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  // Both pickers draw figures; the main muscle's come first.
  const region = (label: string, n = 0) => screen.getAllByLabelText(label, { hidden: true })[n]

  it('tapping a body region picks that muscle, and the chip under the map says so', async () => {
    await renderCreate()
    // Only the main muscle's map is live; the other muscles' waits, dimmed, for it.
    expect(screen.getAllByText('Nothing picked yet')).toHaveLength(1)
    expect(screen.getByText('Pick the main muscle first, then tap any others it works')).toBeTruthy()
    await fireEvent.press(region('back-hamstring'))
    expect(screen.getByText('Hamstrings')).toBeTruthy()
    // Now the other muscles open, with nothing picked there yet.
    expect(screen.getAllByText('Nothing picked yet')).toHaveLength(1)
    expect(screen.getByText('Tap any others it works, up to 10')).toBeTruthy()
    await fireEvent.press(region('front-chest'))
    expect(screen.getByText('Chest')).toBeTruthy()
  })

  it('a region that is not a muscle selects nothing', async () => {
    await renderCreate()
    await fireEvent.press(region('front-head'))
    expect(screen.getAllByText('Nothing picked yet')).toHaveLength(1)
    expect(screen.getByText('Pick the main muscle first, then tap any others it works')).toBeTruthy()
  })

  it('tapping the other muscles\' figure adds a removable chip; the main muscle is not one of them', async () => {
    const create = jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    await renderCreate()
    await fireEvent.press(region('front-chest'))
    await fireEvent.press(region('front-chest', 1))
    expect(screen.getByText('Chest is already the main muscle.')).toBeTruthy()
    await fireEvent.press(region('back-hamstring', 1))
    expect(screen.getByRole('button', { name: 'Remove Hamstrings' })).toBeTruthy()
    await pressCreate()
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ muscle_group: 'chest', secondary_muscles: ['hamstrings'] })))
  })

  it('List shows every muscle the catalog uses as a Title Case radio under its region, and picks it', async () => {
    await renderCreate()
    await fireEvent.press(listButtons()[0])
    expect(screen.getByText('Chest & shoulders')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Lower Back' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Full Body' })).toBeNull()
    await fireEvent.press(screen.getByRole('radio', { name: 'Middle Back' }))
    expect(screen.getByRole('radio', { name: 'Middle Back', checked: true })).toBeTruthy()
  })

  it('creates with body-only equipment by default; with a request it hands the exercise back and goes back', async () => {
    const onCreated = jest.fn()
    mockParams = { name: 'Soleus Slouch', request: requestExerciseCreate(onCreated) }
    const create = jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    await renderCreate()
    await pickFromList()
    await pressCreate('Create and add')
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(saved))
    expect(mockRouter.back).toHaveBeenCalledTimes(1)
    expect(mockRouter.replace).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Soleus Slouch', muscle_group: 'calves', equipment: 'body-only', category: 'strength',
    }))
  })

  it('without a request it opens the new exercise in its own tab', async () => {
    jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    await renderCreate()
    await pickFromList()
    await pressCreate()
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/workouts/exercise/7'))
    expect(mockRouter.back).not.toHaveBeenCalled()
  })

  it('a request nobody is left to answer (page reloaded) opens the exercise instead of going back', async () => {
    mockParams = { name: 'Soleus Slouch', request: 'create-gone' }
    jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    await renderCreate()
    await pickFromList()
    expect(screen.queryByRole('button', { name: 'Create and add' })).toBeNull()
    await pressCreate()
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/workouts/exercise/7'))
  })

  it('Enter in the name field saves on the web, and only once a muscle is picked', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const create = jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    await renderCreate()
    await fireEvent(screen.getByDisplayValue('Soleus Slouch'), 'submitEditing')
    // Shown, and repeated in the hidden live region the web reads aloud.
    expect(screen.getAllByText('Pick the main muscle.').length).toBeGreaterThan(0)
    expect(create).not.toHaveBeenCalled()

    await pickFromList()
    await fireEvent(screen.getByDisplayValue('Soleus Slouch'), 'submitEditing')
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  })

  it('Done on a phone only puts the keyboard away', async () => {
    const create = jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    await renderCreate()
    await pickFromList()
    await fireEvent(screen.getByDisplayValue('Soleus Slouch'), 'submitEditing')
    expect(create).not.toHaveBeenCalled()
  })

  it('keeps a server error on the page, next to the button', async () => {
    jest.spyOn(client.exerciseAPI, 'create').mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { error: 'taken', code: 'EXERCISE_NAME_TAKEN' } },
    })
    await renderCreate()
    await pickFromList()
    await pressCreate()
    expect(await screen.findByText(/already|taken|Couldn't save/i)).toBeTruthy()
    expect(mockRouter.back).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy()
  })

  it('offers catalog near matches; Use this hands the tapped one back like a pick', async () => {
    const onCreated = jest.fn()
    mockParams = { name: 'Soleus', request: requestExerciseCreate(onCreated) }
    const raise: Exercise = { ...saved, id: 1, name: 'Soleus Raise', is_custom: false }
    jest.spyOn(client.exerciseAPI, 'list').mockResolvedValue([raise])
    await renderCreate()
    await fireEvent.press(await screen.findByRole('button', { name: 'Use Soleus Raise' }, { timeout: 2000 }))
    expect(screen.getByText('Already in the catalog')).toBeTruthy()
    expect(onCreated).toHaveBeenCalledWith(raise)
    expect(mockRouter.back).toHaveBeenCalled()
  })

  it('other muscles come from their own body map list; the main muscle is shown there but not choosable', async () => {
    jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    await renderCreate()
    await pickFromList()
    await fireEvent.press(screen.getByRole('radio', { name: 'Stretching' }))
    await fireEvent.press(listButtons()[1])
    expect(screen.getByRole('checkbox', { name: 'Calves (main muscle)', disabled: true })).toBeTruthy()
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Hamstrings' }))
    await pressCreate()
    await waitFor(() => expect(client.exerciseAPI.create).toHaveBeenCalledWith(expect.objectContaining({
      category: 'stretching', secondary_muscles: ['hamstrings'],
    })))
  })

  it('picking equipment from the grid is a radio choice', async () => {
    jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    await renderCreate()
    await pickFromList()
    expect(screen.getByRole('radio', { name: 'Bodyweight', checked: true })).toBeTruthy()
    await fireEvent.press(screen.getByRole('radio', { name: 'Barbell' }))
    expect(screen.getByRole('radio', { name: 'Barbell', checked: true })).toBeTruthy()
    await pressCreate()
    await waitFor(() => expect(client.exerciseAPI.create).toHaveBeenCalledWith(expect.objectContaining({ equipment: 'barbell' })))
  })
})

describe('CustomExerciseForm edge cases', () => {
  it('two creates from one form send the same client_id; a new form gets another', async () => {
    const create = jest.spyOn(client.exerciseAPI, 'create')
      .mockRejectedValueOnce(new Error('lost'))
      .mockResolvedValue(saved)
    const { unmount } = await render(<CustomExerciseForm mode="create" base="/workouts" />)
    await pickFromList()
    await pressCreate()
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    await waitFor(async () => { await pressCreate(); expect(create).toHaveBeenCalledTimes(2) })
    const [a, b] = create.mock.calls.map((c) => (c[0] as { client_id?: string }).client_id)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(b).toBe(a)
    await unmount()
    await renderCreate()
    await pickFromList()
    await pressCreate()
    await waitFor(() => expect(create).toHaveBeenCalledTimes(3))
    expect((create.mock.calls[2][0] as { client_id?: string }).client_id).not.toBe(a)
  })

  it('does not truncate pasted instructions, and says under the box when they are too long', async () => {
    const create = jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    await renderCreate()
    const box = screen.getByLabelText('Instructions')
    expect(box.props.maxLength).toBeUndefined()
    const pasted = Array.from({ length: 30 }, () => 'x'.repeat(78)).join('\n')
    await fireEvent.changeText(box, pasted)
    expect(screen.getByLabelText('Instructions').props.value).toBe(pasted)
    await pickFromList()
    await pressCreate()
    expect(await screen.findByText(/must be 2000 characters or fewer/)).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it('sends a name and steps with tabs as spaces and invisible characters removed', async () => {
    const create = jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    await renderCreate()
    await fireEvent.changeText(screen.getByDisplayValue('Soleus Slouch'), 'So\u200Bleus\tSlouch\uFEFF')
    await fireEvent.changeText(screen.getByLabelText('Instructions'), 'Stand\ttall\n\t\nPress')
    await pickFromList()
    await pressCreate()
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Soleus Slouch', instructions: ['Stand tall', 'Press'], description: 'Stand tall\nPress',
    })))
  })

  it('on a server without custom exercises says so instead of showing the form', async () => {
    mockInfo = { name: 'lyftr', version: '0.1.0' }
    await renderCreate()
    expect(screen.getByText("This server can't save your own exercises")).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Go back' }))
    expect(mockRouter.back).toHaveBeenCalled()
  })
})

describe('CustomExerciseForm edit', () => {
  const existing: Exercise = { ...saved, equipment: 'dumbbell', category: 'stretching', secondary_muscles: ['hamstrings'], description: 'Slow', instructions: ['Slow', 'Hold'] }
  const renderEdit = async (ex: Exercise = existing) => {
    mockParams = { exerciseId: '7' }
    jest.spyOn(client.exerciseAPI, 'get').mockResolvedValue(ex)
    await render(<CustomExerciseForm mode="edit" base="/programs" />)
  }

  it('loads the exercise, prefills, and sends the full body to update, then goes back', async () => {
    const update = jest.spyOn(client.exerciseAPI, 'update').mockResolvedValue(saved)
    await renderEdit()
    expect(await screen.findByText('Edit exercise')).toBeTruthy()
    expect(screen.getByDisplayValue('Slow\nHold')).toBeTruthy()
    expect(screen.getByText('Calves')).toBeTruthy()
    await pressCreate('Save')
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled())
    expect(update).toHaveBeenCalledWith(7, {
      name: 'Soleus Slouch', muscle_group: 'calves', equipment: 'dumbbell', category: 'stretching',
      secondary_muscles: ['hamstrings'], instructions: ['Slow', 'Hold'], description: 'Slow\nHold',
    })
  })

  it('a row holding slugs the form no longer offers starts from what it offers, and asks for the main muscle again', async () => {
    const update = jest.spyOn(client.exerciseAPI, 'update').mockResolvedValue(saved)
    await renderEdit({ ...existing, muscle_group: 'full-body', equipment: 'none', category: 'yoga', secondary_muscles: ['abs', 'hamstrings'] })
    expect(await screen.findByText('Edit exercise')).toBeTruthy()
    await pressCreate('Save')
    expect(screen.getByText('Pick the main muscle.')).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
    await pickFromList()
    await pressCreate('Save')
    await waitFor(() => expect(update).toHaveBeenCalledWith(7, expect.objectContaining({
      muscle_group: 'calves', equipment: 'body-only', category: 'strength', secondary_muscles: ['hamstrings'],
    })))
  })

  it('refuses an exercise that is not the user\'s own', async () => {
    await renderEdit({ ...existing, is_custom: false })
    expect(await screen.findByText('Only your own exercises can be edited.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('says so, with a retry, when the exercise cannot be loaded', async () => {
    mockParams = { exerciseId: '7' }
    jest.spyOn(client.exerciseAPI, 'get').mockRejectedValue(new Error('boom'))
    await render(<CustomExerciseForm mode="edit" base="/workouts" />)
    expect(await screen.findByText("Couldn't open the exercise")).toBeTruthy()
    expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy()
  })

  it('leaving the page lets its pending request go, but a saved one is already resolved', async () => {
    const onCreated = jest.fn()
    mockParams = { name: 'X', request: requestExerciseCreate(onCreated) }
    const view = await render(<CustomExerciseForm mode="create" base="/workouts" />)
    await fireEvent.press(screen.getByRole('button', { name: 'Go back' }))
    expect(mockRouter.back).toHaveBeenCalled()
    expect(hasExerciseCreate(mockParams.request)).toBe(true)
    await view.unmount()
    await waitFor(() => expect(hasExerciseCreate(mockParams.request)).toBe(false))
    expect(onCreated).not.toHaveBeenCalled()
  })
})

describe('CustomExerciseForm photo', () => {
  const staged = { uri: 'file:///p.jpg', name: 'photo.jpg', type: 'image/jpeg' as const }
  const withPhoto: Exercise = { ...saved, photo_id: 'abc' }

  const fill = async () => {
    await pickFromList()
    await fireEvent.press(screen.getByRole('button', { name: 'Add photo' }))
    await fireEvent.press(await screen.findByText('Choose photo'))
    await screen.findByText('Photo ready. It uploads when you save.')
    await pressCreate()
  }

  it('has no photo slot on a server without photos', async () => {
    await renderCreate()
    expect(screen.queryByRole('button', { name: 'Add photo' })).toBeNull()
  })

  it('shows the slot first and uploads the chosen photo after create', async () => {
    mockPhotos = true
    mockPick.mockResolvedValue({ status: 'picked', photo: staged })
    jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    const upload = jest.spyOn(client.exerciseAPI, 'uploadPhoto').mockResolvedValue(withPhoto)
    await renderCreate()
    await fill()
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/workouts/exercise/7'))
    expect(upload).toHaveBeenCalledWith(7, { uri: 'file:///p.jpg' })
    expect(screen.getByRole('button', { name: 'Change photo' })).toBeTruthy()
  })

  it('keeps the exercise when the upload fails: error on the page, retry works', async () => {
    mockPhotos = true
    mockPick.mockResolvedValue({ status: 'picked', photo: staged })
    const create = jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    const upload = jest.spyOn(client.exerciseAPI, 'uploadPhoto')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(withPhoto)
    await renderCreate()
    await fill()
    expect(await screen.findByText(/The exercise was saved, but its photo didn't upload\./)).toBeTruthy()
    expect(mockRouter.replace).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/workouts/exercise/7'))
    expect(create).toHaveBeenCalledTimes(1)
    expect(upload).toHaveBeenCalledTimes(2)
  })

  it('after the photo fails the fields are inert, leaving only Try again and Skip', async () => {
    mockPhotos = true
    mockPick.mockResolvedValue({ status: 'picked', photo: staged })
    jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    jest.spyOn(client.exerciseAPI, 'uploadPhoto').mockRejectedValue(new Error('boom'))
    await renderCreate()
    await fill()
    await screen.findByText(/The exercise was saved/)
    expect(screen.getByLabelText('Instructions').props.editable).toBe(false)
    expect(screen.getByDisplayValue('Soleus Slouch').props.editable).toBe(false)
    const wrapper = screen.getByLabelText('Instructions').parent!.parent!
    let node: typeof wrapper | null = wrapper
    let inert = false
    while (node) { if (node.props.pointerEvents === 'none' && node.props.accessibilityState?.disabled) inert = true; node = node.parent }
    expect(inert).toBe(true)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeTruthy()
  })

  it('a refused permission offers Open settings, which opens them', async () => {
    mockPhotos = true
    mockPick.mockResolvedValue({ status: 'denied', source: 'camera' })
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue()
    await renderCreate()
    await fireEvent.press(screen.getByRole('button', { name: 'Add photo' }))
    await fireEvent.press(await screen.findByText('Take photo'))
    await fireEvent.press(await screen.findByRole('button', { name: 'Open settings' }))
    expect(open).toHaveBeenCalled()
  })

  it('Skip carries on with the saved exercise, without a photo', async () => {
    mockPhotos = true
    mockPick.mockResolvedValue({ status: 'picked', photo: staged })
    jest.spyOn(client.exerciseAPI, 'create').mockResolvedValue(saved)
    jest.spyOn(client.exerciseAPI, 'uploadPhoto').mockRejectedValue(new Error('boom'))
    await renderCreate()
    await fill()
    await fireEvent.press(await screen.findByRole('button', { name: 'Skip for now' }))
    expect(mockRouter.replace).toHaveBeenCalledWith('/workouts/exercise/7')
  })

  it('explains a refused permission and stages nothing', async () => {
    mockPhotos = true
    mockPick.mockResolvedValue({ status: 'denied', source: 'camera' })
    await renderCreate()
    await fireEvent.press(screen.getByRole('button', { name: 'Add photo' }))
    await fireEvent.press(await screen.findByText('Take photo'))
    expect(await screen.findByText(/can't use the camera/)).toBeTruthy()
    expect(screen.queryByText('Photo ready. It uploads when you save.')).toBeNull()
  })

  it('removes an existing photo on save in edit mode', async () => {
    mockPhotos = true
    mockParams = { exerciseId: '7' }
    jest.spyOn(client.exerciseAPI, 'get').mockResolvedValue(withPhoto)
    jest.spyOn(client.exerciseAPI, 'photo').mockResolvedValue(new Blob(['x']))
    const update = jest.spyOn(client.exerciseAPI, 'update').mockResolvedValue(withPhoto)
    const del = jest.spyOn(client.exerciseAPI, 'deletePhoto').mockResolvedValue(saved)
    await render(<CustomExerciseForm mode="edit" base="/workouts" />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Change photo' }))
    await fireEvent.press(await screen.findByText('Remove photo'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add photo' })).toBeTruthy(), { timeout: 2000 })
    await pressCreate('Save')
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled())
    expect(update).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith(7)
  })
})
