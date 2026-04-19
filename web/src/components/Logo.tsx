import BarbellSVG from './BarbellSVG'

const sizeMap = {
  sm: { scale: 0.6, fontSize: 14 },
  md: { scale: 1, fontSize: 18 },
  lg: { scale: 1.4, fontSize: 22 },
};

export default function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = sizeMap[size];

  return (
    <div className="flex items-center gap-2.5">
      {/* Barbell */}
      <div style={{ transform: `scale(${s.scale})`, transformOrigin: 'left center' }} className="flex-shrink-0">
        <BarbellSVG />
      </div>

      {/* Text */}
      <span className="font-display font-extrabold text-tx-primary tracking-tight" style={{
        fontSize: `${s.fontSize}px`,
        letterSpacing: '-0.02em',
      }}>
        lyftr
      </span>
    </div>
  );
}
