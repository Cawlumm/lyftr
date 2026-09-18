import { useEffect, useState } from 'react'
import { Barcode } from 'lucide-react'
import { eanModules, formatBarcode } from '@lyftr/shared'

// When a lookup has run this long, say so: the silence past this point is what made
// people rescan (#164). Open Food Facts routinely takes a few seconds.
const SLOW_AFTER_MS = 4000

// Start, centre and end guards drop below the other bars, as they do on a pack.
const GUARD_BARS = new Set([0, 2, 46, 48, 92, 94])

// The barcode that was scanned, drawn from its digits, with a glyph for any symbology
// we don't draw. One rect per run of bar modules.
function Bars({ code }: { code: string }) {
  const modules = eanModules(code)
  if (!modules) return <Barcode className="w-full h-full text-tx-muted" strokeWidth={1.5} />
  const runs: { x: number; w: number; guard: boolean }[] = []
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] !== '1') continue
    const start = i
    while (modules[i + 1] === '1') i++
    runs.push({ x: start, w: i - start + 1, guard: GUARD_BARS.has(start) })
  }
  return (
    <svg viewBox="0 0 95 46" preserveAspectRatio="none" shapeRendering="crispEdges" className="w-full h-full text-tx-primary" fill="currentColor">
      {runs.map(r => <rect key={r.x} x={r.x} width={r.w} y={0} height={r.guard ? 46 : 40} />)}
    </svg>
  )
}

// Shown in place of the results while a scanned code is looked up: the barcode and its
// digits, as printed on the pack, so the scan visibly landed.
export default function BarcodeLookup({ code }: { code: string }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="card px-6 py-9 flex flex-col items-center text-center" role="status">
      <div className="relative w-36 h-14" aria-hidden="true">
        <Bars code={code} />
        <span className="absolute -inset-x-2 h-0.5 rounded-full bg-brand-500 shadow-[0_0_10px_2px] shadow-brand-500/60 animate-scan-sweep" />
      </div>
      <p className="mt-2 font-display font-bold text-lg tabular-nums tracking-[0.14em] text-tx-primary">
        {formatBarcode(code)}
      </p>
      <p className="mt-3 text-sm text-tx-muted">
        {slow ? 'Still looking. This can take a few seconds.' : 'Looking up this product…'}
      </p>
    </div>
  )
}
