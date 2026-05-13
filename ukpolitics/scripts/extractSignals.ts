/**
 * Uses the configured AI provider to extract political signals from news articles.
 */
import type { NewsArticle, PoliticalSignal } from '../lib/types';
import { getAIProvider } from '../lib/ai/index';

const TRACKED_PARTIES = [
  'labour',
  'conservatives',
  'reform_uk',
  'liberal_democrats',
  'green',
  'snp',
];

function articleToText(article: NewsArticle): string {
  return `Headline: ${article.title}\n\nSummary: ${article.description}`;
}

export async function extractSignalsFromArticles(
  articles: NewsArticle[]
): Promise<PoliticalSignal[]> {
  const provider = getAIProvider();
  console.log(`  Using AI provider: ${provider.name}`);

  const allSignals: PoliticalSignal[] = [];

  // process in batches of 5 to avoid rate limits
  const BATCH = 5;
  for (let i = 0; i < articles.length; i += BATCH) {
    const batch = articles.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(async (article) => {
        try {
          const signals = await provider.extractSignals(
            articleToText(article),
            TRACKED_PARTIES
          );
          for (const sig of signals) {
            allSignals.push({
              ...sig,
              source: article.source,
              sourceWeight: article.sourceWeight,
            });
          }
        } catch (e) {
          console.warn(`  Signal extraction failed for "${article.title.slice(0, 40)}": ${(e as Error).message}`);
        }
      })
    );
    // brief pause between batches
    if (i + BATCH < articles.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`  Extracted ${allSignals.length} signals from ${articles.length} articles`);
  return allSignals;
}

if (process.argv[1]?.endsWith('extractSignals.ts')) {
  (async () => {
    const { fetchAllNews } = await import('./fetchNews');
    const articles = await fetchAllNews(5);
    const signals = await extractSignalsFromArticles(articles);
    console.log(JSON.stringify(signals, null, 2));
  })();
}
