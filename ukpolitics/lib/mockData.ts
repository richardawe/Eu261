import type { DailySnapshot, PartyPosition, PartyShift, SourceItem } from './types';
import { PARTY_BASELINES } from './weights';

const PARTIES: Omit<PartyPosition, 'socialScore' | 'economicScore' | 'confidence' | 'reasoning' | 'sources' | 'timestamp'>[] = [
  { partyId: 'labour', partyName: 'Labour', shortName: 'Lab', color: '#E4003B' },
  { partyId: 'conservatives', partyName: 'Conservative', shortName: 'Con', color: '#0087DC' },
  { partyId: 'reform_uk', partyName: 'Reform UK', shortName: 'Ref', color: '#12B6CF' },
  { partyId: 'liberal_democrats', partyName: 'Liberal Democrats', shortName: 'LD', color: '#FAA61A' },
  { partyId: 'green', partyName: 'Green Party', shortName: 'Grn', color: '#02A95B' },
  { partyId: 'snp', partyName: 'SNP', shortName: 'SNP', color: '#EDDB49' },
];

const MOCK_SOURCES: SourceItem[] = [
  { url: 'https://www.bbc.co.uk/news/politics', title: 'Labour announces new border enforcement measures', source: 'BBC Politics', weight: 0.9, publishedAt: '2026-05-13T08:00:00Z' },
  { url: 'https://www.theguardian.com/politics', title: 'Conservatives unveil tax relief package for businesses', source: 'Guardian Politics', weight: 0.8, publishedAt: '2026-05-13T09:30:00Z' },
  { url: 'https://news.sky.com/politics', title: "Reform UK's Farage demands immediate net-zero reversal", source: 'Sky News Politics', weight: 0.8, publishedAt: '2026-05-13T10:00:00Z' },
  { url: 'https://www.ft.com/politics', title: 'Lib Dems propose expanded NHS funding framework', source: 'Financial Times', weight: 0.9, publishedAt: '2026-05-13T11:00:00Z' },
  { url: 'https://www.theguardian.com/politics', title: 'Green Party calls for public ownership of energy firms', source: 'Guardian Politics', weight: 0.8, publishedAt: '2026-05-13T12:00:00Z' },
  { url: 'https://www.bbc.co.uk/news/scotland', title: 'SNP outlines increased devolution demands in Westminster', source: 'BBC Scotland', weight: 0.9, publishedAt: '2026-05-13T13:00:00Z' },
];

const MOCK_REASONING: Record<string, string[]> = {
  labour: [
    'Tougher migration messaging diverges from traditional left positioning on open borders.',
    'NHS investment commitments and workers rights reforms maintain economic-left alignment.',
    'Increased defense spending signals pragmatic shift toward national security priorities.',
  ],
  conservatives: [
    'Tax relief package reinforces economic-right positioning since 2024 leadership transition.',
    'Continued focus on traditional values and cultural conservatism on social axis.',
    'Deregulation proposals signal further economic-right movement under Badenoch.',
  ],
  reform_uk: [
    'Anti-net-zero rhetoric and tax-cut demands cement far-economic-right positioning.',
    'Immigration-first messaging continues to anchor the party at the conservative extreme.',
    'Populist anti-establishment language partially softens economic positioning.',
  ],
  liberal_democrats: [
    'NHS funding proposals and public services investment align with center-left economics.',
    'Strong pro-civil-liberties and pro-EU positioning maintains progressive social score.',
    'Moderate economic interventionism distinguishes party from economic left parties.',
  ],
  green: [
    'Public ownership demands for energy sector reinforce far-economic-left position.',
    'Intersectional progressive policies maintain the party at the progressive extreme.',
    'Climate-emergency framing supports continued economic redistribution stance.',
  ],
  snp: [
    'Independence-first framing combined with civic nationalism maintains progressive social score.',
    'Increased devolution demands and public service investment align with center-left economics.',
    'Scottish-specific policy positions limit direct comparison to GB-wide parties.',
  ],
};

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function generateHistoricalPositions(days = 30): Map<string, DailySnapshot> {
  const result = new Map<string, DailySnapshot>();
  const today = new Date('2026-05-13');

  // current positions start at baselines then drift
  const current: Record<string, { social: number; economic: number }> = {};
  for (const p of PARTIES) {
    current[p.partyId] = { ...PARTY_BASELINES[p.partyId] };
  }

  const rng = seededRandom(20260513);

  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);
    const dateStr = date.toISOString().split('T')[0];

    const positions: PartyPosition[] = PARTIES.map((p) => {
      const noise = (rng() - 0.5) * 2.5;
      const noiseE = (rng() - 0.5) * 2.0;

      current[p.partyId].social = clamp(
        current[p.partyId].social + noise,
        -100,
        100
      );
      current[p.partyId].economic = clamp(
        current[p.partyId].economic + noiseE,
        -100,
        100
      );

      return {
        ...p,
        socialScore: parseFloat(current[p.partyId].social.toFixed(1)),
        economicScore: parseFloat(current[p.partyId].economic.toFixed(1)),
        confidence: parseFloat((0.7 + rng() * 0.25).toFixed(2)),
        reasoning: MOCK_REASONING[p.partyId],
        sources: ['BBC Politics', 'Guardian', 'Reuters'],
        timestamp: date.toISOString(),
      };
    });

    const weeklyShifts: PartyShift[] = d < 7
      ? PARTIES.slice(0, 3).map((p) => ({
          partyId: p.partyId,
          partyName: p.partyName,
          socialDelta: parseFloat(((rng() - 0.5) * 4).toFixed(1)),
          economicDelta: parseFloat(((rng() - 0.5) * 3).toFixed(1)),
          description: `${p.partyName} showed measurable movement this week based on recent statements.`,
          magnitude: parseFloat((rng() * 3 + 0.5).toFixed(1)),
        }))
      : [];

    result.set(dateStr, {
      date: dateStr,
      generatedAt: new Date(date.getTime() + 6 * 3600 * 1000).toISOString(),
      positions,
      commentary: MOCK_COMMENTARY,
      weeklyShifts,
      sources: MOCK_SOURCES,
    });
  }

  return result;
}

export const MOCK_COMMENTARY = [
  "Labour's continued toughening on immigration rhetoric has moved the party marginally rightward on the social axis compared to its 2024 general election position, while its commitment to NHS investment and employment rights retains a center-left economic positioning.",
  "The Conservatives under Badenoch have consolidated further right on both axes following a series of tax-relief proposals and deregulation commitments, moving away from the 'one nation' tradition.",
  "Reform UK remains anchored at the far conservative and economically right position, with Farage's net-zero rollback demands and immigration-ceiling proposals generating the strongest rightward signals this week.",
  "The Liberal Democrats showed modest leftward economic movement following NHS spending announcements, while their social positioning remains among the most progressive of the tracked parties.",
  "The Green Party's public ownership proposals and climate-emergency framing continue to reinforce their position in the progressive-left quadrant — the most economically left of the main parties tracked.",
  "The SNP's Westminster parliamentary activity this week centred on devolution and public services, maintaining their center-left economic and progressive social positioning.",
];

/** Returns the latest (today's) snapshot using generated data */
export function getLatestMockSnapshot(): DailySnapshot {
  const history = generateHistoricalPositions(30);
  return history.get('2026-05-13')!;
}
