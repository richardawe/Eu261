/**
 * Development utility: generates 30 days of synthetic history data
 * by applying a seeded random walk from a baseline, producing realistic
 * gradual movement. Run once to populate public/data/history/ for local dev.
 *
 * In production the real pipeline builds history day-by-day.
 *
 * Run: npm run politics:history
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { DailySnapshot, PartyPosition } from '../lib/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'public', 'data');
const HISTORY_DIR = join(DATA_DIR, 'history');

mkdirSync(HISTORY_DIR, { recursive: true });

interface PartyMeta {
  partyId: string; partyName: string; shortName: string; color: string;
  baseSocial: number; baseEconomic: number;
}

const PARTIES: PartyMeta[] = [
  { partyId: 'labour',            partyName: 'Labour',           shortName: 'Lab', color: '#E4003B', baseSocial: 10,  baseEconomic: -24 },
  { partyId: 'conservatives',     partyName: 'Conservative',     shortName: 'Con', color: '#0087DC', baseSocial: 56,  baseEconomic: 36  },
  { partyId: 'reform_uk',         partyName: 'Reform UK',        shortName: 'Ref', color: '#12B6CF', baseSocial: 81,  baseEconomic: 48  },
  { partyId: 'liberal_democrats', partyName: 'Liberal Democrats',shortName: 'LD',  color: '#FAA61A', baseSocial: -63, baseEconomic: -20 },
  { partyId: 'green',             partyName: 'Green Party',      shortName: 'Grn', color: '#02A95B', baseSocial: -73, baseEconomic: -66 },
  { partyId: 'snp',               partyName: 'SNP',              shortName: 'SNP', color: '#EDDB49', baseSocial: -49, baseEconomic: -33 },
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

const DAYS = 30;
const today = new Date('2026-05-13');
const rng = seededRandom(20260513);

const current: Record<string, { social: number; economic: number }> = {};
for (const p of PARTIES) {
  current[p.partyId] = { social: p.baseSocial - (rng() - 0.5) * 8, economic: p.baseEconomic - (rng() - 0.5) * 6 };
}

const dates: string[] = [];

for (let d = DAYS - 1; d >= 0; d--) {
  const date = new Date(today);
  date.setDate(today.getDate() - d);
  const dateStr = date.toISOString().split('T')[0];
  dates.push(dateStr);

  const positions: PartyPosition[] = PARTIES.map((p) => {
    const noise = (rng() - 0.5) * 2.8;
    const noiseE = (rng() - 0.5) * 2.2;
    const revertS = (p.baseSocial - current[p.partyId].social) * 0.04;
    const revertE = (p.baseEconomic - current[p.partyId].economic) * 0.04;

    current[p.partyId].social = clamp(current[p.partyId].social + noise + revertS, -100, 100);
    current[p.partyId].economic = clamp(current[p.partyId].economic + noiseE + revertE, -100, 100);

    return {
      partyId: p.partyId,
      partyName: p.partyName,
      shortName: p.shortName,
      color: p.color,
      socialScore: parseFloat(current[p.partyId].social.toFixed(1)),
      economicScore: parseFloat(current[p.partyId].economic.toFixed(1)),
      confidence: parseFloat((0.68 + rng() * 0.26).toFixed(2)),
      reasoning: [`AI-estimated position for ${dateStr} based on monitored news signals.`],
      sources: ['BBC Politics', 'Guardian Politics'],
      timestamp: new Date(date.getTime() + 6 * 3600000).toISOString(),
    };
  });

  const snapshot: DailySnapshot = {
    date: dateStr,
    generatedAt: new Date(date.getTime() + 6 * 3600000).toISOString(),
    positions,
    commentary: [],
    weeklyShifts: [],
    sources: [],
  };

  writeFileSync(join(HISTORY_DIR, `${dateStr}.json`), JSON.stringify(snapshot, null, 2));
}

// Write manifest
const manifest = { latestDate: '2026-05-13', dates, generatedAt: new Date().toISOString() };
writeFileSync(join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`✓ Generated ${DAYS} days of history in public/data/history/`);
console.log(`✓ Updated manifest.json`);
