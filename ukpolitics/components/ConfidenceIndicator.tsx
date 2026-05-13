'use client';

interface Props {
  confidence: number;
  label?: string;
  size?: 'sm' | 'md';
}

export default function ConfidenceIndicator({ confidence, label, size = 'md' }: Props) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const bars = 5;
  const filled = Math.ceil((confidence * bars));

  return (
    <div className={`flex items-center gap-2 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
      {label && <span className="text-ink-faint font-mono">{label}</span>}
      <div className="flex gap-0.5">
        {Array.from({ length: bars }).map((_, i) => (
          <div
            key={i}
            className="rounded-sm"
            style={{
              width: size === 'sm' ? 6 : 8,
              height: size === 'sm' ? 10 : 14,
              backgroundColor: i < filled ? color : '#1e2d4a',
              opacity: i < filled ? 0.9 : 1,
            }}
          />
        ))}
      </div>
      <span className="font-mono" style={{ color, fontSize: size === 'sm' ? 10 : 12 }}>
        {pct}%
      </span>
    </div>
  );
}
