import { EDGE, placeOverlay, typeaheadIndex } from './overlay'

const viewport = { width: 1000, height: 800 }
const box = { width: 200, height: 100 }
const anchorAt = (top: number, left = 400) => ({ top, left, width: 40, height: 30 })

describe('placeOverlay', () => {
  it('keeps the preferred side when it fits', () => {
    expect(placeOverlay(anchorAt(400), box, viewport, 'bottom', 'start', 6)).toEqual({ top: 436, left: 400, side: 'bottom' })
    expect(placeOverlay(anchorAt(400), box, viewport, 'top', 'start', 6)).toEqual({ top: 294, left: 400, side: 'top' })
  })

  it('flips at the bottom edge and at the top edge', () => {
    expect(placeOverlay(anchorAt(740), box, viewport, 'bottom', 'start').side).toBe('top')
    expect(placeOverlay(anchorAt(20), box, viewport, 'top', 'start').side).toBe('bottom')
  })

  it('takes the roomier side when neither fits', () => {
    const tall = { width: 200, height: 700 }
    expect(placeOverlay(anchorAt(500), tall, viewport, 'bottom', 'start').side).toBe('top')
    expect(placeOverlay(anchorAt(200), tall, viewport, 'top', 'start').side).toBe('bottom')
  })

  it('aligns to the anchor and stays inside the viewport horizontally', () => {
    expect(placeOverlay(anchorAt(400), box, viewport, 'bottom', 'end').left).toBe(240)
    expect(placeOverlay(anchorAt(400), box, viewport, 'bottom', 'center').left).toBe(320)
    expect(placeOverlay(anchorAt(400, 980), box, viewport, 'bottom', 'start').left).toBe(1000 - EDGE - 200)
    expect(placeOverlay(anchorAt(400, 0), box, viewport, 'bottom', 'end').left).toBe(EDGE)
  })
})

describe('typeaheadIndex', () => {
  const labels = ['Edit', 'Delete', 'Done', 'Save']

  it('moves to the next label with that first letter, wrapping, any case', () => {
    expect(typeaheadIndex(labels, 0, 'd')).toBe(1)
    expect(typeaheadIndex(labels, 1, 'D')).toBe(2)
    expect(typeaheadIndex(labels, 2, 'd')).toBe(1)
    expect(typeaheadIndex(labels, 3, 'e')).toBe(0)
  })

  it('stays put when nothing matches', () => {
    expect(typeaheadIndex(labels, 0, 'x')).toBe(-1)
  })
})
