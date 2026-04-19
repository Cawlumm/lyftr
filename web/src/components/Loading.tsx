export default function Loading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-surface-base">
      <div className="flex flex-col items-center gap-11">
        {/* Barbell Rig */}
        <div className="relative w-56 h-24">
          {/* Left upright */}
          <div className="absolute left-4 top-0 bottom-4 w-1 bg-surface-muted rounded-sm">
            <div className="absolute -left-1 top-7 w-2.5 h-0.5 bg-surface-muted rounded-sm" />
            <div className="absolute -left-1 top-12 w-2.5 h-0.5 bg-surface-muted rounded-sm" />
          </div>

          {/* Right upright */}
          <div className="absolute right-4 top-0 bottom-4 w-1 bg-surface-muted rounded-sm">
            <div className="absolute -right-1 top-7 w-2.5 h-0.5 bg-surface-muted rounded-sm" />
            <div className="absolute -right-1 top-12 w-2.5 h-0.5 bg-surface-muted rounded-sm" />
          </div>

          {/* Bar assembly - pivots and flexes */}
          <div
            className="absolute left-1/2 top-7 -translate-x-1/2"
            style={{
              animation: 'pivot 1.6s cubic-bezier(0.5, 0, 0.5, 1) infinite',
            }}
          >
            {/* Bar with gradient */}
            <div
              className="absolute -left-24 -top-1 w-48 h-1.5 rounded-sm shadow-lg"
              style={{
                background: 'linear-gradient(180deg, #38d8fb 0%, #00b8d9 60%, #007a96 100%)',
                boxShadow: '0 0 8px rgba(0, 184, 217, 0.35)',
                animation: 'flex 1.6s cubic-bezier(0.5, 0, 0.5, 1) infinite',
                transformOrigin: 'center',
              }}
            />

            {/* Left plates */}
            <div
              className="absolute -left-28 -top-3 w-4 h-8 bg-surface-overlay border border-brand-500 rounded-sm"
              style={{ boxShadow: 'inset 0 0 10px rgba(0, 184, 217, 0.25)' }}
            />
            <div
              className="absolute -left-24 -top-4 w-3.5 h-10 bg-surface-overlay border border-brand-500 rounded-sm"
              style={{ boxShadow: 'inset 0 0 10px rgba(0, 184, 217, 0.25)' }}
            />
            <div
              className="absolute -left-20 -top-5 w-3 h-12 bg-surface-overlay border border-brand-500 rounded-sm"
              style={{ boxShadow: 'inset 0 0 10px rgba(0, 184, 217, 0.25)' }}
            />

            {/* Right plates */}
            <div
              className="absolute -right-28 -top-3 w-4 h-8 bg-surface-overlay border border-brand-500 rounded-sm"
              style={{ boxShadow: 'inset 0 0 10px rgba(0, 184, 217, 0.25)' }}
            />
            <div
              className="absolute -right-24 -top-4 w-3.5 h-10 bg-surface-overlay border border-brand-500 rounded-sm"
              style={{ boxShadow: 'inset 0 0 10px rgba(0, 184, 217, 0.25)' }}
            />
            <div
              className="absolute -right-20 -top-5 w-3 h-12 bg-surface-overlay border border-brand-500 rounded-sm"
              style={{ boxShadow: 'inset 0 0 10px rgba(0, 184, 217, 0.25)' }}
            />

            {/* Collars */}
            <div className="absolute -left-17 -top-2 w-1 h-5.5 bg-brand-500 rounded-sm" />
            <div className="absolute -right-17 -top-2 w-1 h-5.5 bg-brand-500 rounded-sm" />
          </div>
        </div>

        {/* Rep dots */}
        <div className="flex gap-2.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-surface-muted border border-surface-muted transition-all"
              style={{
                animation: `blink 1.6s steps(1, end) infinite`,
                animationDelay: `${i * 0.16}s`,
              }}
            />
          ))}
        </div>

        {/* Label */}
        <div className="text-center">
          <div className="font-display font-extrabold text-xl text-tx-primary tracking-tight">
            lyftr
          </div>
          <div className="text-xs font-semibold text-tx-muted uppercase tracking-widest mt-2">
            Loading
          </div>
        </div>
      </div>

      <style>{`
        @keyframes flex {
          0%, 100% { transform: scaleY(1); }
          45% { transform: scaleY(1); }
          55%, 65% { transform: scaleY(0.55); }
          80% { transform: scaleY(1); }
        }
        @keyframes pivot {
          0%, 100% { transform: translateY(0); }
          45% { transform: translateY(0); }
          55%, 65% { transform: translateY(18px); }
          80% { transform: translateY(0); }
        }
        @keyframes blink {
          0%, 100% {
            background-color: var(--surface-muted);
            border-color: var(--surface-muted);
            box-shadow: none;
          }
          20%, 95% {
            background-color: #00b8d9;
            border-color: #00b8d9;
            box-shadow: 0 0 10px rgba(0, 184, 217, 0.5);
          }
        }
      `}</style>
    </div>
  )
}
