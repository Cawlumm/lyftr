import { describe, it, expect } from 'vitest'
import { formatVersion } from './version'

describe('formatVersion', () => {
  it('collapses a git-describe ahead-of-tag string to tag + short commit', () => {
    expect(formatVersion('v0.1.0-beta.1-7-ge49ba2e')).toBe('v0.1.0-beta.1 (e49ba2e)')
    expect(formatVersion('v1.2.3-2-gabc1234')).toBe('v1.2.3 (abc1234)')
  })

  it('leaves an exact tag unchanged', () => {
    expect(formatVersion('v0.1.0-beta.1')).toBe('v0.1.0-beta.1')
    expect(formatVersion('v1.2.3')).toBe('v1.2.3')
  })

  it('leaves a bare commit SHA or dev string unchanged', () => {
    expect(formatVersion('e49ba2e')).toBe('e49ba2e')
    expect(formatVersion('dev')).toBe('dev')
  })
})
