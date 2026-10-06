import { useState } from 'react'
import { Utensils } from 'lucide-react'

// Product photos, on the two terms OpenFoodFacts actually offers them.
//
// Half of the catalogue has no photo at all — sampled per query against the search
// index: milk 12%, olive oil 19%, yogurt 39%, bread 54% — and a real share of the rest
// answer with a connection reset or a TLS handshake that never completes (measured from
// this machine while verifying #171: 3 of 5 olive-oil images). So a missing picture is
// the ordinary case, and a picture that never arrives has to look the same as one that
// was never there. An <img> alone does neither: it leaves an empty bordered box, and on
// the detail screen it held a blank 208px band above the calories forever.
//
// Which is why there is no onError here. A photo is shown once it has loaded and not
// before; failing and hanging then need no separate handling, because neither ever
// loads. This is the same rule the API client follows — nothing is left mid-request
// with the UI pretending otherwise.
//
// Nothing stands in for the photo but a glyph. Peer apps are unanimous: OpenFoodFacts'
// own app, wger, OpenNutriTracker, Waistline and FitBook all show a flat tinted box with
// an outline icon, and OpenNutriTracker's source says outright why it will not guess an
// icon from the product's category — branded products make that "often misleading". A
// plausible-looking stand-in for data we do not have is the thing to avoid.

// A row's picture. The slot is a fixed square whether or not a photo ever arrives, so a
// list does not jitter as images stream in.
export function FoodThumb({ src, className = '' }: { src?: string, className?: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className={`relative w-11 h-11 rounded-xl bg-surface-muted border border-surface-border flex items-center justify-center flex-shrink-0 overflow-hidden ${className}`}>
      <Utensils className="w-5 h-5 text-tx-muted" />
      {src && (
        <img
          src={src}
          alt=""
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  )
}

// The detail screen's picture, which takes no room until it has one to fill.
//
// It used to reserve a band — 208px for a photo on its way, 128px of placeholder when
// there was none — which on a 390px phone pushed the amount field, the only control
// anyone opened this screen to use, most of a screen down. No peer reserves that space:
// wger and FitBook build the image widget only `if (image != null)`, Waistline hides the
// row outright, and MyFitnessPal, Cronometer and MacroFactor have no product photo on
// their log screens at all. The numbers are what the screen is for.
export function FoodHero({ src, alt }: { src?: string, alt: string }) {
  const [loaded, setLoaded] = useState(false)
  if (!src) return null
  return (
    <img
      src={src}
      alt={alt}
      onLoad={() => setLoaded(true)}
      className={`w-full object-cover ${loaded ? 'h-52 border-b border-surface-border' : 'h-0'}`}
    />
  )
}
