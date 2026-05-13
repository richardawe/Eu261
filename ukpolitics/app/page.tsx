'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import PoliticalMatrix from '@/components/PoliticalMatrix';
import CommentaryPanel from '@/components/CommentaryPanel';
import MovementIndicator from '@/components/MovementIndicator';
import SourceList from '@/components/SourceList';
import type { DailySnapshot, PartyPosition } from '@/lib/types';

function buildPartyColors(positions: PartyPosition[]): Record<string, string> {
  return Object.fromEntries(positions.map((p) => [p.partyId, p.color]));
}

export default function HomePage() {
  const [snapshot, setSnapshot] = useState<DailySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('data/latest.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<DailySnapshot>;
      })
      .then(setSnapshot)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <p className="text-ink-faint font-mono text-sm mb-2">Data not found</p>
            <p className="text-xs text-ink-faint">
              Run <code className="bg-surface-overlay px-1.5 py-0.5 rounded text-accent">npm run politics:update</code> to generate data.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 text-ink-faint font-mono text-sm">
            <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Loading…
          </div>
        </main>
      </div>
    );
  }

  const partyColors = buildPartyColors(snapshot.positions);

  return (
    <div className="min-h-screen flex flex-col">
      <Header lastUpdated={snapshot.generatedAt} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        {/* Page heading */}
        <div className="mb-8">
          <h1 className="text-2xl font-mono font-bold text-ink tracking-tight mb-1">
            UK Political Positioning Matrix
          </h1>
          <p className="text-sm text-ink-faint">
            AI-estimated ideological positions based on recent political signals. Updated every 6 hours.
          </p>
          <p className="text-xs text-ink-faint mt-1 font-mono">
            Data: {snapshot.date} &nbsp;·&nbsp; {snapshot.positions.length} parties tracked &nbsp;·&nbsp;
            {snapshot.sources.length} sources analysed
          </p>
        </div>

        {/* Disclaimer */}
        <div className="mb-6 px-3 py-2 rounded border border-surface-border bg-surface-raised">
          <p className="text-xs text-ink-faint font-mono">
            ⚠ Positions are AI-estimated ideological mappings derived from public political signals, not
            official party statements. Probabilistic, inference-based, trend-oriented.
          </p>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Matrix — takes 2/3 */}
          <div className="xl:col-span-2">
            <div className="bg-surface-raised border border-surface-border rounded p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-mono uppercase tracking-widest text-ink-faint">
                  Live Compass — {snapshot.date}
                </h2>
                <a
                  href="history"
                  className="text-xs font-mono text-accent hover:underline"
                >
                  View history →
                </a>
              </div>
              <PoliticalMatrix positions={snapshot.positions} animated />
            </div>
          </div>

          {/* Commentary — 1/3 */}
          <div className="xl:col-span-1">
            <div className="bg-surface-raised border border-surface-border rounded p-4 h-full">
              <CommentaryPanel snapshot={snapshot} partyColors={partyColors} />
            </div>
          </div>
        </div>

        {/* Weekly shifts */}
        {snapshot.weeklyShifts.length > 0 && (
          <div className="mt-6">
            <div className="bg-surface-raised border border-surface-border rounded p-4">
              <h2 className="text-xs font-mono uppercase tracking-widest text-ink-faint mb-4">
                Weekly Movement
              </h2>
              <MovementIndicator shifts={snapshot.weeklyShifts} partyColors={partyColors} />
            </div>
          </div>
        )}

        {/* Sources */}
        <div className="mt-6">
          <div className="bg-surface-raised border border-surface-border rounded p-4">
            <SourceList sources={snapshot.sources} />
          </div>
        </div>
      </main>
    </div>
  );
}
