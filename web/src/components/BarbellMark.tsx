// Small barbell icon mark for favicon/small contexts
export default function BarbellMark({
  size = 32,
  className = ''
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 120"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#38d8fb" />
          <stop offset="60%" stopColor="#00b8d9" />
          <stop offset="100%" stopColor="#007a96" />
        </linearGradient>
        <filter id="barGlow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Left upright */}
      <rect x="30" y="10" width="4" height="70" rx="2" fill="#1c2f50" />
      <rect x="24" y="38" width="10" height="2" rx="1" fill="#1c2f50" />
      <rect x="24" y="58" width="10" height="2" rx="1" fill="#1c2f50" />

      {/* Right upright */}
      <rect x="206" y="10" width="4" height="70" rx="2" fill="#1c2f50" />
      <rect x="206" y="38" width="10" height="2" rx="1" fill="#1c2f50" />
      <rect x="206" y="58" width="10" height="2" rx="1" fill="#1c2f50" />

      {/* Left plates */}
      <rect x="44" y="38" width="8" height="20" rx="2" fill="#0d1629" stroke="#00b8d9" strokeWidth="1.5" />
      <rect x="54" y="32" width="7" height="28" rx="2" fill="#0d1629" stroke="#00b8d9" strokeWidth="1.5" />
      <rect x="62" y="26" width="6" height="36" rx="2" fill="#0d1629" stroke="#00b8d9" strokeWidth="1.5" />

      {/* Bar */}
      <rect x="74" y="50" width="92" height="6" rx="3" fill="url(#barGrad)" filter="url(#barGlow)" />

      {/* Right plates */}
      <rect x="188" y="38" width="8" height="20" rx="2" fill="#0d1629" stroke="#00b8d9" strokeWidth="1.5" />
      <rect x="179" y="32" width="7" height="28" rx="2" fill="#0d1629" stroke="#00b8d9" strokeWidth="1.5" />
      <rect x="172" y="26" width="6" height="36" rx="2" fill="#0d1629" stroke="#00b8d9" strokeWidth="1.5" />

      {/* Collars */}
      <rect x="68" y="52" width="4" height="22" rx="1" fill="#00b8d9" />
      <rect x="168" y="52" width="4" height="22" rx="1" fill="#00b8d9" />
    </svg>
  )
}
