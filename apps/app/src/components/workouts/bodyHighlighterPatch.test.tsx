import { render } from '@testing-library/react-native'
import { Platform } from 'react-native'
import Body from 'react-native-body-highlighter'

// patches/react-native-body-highlighter+3.2.0.patch is why the body map logs nothing on web:
// the library set accessible={true} on its <Svg>/<Path> and gave every region an onPress, and
// react-native-svg forwards both onto DOM nodes ("non-boolean attribute accessible", unknown
// responder handlers). The production export hides those dev warnings, so the e2e console
// check cannot see them; this pins the patch instead. If an upgrade drops it, this fails.
type Node = { props?: Record<string, unknown>; children?: unknown[] | null }
// Every rendered host node's props, from the JSON tree (what the renderer would hand the DOM).
const allProps = async (el: React.ReactElement) => {
  const tree = (await render(el)).toJSON() as Node | Node[] | null
  const out: Record<string, unknown>[] = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach(walk); return }
    const node = n as Node
    if (node.props) out.push(node.props)
    ;(node.children ?? []).forEach(walk)
  }
  walk(tree)
  return out
}
// react-native-svg renders a Path's id as `name` on native.
const regions = (props: Record<string, unknown>[], id: string) => props.filter((p) => p.id === id || p.name === id)

describe('react-native-body-highlighter patch', () => {
  const original = Platform.OS
  afterEach(() => { Platform.OS = original })

  it('puts no accessible prop on the figure', async () => {
    const props = await allProps(<Body data={[]} side="front" />)
    expect(props.length).toBeGreaterThan(10)
    expect(props.filter((p) => p.accessible === true)).toEqual([])
  })

  it('gives regions no press handler without onBodyPartPress', async () => {
    const chest = regions(await allProps(<Body data={[]} side="front" />), 'chest')
    expect(chest.length).toBeGreaterThan(0)
    expect(chest.filter((p) => p.onPress || p.onClick || p.onStartShouldSetResponder)).toEqual([])
  })

  it('presses on native when asked to, and never on web (the picker reads the click itself)', async () => {
    const onPress = jest.fn()
    const native = regions(await allProps(<Body data={[]} side="front" onBodyPartPress={onPress} />), 'chest')
    expect(native.some((p) => p.onPress || p.onStartShouldSetResponder || p.onClick)).toBe(true)

    Platform.OS = 'web'
    const web = regions(await allProps(<Body data={[]} side="front" onBodyPartPress={onPress} />), 'chest')
    expect(web.length).toBeGreaterThan(0)
    expect(web.filter((p) => p.onPress || p.onClick || p.onStartShouldSetResponder)).toEqual([])
  })
})
