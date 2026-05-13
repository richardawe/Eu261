/**
 * Main orchestration script for the UK Politics AI pipeline.
 *
 * Steps:
 *  1. Fetch latest news from RSS feeds
 *  2. Extract political signals via AI
 *  3. Calculate party positions
 *  4. Compute weekly shifts
 *  5. Generate AI commentary
 *  6. Save snapshot
 *
 * Run with: npm run politics:update
 * Requires: OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable
 */
import { fetchAllNews } from './fetchNews';
import { extractSignalsFromArticles } from './extractSignals';
import { calculatePositions, computeWeeklyShifts } from './calculatePositions';
import { generateCommentary } from './generateCommentary';
import { saveSnapshot, loadPreviousPositions, loadSnapshot, ensureDirectories } from './saveSnapshots';
import type { DailySnapshot, SourceItem } from '../lib/types';

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function sevenDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}

async function run() {
  console.log('='.repeat(50));
  console.log('UK Politics AI Pipeline');
  console.log(`Date: ${today()}`);
  console.log('='.repeat(50));

  ensureDirectories();

  // Step 1: Fetch news
  console.log('\n[1/5] Fetching news…');
  const articles = await fetchAllNews(25);
  if (articles.length === 0) {
    console.warn('No articles fetched — aborting.');
    process.exit(1);
  }

  // Step 2: Extract signals
  console.log(`\n[2/5] Extracting political signals from ${articles.length} articles…`);
  const signals = await extractSignalsFromArticles(articles);

  // Step 3: Calculate positions
  console.log('\n[3/5] Calculating party positions…');
  const previousPositions = loadPreviousPositions(today());
  const positions = calculatePositions(signals, previousPositions);

  // Step 4: Compute weekly shifts
  console.log('\n[4/5] Computing weekly shifts…');
  const weekAgoSnap = loadSnapshot(sevenDaysAgo());
  const weekAgoPositions = weekAgoSnap?.positions ?? positions;
  const weeklyShifts = computeWeeklyShifts(positions, weekAgoPositions);
  const significantShifts = weeklyShifts.filter((s) => s.magnitude >= 0.3);

  // Step 5: Generate commentary
  console.log('\n[5/5] Generating AI commentary…');
  const commentary = await generateCommentary(significantShifts, positions);

  // Build sources list
  const sources: SourceItem[] = articles.slice(0, 20).map((a) => ({
    url: a.url,
    title: a.title,
    source: a.source,
    weight: a.sourceWeight,
    publishedAt: a.publishedAt,
  }));

  const snapshot: DailySnapshot = {
    date: today(),
    generatedAt: new Date().toISOString(),
    positions,
    commentary,
    weeklyShifts: significantShifts,
    sources,
  };

  // Save
  console.log('\n[Saving]');
  saveSnapshot(snapshot);

  console.log('\n✓ Pipeline complete');
  console.log(`  Parties: ${positions.length}`);
  console.log(`  Signals: ${signals.length}`);
  console.log(`  Shifts:  ${significantShifts.length} significant`);
  console.log(`  Commentary paragraphs: ${commentary.length}`);
}

run().catch((e) => {
  console.error('Pipeline failed:', e);
  process.exit(1);
});
