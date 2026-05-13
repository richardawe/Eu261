'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DailySnapshot } from '@/lib/types';

interface Props {
  dates: string[];
  current: string;
  onChange: (date: string) => void;
  isPlaying?: boolean;
  onPlayToggle?: () => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TimelineSlider({ dates, current, onChange, isPlaying, onPlayToggle }: Props) {
  const currentIdx = dates.indexOf(current);
  const total = dates.length;

  const handleSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const idx = parseInt(e.target.value, 10);
      onChange(dates[idx]);
    },
    [dates, onChange]
  );

  return (
    <div className="flex flex-col gap-3 bg-surface-raised border border-surface-border rounded p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-ink-faint uppercase tracking-widest">Timeline</span>
        <span className="text-sm font-mono text-accent">
          {current ? formatDate(current) : '—'}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {onPlayToggle && (
          <button
            onClick={onPlayToggle}
            className="flex items-center justify-center w-8 h-8 rounded bg-surface-overlay border border-surface-border text-ink-muted hover:text-ink hover:border-accent transition-colors"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
        )}

        <div className="flex-1 flex flex-col gap-1">
          <input
            type="range"
            min={0}
            max={Math.max(0, total - 1)}
            value={currentIdx >= 0 ? currentIdx : 0}
            onChange={handleSlider}
            className="w-full accent-blue-500 cursor-pointer"
            style={{ accentColor: '#3b82f6' }}
          />
          <div className="flex justify-between text-xs text-ink-faint font-mono">
            <span>{total > 0 ? formatDate(dates[0]) : ''}</span>
            <span>{total > 0 ? formatDate(dates[total - 1]) : ''}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mt-1">
        {dates.slice(-7).map((d) => (
          <button
            key={d}
            onClick={() => onChange(d)}
            className={`text-xs font-mono px-2 py-0.5 rounded border transition-colors ${
              d === current
                ? 'bg-accent border-accent text-white'
                : 'bg-surface-overlay border-surface-border text-ink-faint hover:border-accent hover:text-ink'
            }`}
          >
            {new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </button>
        ))}
      </div>
    </div>
  );
}
