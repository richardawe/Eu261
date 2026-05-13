'use client';

import type { PartyShift } from '@/lib/types';

interface Props {
  shifts: PartyShift[];
  partyColors: Record<string, string>;
}

function Arrow({ delta, axis }: { delta: number; axis: string }) {
  const abs = Math.abs(delta);
  if (abs < 0.2) return <span className="text-ink-faint text-xs">–</span>;

  const color = axis === 'social'
    ? delta > 0 ? '#f97316' : '#3b82f6'
    : delta > 0 ? '#ef4444' : '#22c55e';

  const label = axis === 'social'
    ? delta > 0 ? 'Conservative' : 'Progressive'
    : delta > 0 ? 'Economic Right' : 'Economic Left';

  const arrowChar = delta > 0 ? '▲' : '▼';

  return (
    <span className="flex items-center gap-1 text-xs font-mono" style={{ color }}>
      {arrowChar}
      <span>{label}</span>
      <span className="opacity-70">({delta > 0 ? '+' : ''}{delta.toFixed(1)})</span>
    </span>
  );
}

export default function MovementIndicator({ shifts, partyColors }: Props) {
  if (!shifts.length) {
    return (
      <div className="text-xs text-ink-faint font-mono italic py-2">
        No significant movement detected this week.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {shifts.map((s) => (
        <div key={s.partyId} className="flex items-start gap-3 p-3 rounded bg-surface-raised border border-surface-border">
          <div
            className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
            style={{ backgroundColor: partyColors[s.partyId] ?? '#64748b' }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <span
                className="text-xs font-semibold font-mono"
                style={{ color: partyColors[s.partyId] ?? '#94a3b8' }}
              >
                {s.partyName}
              </span>
              <Arrow delta={s.socialDelta} axis="social" />
              <Arrow delta={s.economicDelta} axis="economic" />
            </div>
            <p className="text-xs text-ink-faint leading-snug">{s.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
