import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'

interface Props {
  onResult: (code: string) => void
  onClose: () => void
}

const SCANNER_ID = 'lyftr-barcode-scanner'

export default function BarcodeScanner({ onResult, onClose }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const resolvedRef = useRef(false)

  useEffect(() => {
    const scanner = new Html5Qrcode(SCANNER_ID)
    scannerRef.current = scanner

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      (decodedText) => {
        if (resolvedRef.current) return
        resolvedRef.current = true
        navigator.vibrate?.(100)
        scanner.stop().catch(() => {})
        onResult(decodedText)
      },
      () => { /* scan failure — silent */ },
    ).catch((err) => {
      console.warn('[BarcodeScanner] start failed:', err)
      onClose()
    })

    return () => {
      scanner.stop().catch(() => {})
    }
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Close */}
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

      {/* Camera feed + overlay */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {/* html5-qrcode mounts video here */}
        <div id={SCANNER_ID} className="w-full max-w-sm" />

        {/* Corner brackets */}
        <div className="absolute pointer-events-none" style={{ width: 260, height: 160 }}>
          {/* Top-left */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-brand-400 rounded-tl" />
          {/* Top-right */}
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-brand-400 rounded-tr" />
          {/* Bottom-left */}
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-brand-400 rounded-bl" />
          {/* Bottom-right */}
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-brand-400 rounded-br" />
          {/* Scan line */}
          <div className="absolute inset-x-0 h-0.5 bg-brand-400/70" style={{ animation: 'barcode-scan 1.5s ease-in-out infinite' }} />
        </div>
      </div>

      <p className="text-center text-white/60 text-xs pb-8 px-4">
        Point camera at barcode — it will scan automatically
      </p>

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
