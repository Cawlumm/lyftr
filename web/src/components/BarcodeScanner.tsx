import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useZxing } from 'react-zxing'
import { X, AlertCircle } from 'lucide-react'

interface Props {
  onResult: (code: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onResult, onClose }: Props) {
  const resolvedRef = useRef(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const { ref } = useZxing({
    constraints: {
      audio: false,
      video: { facingMode: 'environment' },
    },
    timeBetweenDecodingAttempts: 150,
    onDecodeResult(result) {
      if (resolvedRef.current) return
      resolvedRef.current = true
      navigator.vibrate?.(100)
      onResult(result.getText())
    },
    onError(err) {
      const msg = (err as any)?.message ?? String(err)
      // ZXing fires NotFoundException on every frame with no barcode — ignore those
      if (!msg.includes('NotFoundException') && !msg.includes('No MultiFormat')) {
        setCameraError(msg)
      }
    },
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      <div className="flex items-center justify-between p-4">
        <p className="text-white text-sm font-medium">Scan barcode</p>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Close scanner"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center relative">
        {!cameraError && (
          <video
            ref={ref as React.RefObject<HTMLVideoElement>}
            className="w-full max-w-sm rounded-lg"
            style={{ maxHeight: '60vh', objectFit: 'cover' }}
            playsInline
          />
        )}

        {!cameraError && (
          <div className="absolute pointer-events-none" style={{ width: 260, height: 160 }}>
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-brand-400 rounded-tl" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-brand-400 rounded-tr" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-brand-400 rounded-bl" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-brand-400 rounded-br" />
            <div
              className="absolute inset-x-0 h-0.5 bg-brand-400/70"
              style={{ animation: 'barcode-scan 1.5s ease-in-out infinite' }}
            />
          </div>
        )}
      </div>

      {cameraError ? (
        <div className="flex flex-col items-center gap-3 px-6 pb-10 text-center">
          <AlertCircle className="w-8 h-8 text-error-400" />
          <p className="text-white text-sm font-medium">Camera unavailable</p>
          <p className="text-white/50 text-xs font-mono break-all">{cameraError}</p>
          <button onClick={onClose} className="btn-primary btn-sm mt-2">
            Search by name instead
          </button>
        </div>
      ) : (
        <p className="text-center text-white/60 text-xs pb-8 px-4">
          Point camera at barcode — it will scan automatically
        </p>
      )}

      <style>{`
        @keyframes barcode-scan {
          0%   { top: 10%; }
          50%  { top: 85%; }
          100% { top: 10%; }
        }
      `}</style>
    </div>,
    document.body,
  )
}
