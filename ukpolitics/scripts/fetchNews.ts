/**
 * Fetches articles from UK politics RSS feeds and returns deduplicated NewsArticle objects.
 */
import type { NewsArticle } from '../lib/types';
import { SOURCE_WEIGHTS } from '../lib/weights';

interface RSSItem {
  title?: string;
  contentSnippet?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
}

interface RSSFeed {
  items: RSSItem[];
}

const FEEDS: { url: string; source: string; weightKey: string }[] = [
  { url: 'http://feeds.bbci.co.uk/news/politics/rss.xml', source: 'BBC Politics', weightKey: 'bbc' },
  { url: 'https://feeds.skynews.com/feeds/rss/politics.xml', source: 'Sky News Politics', weightKey: 'sky_news' },
  { url: 'https://www.theguardian.com/politics/rss', source: 'Guardian Politics', weightKey: 'guardian' },
  { url: 'https://feeds.a.dj.com/rss/RSSWSJD.xml', source: 'Reuters UK', weightKey: 'reuters' },
  { url: 'https://politicshome.com/news/uk/rss', source: 'PoliticsHome', weightKey: 'politicshome' },
];

async function parseRSS(url: string): Promise<RSSFeed> {
  // dynamic import so tsx can resolve it at runtime
  const Parser = (await import('rss-parser')).default;
  const parser = new Parser({ timeout: 10000 });
  return parser.parseURL(url) as Promise<RSSFeed>;
}

function deduplicateArticles(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  return articles.filter((a) => {
    const key = a.url || a.title.toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const POLITICS_KEYWORDS = [
  'labour', 'conservative', 'tory', 'reform', 'farage', 'liberal democrat', 'green party', 'snp',
  'starmer', 'badenoch', 'davey', 'swinney', 'parliament', 'mp', 'minister', 'chancellor',
  'immigration', 'nhs', 'budget', 'tax', 'policy', 'election', 'vote', 'westminster', 'downing',
];

function isPolitical(article: NewsArticle): boolean {
  const text = `${article.title} ${article.description}`.toLowerCase();
  return POLITICS_KEYWORDS.some((kw) => text.includes(kw));
}

export async function fetchAllNews(maxPerFeed = 20): Promise<NewsArticle[]> {
  const results: NewsArticle[] = [];

  await Promise.allSettled(
    FEEDS.map(async ({ url, source, weightKey }) => {
      try {
        console.log(`  Fetching ${source}…`);
        const feed = await parseRSS(url);
        const items = feed.items.slice(0, maxPerFeed);
        const weight = SOURCE_WEIGHTS[weightKey] ?? 0.7;

        for (const item of items) {
          if (!item.title) continue;
          const article: NewsArticle = {
            title: item.title,
            description: item.contentSnippet ?? '',
            url: item.link ?? '',
            publishedAt: item.isoDate ?? item.pubDate ?? new Date().toISOString(),
            source,
            sourceWeight: weight,
          };
          results.push(article);
        }
      } catch (e) {
        console.warn(`  Failed to fetch ${source}: ${(e as Error).message}`);
      }
    })
  );

  const deduped = deduplicateArticles(results);
  const political = deduped.filter(isPolitical);
  console.log(`  Fetched ${results.length} articles → ${deduped.length} unique → ${political.length} political`);
  return political;
}

if (process.argv[1]?.endsWith('fetchNews.ts')) {
  fetchAllNews().then((articles) => {
    console.log(JSON.stringify(articles.slice(0, 3), null, 2));
  });
}
