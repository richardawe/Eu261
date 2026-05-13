'use client';

import type { DailySnapshot, PartyPosition } from '@/lib/types';

interface Props {
  snapshot: DailySnapshot;
  partyColors: Record<string, string>;
}

function directionArrow(delta: number): { symbol: string; color: string } {
  if (Math.abs(delta) < 0.3) return { symbol: '→', color: '#64748b' };
  if (delta > 0) return { symbol: '↗', color: '#f97316' };
  return { symbol: '↙', color: '#3b82f6' };
}

function MovementBadge({ party, socialDelta, economicDelta }: { party: string; socialDelta: number; economicDelta: number }) {
  const sa = directionArrow(socialDelta);
  const ea = directionArrow(economicDelta);
  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className="text-ink-muted">{party}</span>
      <span title="Social axis" style={{ color: sa.color }}>{sa.symbol} Social {socialDelta > 0 ? '+' : ''}{socialDelta.toFixed(1)}</span>
      <span title="Economic axis" style={{ color: ea.color }}>{ea.symbol} Econ {economicDelta > 0 ? '+' : ''}{economicDelta.toFixed(1)}</span>
    </div>
  );
}

export default function CommentaryPanel({ snapshot, partyColors }: Props) {
  const { commentary, weeklyShifts, positions } = snapshot;

  return (
    <div className="flex flex-col gap-6">
      {/* AI Commentary */}
      <div>
        <h3 className="text-xs font-mono uppercase tracking-widest text-ink-faint mb-3">
          AI Analysis
        </h3>
        <div className="space-y-3">
          {commentary.map((line, i) => (
            <p key={i} className="text-sm text-ink-muted leading-relaxed border-l-2 border-surface-border pl-3">
              {line}
            </p>
          ))}
        </div>
      </div>

      {/* Weekly shifts */}
      {weeklyShifts.length > 0 && (
        <div>
          <h3 className="text-xs font-mono uppercase tracking-widest text-ink-faint mb-3">
            Weekly Movement
          </h3>
          <div className="space-y-2">
            {weeklyShifts.map((shift) => (
              <div key={shift.partyId} className="bg-surface-raised rounded p-3 border border-surface-border">
                <MovementBadge
                  party={shift.partyName}
                  socialDelta={shift.socialDelta}
                  economicDelta={shift.economicDelta}
                />
                <p className="text-xs text-ink-faint mt-1">{shift.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current standings */}
      <div>
        <h3 className="text-xs font-mono uppercase tracking-widest text-ink-faint mb-3">
          Current Positions
        </h3>
        <div className="space-y-1">
          {positions.map((p) => (
            <div key={p.partyId} className="flex items-center justify-between text-xs font-mono py-1 border-b border-surface-border">
              <span style={{ color: p.color }} className="font-semibold w-28 truncate">
                {p.partyName}
              </span>
              <span className="text-ink-faint">
                S: {p.socialScore > 0 ? '+' : ''}{p.socialScore.toFixed(0)}
              </span>
              <span className="text-ink-faint">
                E: {p.economicScore > 0 ? '+' : ''}{p.economicScore.toFixed(0)}
              </span>
              <span className="text-ink-faint">
                {Math.round(p.confidence * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
