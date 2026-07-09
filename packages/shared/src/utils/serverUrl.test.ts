import { normalizeServerUrl } from './serverUrl'

describe('normalizeServerUrl', () => {
  it('empty input -> empty (default backend)', () => {
    expect(normalizeServerUrl('')).toBe('')
    expect(normalizeServerUrl('   ')).toBe('')
  })

  it('keeps a valid absolute origin and strips the path', () => {
    expect(normalizeServerUrl('http://192.168.1.10:3000')).toBe('http://192.168.1.10:3000')
    expect(normalizeServerUrl('https://lyftr.example.com/api/v1')).toBe('https://lyftr.example.com')
  })

  it('rejects scheme-less / whitespace / garbage', () => {
    expect(normalizeServerUrl('192.168.1.10:3000')).toBe('') // no scheme
    expect(normalizeServerUrl('ftp://x')).toBe('')            // wrong scheme
    expect(normalizeServerUrl('has space')).toBe('')
  })
})
