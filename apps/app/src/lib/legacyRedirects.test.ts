import fs from 'fs'
import path from 'path'
import { LEGACY_ROUTES } from './legacyRoutes'

// nginx answers the web app's old URLs with a 301 before the bundle loads, so a bookmark or
// a search hit lands on the new path in one hop. The list nginx reads is checked in rather
// than generated in the image, so fly/Dockerfile and apps/app/Dockerfile.web include the same
// file and a reviewer sees every rule; this test is what keeps it equal to LEGACY_ROUTES.
// After editing legacyRoutes.ts, regenerate with:
//   UPDATE_NGINX_REDIRECTS=1 npx jest src/lib/legacyRedirects   (from apps/app/)
const confPath = path.resolve(__dirname, '../../nginx.legacy-redirects.conf')

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Captures are digits only: nginx hands a regex location the percent-decoded URI, so a
// permissive group would carry CR/LF into the Location header (response splitting). Every
// path param here is a numeric exercise id; a non-numeric one falls through to the SPA.
// absolute_redirect off keeps Location relative, for the reason given on the
// .well-known/change-password block in nginx.conf.template: nginx listens on 80 behind TLS.
function rule(from: string, to: string): string {
  const params = [...from.matchAll(/:(\w+)/g)].map((m) => m[1])
  if (params.length === 0) {
    return `location = ${from} { absolute_redirect off; return 301 ${to}$is_args$args; }`
  }
  const pattern = from
    .split(/(:\w+)/)
    .map((part) => (part.startsWith(':') ? '([0-9]+)' : escapeRegex(part)))
    .join('')
  const target = to.replace(/:(\w+)/g, (_, name: string) => `$${params.indexOf(name) + 1}`)
  return `location ~ ^${pattern}$ { absolute_redirect off; return 301 ${target}$is_args$args; }`
}

function render(): string {
  return [
    '# GENERATED from apps/app/src/lib/legacyRoutes.ts by src/lib/legacyRedirects.test.ts. Do not edit:',
    '# change LEGACY_ROUTES, then run UPDATE_NGINX_REDIRECTS=1 npx jest src/lib/legacyRedirects in apps/app/.',
    '# Included in the server block before any other regex location, which nginx tries in order.',
    ...LEGACY_ROUTES.map((r) => rule(r.from, r.to)),
    '',
  ].join('\n')
}

describe('nginx legacy redirects', () => {
  it('match LEGACY_ROUTES', () => {
    if (process.env.UPDATE_NGINX_REDIRECTS) fs.writeFileSync(confPath, render())
    const onDisk = fs.readFileSync(confPath, 'utf8').replace(/\r\n/g, '\n')
    expect(onDisk).toBe(render())
  })

  it('map every target param back to a captured segment', () => {
    for (const r of LEGACY_ROUTES) {
      for (const [, name] of r.to.matchAll(/:(\w+)/g)) expect(r.from).toContain(`:${name}`)
    }
  })
})
