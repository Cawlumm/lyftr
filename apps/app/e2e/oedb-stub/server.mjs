// A stand-in for open-exercise-db, so the e2e stack never calls the hosted one.
//
// Every e2e boot used to sync the whole catalog from production oedb and every browser loaded
// its exercise images from there: tens of thousands of requests a day against a database on
// a metered free tier. This serves catalog.json (a recorded subset, see record.mjs) with the
// same paths, JSON shape, Cache-Control and ETag/304 behaviour the backend's client relies on.
// Search is a plain substring match, not oedb's ranking: the specs need hits, not an order.
//
// No dependencies: node:*-alpine runs it from a bind mount (apps/app/e2e/oedb-stub/compose.yml).
import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const PORT = Number(process.env.PORT || 8090)
// Image URLs are written absolute, against this origin, because the browser loads them and
// cannot resolve the compose service name the backend uses. Unset, they stay relative.
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '')
const MAX_PER_PAGE = 100

const raw = readFileSync(new URL('./catalog.json', import.meta.url), 'utf8')
if (raw.includes('.run.app')) throw new Error('catalog.json names the hosted oedb; re-record it')
const catalog = JSON.parse(raw)

const withImages = (e) => ({
  ...e,
  images: e.images.map((img) => ({ ...img, url: PUBLIC_URL + img.url })),
})
const english = catalog.exercises.map(withImages)
const byId = new Map(english.map((e) => [e.id, e]))

// A locale the fixture has no row for is answered in English, field by field, as oedb does.
function localized(e, locale) {
  const t = catalog.translations[locale]?.[e.id]
  return t ? { ...e, translation: t } : e
}

// A 1x1 transparent PNG: what the specs need from an image is that it loads.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

function send(req, res, status, body, maxAge = 300) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))
  const etag = `"${createHash('md5').update(buf).digest('hex')}"`
  res.setHeader('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=86400`)
  res.setHeader('ETag', etag)
  if (status === 200 && req.headers['if-none-match'] === etag) {
    res.writeHead(304).end()
    return 304
  }
  res.writeHead(status, { 'Content-Type': Buffer.isBuffer(body) ? 'image/png' : 'application/json' }).end(buf)
  return status
}

function list(req, res, q) {
  const perPage = Number(q.get('per_page') || 20)
  if (!(perPage >= 1 && perPage <= MAX_PER_PAGE)) return send(req, res, 422, { detail: 'per_page must be 1-100' })
  const page = Math.max(1, Number(q.get('page') || 1))
  const locale = q.get('locale') || 'en'
  const ids = q.get('ids')?.split(',')
  const terms = (q.get('q') || '').toLowerCase().split(/\s+/).filter(Boolean)
  const eq = (field) => (e) => !q.get(field) || e[field] === q.get(field)
  const hits = english
    .filter((e) => !ids || ids.includes(e.id))
    .filter(eq('muscle_group')).filter(eq('category')).filter(eq('equipment'))
    .map((e) => localized(e, locale))
    .filter((e) => {
      const text = [e.translation.name, ...e.translation.aliases, byId.get(e.id).translation.name].join(' ').toLowerCase()
      return terms.every((t) => text.includes(t))
    })
  const start = (page - 1) * perPage
  return send(req, res, 200, { exercises: hits.slice(start, start + perPage), total: hits.length, page, per_page: perPage })
}

function route(req, res) {
  const url = new URL(req.url, 'http://stub')
  const path = url.pathname
  if (req.method !== 'GET') return send(req, res, 405, { detail: 'GET only' })
  if (path === '/health') return send(req, res, 200, { ok: true }, 0)
  if (path === '/api/v1/meta/locales') {
    return send(req, res, 200, { locales: catalog.locales.map((code) => ({ code })), total: catalog.locales.length, page: 1, per_page: MAX_PER_PAGE })
  }
  if (path === '/api/v1/exercises/export') {
    return send(req, res, 200, { exercises: english, total: english.length, generated_at: new Date(0).toISOString() }, 900)
  }
  if (path === '/api/v1/exercises') return list(req, res, url.searchParams)
  let m = path.match(/^\/api\/v1\/exercises\/([^/]+)$/)
  if (m) {
    const e = byId.get(decodeURIComponent(m[1]))
    return e ? send(req, res, 200, localized(e, url.searchParams.get('locale') || 'en')) : send(req, res, 404, { detail: 'not found' })
  }
  m = path.match(/^\/api\/v1\/images\/[^/]+$/)
  if (m) return send(req, res, 200, PNG, 86400)
  return send(req, res, 404, { detail: 'not found' })
}

createServer((req, res) => {
  const status = route(req, res)
  // The CI guard greps this log: an export line proves the backend synced from here.
  if (req.url !== '/health') console.log(`${req.method} ${req.url} ${status}`)
}).listen(PORT, () => console.log(`oedb stub: ${english.length} exercises on :${PORT}`))
