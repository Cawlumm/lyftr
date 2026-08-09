import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// web/src/utils/dateUtils.ts and packages/shared/src/utils/dateUtils.ts are a
// deliberate fork: web is not part of the npm workspace (root workspaces are
// `packages/*` and `mobile`), so it cannot import @lyftr/shared, and mobile cannot
// import web's copy.
//
// A fork kept in step by hand is not a single source of truth — it is one until
// somebody edits one side. This test makes the two files enforce each other: change
// the day rules in one place and CI fails until the other matches. It is the closest
// thing to consolidation available without restructuring the workspace and the Vite
// and Docker builds that depend on its shape.
//
// Comments are compared too. The reasoning is the part most likely to drift and the
// part most expensive to lose, since it is what stops the next reader reintroducing a
// device-zone derivation.
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/\r\n/g, '\n').trimEnd()

describe('dateUtils forks', () => {
  it('are byte-identical between web and shared', () => {
    const web = read('./dateUtils.ts')
    const shared = read('../../../packages/shared/src/utils/dateUtils.ts')

    // Compared as line arrays so a failure points at the first differing line rather
    // than dumping two whole files.
    expect(web.split('\n')).toEqual(shared.split('\n'))
  })
})
