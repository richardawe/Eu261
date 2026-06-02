'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Header from '@/components/Header';
import PoliticalMatrix from '@/components/PoliticalMatrix';
import TimelineSlider from '@/components/TimelineSlider';
import TrendChart from '@/components/TrendChart';
import { dataUrl } from '@/lib/dataUrl';
import type { DailySnapshot, DataManifest, PartyPosition } from '@/lib/types';

const TRAIL_DAYS = 7;

export default function HistoryPage() {
  const [manifest, setManifest] = useState<DataManifest | null>(null);
  const [snapshots, setSnapshots] = useState<Map<string, DailySnapshot>>(new Map());
  const [currentDate, setCurrentDate] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<'matrix' | 'social' | 'economic'>('matrix');
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(dataUrl('data/manifest.json'))
      .then((r) => r.json() as Promise<DataManifest>)
      .then((m) => {
        setManifest(m);
        setCurrentDate(m.latestDate);
      })
      .catch(() => {});
  }, []);

  const loadSnapshot = useCallback(
    async (date: string) => {
      if (snapshots.has(date)) return;
      try {
        const r = await fetch(dataUrl(`data/history/${date}.json`));
        if (!r.ok) return;
        const snap = (await r.json()) as DailySnapshot;
        setSnapshots((prev) => new Map(prev).set(date, snap));
      } catch {}
    },
    [snapshots]
  );

  // preload current ± 3 days
  useEffect(() => {
    if (!manifest || !currentDate) return;
    const idx = manifest.dates.indexOf(currentDate);
    const toLoad = manifest.dates.slice(Math.max(0, idx - 3), idx + 4);
    toLoad.forEach(loadSnapshot);
  }, [currentDate, manifest, loadSnapshot]);

  // playback
  useEffect(() => {
    if (!isPlaying || !manifest) return;
    playRef.current = setInterval(() => {
      setCurrentDate((prev) => {
        const idx = manifest.dates.indexOf(prev);
        if (idx >= manifest.dates.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return manifest.dates[idx + 1];
      });
    }, 600);
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, [isPlaying, manifest]);

  const snapshot = snapshots.get(currentDate);
  const allLoaded = Array.from(snapshots.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Build movement trails for matrix view
  const trails: PartyPosition[][] = (() => {
    if (!manifest || !currentDate) return [];
    const idx = manifest.dates.indexOf(currentDate);
    const trailDates = manifest.dates.slice(Math.max(0, idx - TRAIL_DAYS), idx + 1);
    const partyIds = snapshot?.positions.map((p) => p.partyId) ?? [];
    return partyIds.map((pid) =>
      trailDates
        .map((d) => snapshots.get(d)?.positions.find((p) => p.partyId === pid))
        .filter(Boolean) as PartyPosition[]
    );
  })();

  return (
    <div className="min-h-screen flex flex-col">
      <Header lastUpdated={manifest?.generatedAt} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-mono font-bold text-ink tracking-tight mb-1">
            Historical Positioning
          </h1>
          <p className="text-sm text-ink-faint">
            Replay party movement over time. Dots trails show the last {TRAIL_DAYS} days of movement.
          </p>
        </div>

        {manifest ? (
          <>
            <div className="mb-6">
              <TimelineSlider
                dates={manifest.dates}
                current={currentDate}
                onChange={setCurrentDate}
                isPlaying={isPlaying}
                onPlayToggle={() => setIsPlaying((p) => !p)}
              />
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 mb-4">
              {(['matrix', 'social', 'economic'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`text-xs font-mono px-3 py-1.5 rounded border transition-colors ${
                    activeTab === tab
                      ? 'bg-accent border-accent text-white'
                      : 'border-surface-border text-ink-muted hover:text-ink hover:border-accent'
                  }`}
                >
                  {tab === 'matrix' ? 'Compass' : tab === 'social' ? 'Social Axis' : 'Economic Axis'}
                </button>
              ))}
            </div>

            {activeTab === 'matrix' && snapshot && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 bg-surface-raised border border-surface-border rounded p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xs font-mono uppercase tracking-widest text-ink-faint">
                      Compass — {currentDate}
                    </h2>
                    <span className="text-xs text-ink-faint font-mono">
                      Trail: {TRAIL_DAYS} days
                    </span>
                  </div>
                  <PoliticalMatrix positions={snapshot.positions} trail={trails} animated />
                </div>
                <div className="xl:col-span-1 bg-surface-raised border border-surface-border rounded p-4">
                  <h3 className="text-xs font-mono uppercase tracking-widest text-ink-faint mb-4">
                    Positions — {currentDate}
                  </h3>
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="text-ink-faint border-b border-surface-border">
                        <th className="text-left py-1">Party</th>
                        <th className="text-right py-1">Social</th>
                        <th className="text-right py-1">Economic</th>
                        <th className="text-right py-1">Conf.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.positions.map((p) => (
                        <tr key={p.partyId} className="border-b border-surface-border">
                          <td className="py-1.5" style={{ color: p.color }}>
                            {p.shortName}
                          </td>
                          <td className="text-right text-ink-muted">
                            {p.socialScore > 0 ? '+' : ''}{p.socialScore.toFixed(1)}
                          </td>
                          <td className="text-right text-ink-muted">
                            {p.economicScore > 0 ? '+' : ''}{p.economicScore.toFixed(1)}
                          </td>
                          <td className="text-right text-ink-faint">
                            {Math.round(p.confidence * 100)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {snapshot.commentary.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h4 className="text-xs font-mono uppercase tracking-widest text-ink-faint">
                        AI Commentary
                      </h4>
                      {snapshot.commentary.slice(0, 2).map((c, i) => (
                        <p key={i} className="text-xs text-ink-faint leading-relaxed">
                          {c}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {(activeTab === 'social' || activeTab === 'economic') && allLoaded.length > 1 && (
              <div className="bg-surface-raised border border-surface-border rounded p-4">
                <h2 className="text-xs font-mono uppercase tracking-widest text-ink-faint mb-4">
                  {activeTab === 'social' ? 'Social Axis (Progressive ↔ Conservative)' : 'Economic Axis (Left ↔ Right)'}
                </h2>
                <TrendChart history={allLoaded} axis={activeTab} />
                <p className="text-xs text-ink-faint font-mono mt-3">
                  {activeTab === 'social'
                    ? 'Negative = progressive/liberal. Positive = conservative/nationalist.'
                    : 'Negative = economic left. Positive = economic right.'}
                </p>
              </div>
            )}

            {!snapshot && (
              <div className="flex items-center justify-center h-48 text-ink-faint font-mono text-sm">
                <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin mr-3" />
                Loading snapshot…
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-64 text-ink-faint font-mono text-sm">
            <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin mr-3" />
            Loading history…
          </div>
        )}
      </main>
    </div>
  );
}
