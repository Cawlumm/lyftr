import { exerciseThumbUrl } from './exerciseThumb'

const ID = '48fe6ee6-f6e4-4d8b-9be5-a235eb8ca7e5'
const OEDB = `https://oedb-api-o4dqddih5q-uk.a.run.app/api/v1/images/${ID}`

describe('exerciseThumbUrl', () => {
  it('points an oedb image at the server it is talking to', () => {
    expect(exerciseThumbUrl(OEDB, 'http://100.106.145.44:3000')).toBe(
      `http://100.106.145.44:3000/api/v1/media/exercise-thumbs/${ID}`,
    )
  })

  it('stays same-origin when no server is stored (web behind nginx)', () => {
    expect(exerciseThumbUrl(OEDB, '')).toBe(`/api/v1/media/exercise-thumbs/${ID}`)
  })

  it('normalises the stored server like the client does', () => {
    expect(exerciseThumbUrl(OEDB, 'https://lyftr.example.com/some/path/')).toBe(
      `https://lyftr.example.com/api/v1/media/exercise-thumbs/${ID}`,
    )
  })

  it('works for any oedb origin, including the e2e stub', () => {
    expect(exerciseThumbUrl(`http://localhost:8090/api/v1/images/${ID}`, '')).toBe(`/api/v1/media/exercise-thumbs/${ID}`)
  })

  it('leaves anything that is not an oedb image alone', () => {
    for (const url of [undefined, '', 'https://example.com/photo.jpg', `${OEDB}?w=96`, `${OEDB}/extra`, OEDB.toUpperCase()]) {
      expect(exerciseThumbUrl(url, 'http://h:3000')).toBeUndefined()
    }
  })
})
