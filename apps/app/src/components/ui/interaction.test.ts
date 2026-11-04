import { readFileSync } from 'fs'
import { join } from 'path'
import { interactive } from './interaction'

const css = readFileSync(join(__dirname, '../../../global.css'), 'utf8')

function block(selector: string): Record<string, number[]> {
  const start = css.indexOf(`${selector} {`)
  const body = css.slice(start, css.indexOf('}', start))
  const vars: Record<string, number[]> = {}
  for (const m of body.matchAll(/--([a-z-]+):\s*(\d+) (\d+) (\d+);/g)) vars[m[1]] = [m[2], m[3], m[4]].map(Number)
  return vars
}

function luminance([r, g, b]: number[]) {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

function contrast(a: number[], b: number[]) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// WCAG 1.4.11: a focus indicator needs 3:1 against what it sits on. The ring is drawn on
// (offset) or inside (inset) every surface, so it is held to all of them in both themes.
describe.each([':root', '.dark:root'])('focus ring in %s', (selector) => {
  const vars = block(selector)
  const surfaces = Object.keys(vars).filter((k) => k.startsWith('surface-'))

  it.each(surfaces)('is at least 3:1 against --%s', (surface) => {
    expect(vars['focus-ring']).toBeDefined()
    expect(contrast(vars['focus-ring'], vars[surface])).toBeGreaterThanOrEqual(3)
  })
})

describe('interactive', () => {
  it('adds nothing on native, which keeps its own press feedback', () => {
    expect(interactive('hover:bg-surface-muted')).toBe('')
  })
})
