/**
 * Persists daily snapshots to public/data/ for static-site consumption.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { DailySnapshot, DataManifest, PartyPosition } from '../lib/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'public', 'data');
const HISTORY_DIR = join(DATA_DIR, 'history');

export function ensureDirectories() {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(HISTORY_DIR, { recursive: true });
}

export function loadPreviousPositions(date: string): Map<string, PartyPosition> {
  const historyFile = join(HISTORY_DIR, `${date}.json`);
  if (existsSync(historyFile)) {
    try {
      const snap = JSON.parse(readFileSync(historyFile, 'utf-8')) as DailySnapshot;
      return new Map(snap.positions.map((p) => [p.partyId, p]));
    } catch {}
  }
  // Fall back to latest.json
  const latestFile = join(DATA_DIR, 'latest.json');
  if (existsSync(latestFile)) {
    try {
      const snap = JSON.parse(readFileSync(latestFile, 'utf-8')) as DailySnapshot;
      return new Map(snap.positions.map((p) => [p.partyId, p]));
    } catch {}
  }
  return new Map();
}

export function loadSnapshot(date: string): DailySnapshot | null {
  const file = join(HISTORY_DIR, `${date}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as DailySnapshot;
  } catch {
    return null;
  }
}

export function saveSnapshot(snapshot: DailySnapshot) {
  ensureDirectories();

  // Save dated history file
  const historyFile = join(HISTORY_DIR, `${snapshot.date}.json`);
  writeFileSync(historyFile, JSON.stringify(snapshot, null, 2));
  console.log(`  Saved history/${snapshot.date}.json`);

  // Update latest.json
  const latestFile = join(DATA_DIR, 'latest.json');
  writeFileSync(latestFile, JSON.stringify(snapshot, null, 2));
  console.log(`  Updated data/latest.json`);

  // Rebuild manifest
  updateManifest(snapshot.date, snapshot.generatedAt);
}

function updateManifest(latestDate: string, generatedAt: string) {
  const manifestFile = join(DATA_DIR, 'manifest.json');

  let existing: DataManifest = { latestDate, dates: [], generatedAt };
  if (existsSync(manifestFile)) {
    try {
      existing = JSON.parse(readFileSync(manifestFile, 'utf-8')) as DataManifest;
    } catch {}
  }

  const dates = new Set(existing.dates);
  dates.add(latestDate);

  const sorted = Array.from(dates).sort();
  // Keep last 90 days
  const trimmed = sorted.slice(-90);

  const manifest: DataManifest = {
    latestDate,
    dates: trimmed,
    generatedAt,
  };

  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  console.log(`  Updated manifest.json (${trimmed.length} dates)`);
}
