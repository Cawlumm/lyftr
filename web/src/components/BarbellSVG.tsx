// Bent barbell from brand-logo.html design system
export default function BarbellSVG() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
      {/* Bent bar (under load) — currentColor so it adapts to light/dark */}
      <path d="M4 16 Q20 25 36 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />

      {/* Collar dots */}
      <circle cx="10.2" cy="18.8" r="1" fill="#475569" />
      <circle cx="29.8" cy="18.8" r="1" fill="#475569" />

      {/* Left plates */}
      <rect x="3" y="10" width="3" height="18" rx="0.8" fill="#0891b2" />
      <rect x="6" y="8" width="4" height="22" rx="1" fill="#00b8d9" />

      {/* Right plates */}
      <rect x="34" y="10" width="3" height="18" rx="0.8" fill="#0891b2" />
      <rect x="30" y="8" width="4" height="22" rx="1" fill="#00b8d9" />

      {/* Highlights */}
      <rect x="7.2" y="10.5" width="1.2" height="17" rx="0.5" fill="#7eeeff" opacity="0.55" />
      <rect x="31.6" y="10.5" width="1.2" height="17" rx="0.5" fill="#7eeeff" opacity="0.55" />
    </svg>
  )
}
