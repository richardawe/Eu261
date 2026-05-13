export interface PartyPosition {
  partyId: string;
  partyName: string;
  shortName: string;
  color: string;
  /** -100 = progressive/liberal, +100 = conservative/nationalist */
  socialScore: number;
  /** -100 = economic left, +100 = economic right */
  economicScore: number;
  /** 0–1 */
  confidence: number;
  reasoning: string[];
  sources: string[];
  timestamp: string;
}

export interface PartyShift {
  partyId: string;
  partyName: string;
  socialDelta: number;
  economicDelta: number;
  description: string;
  magnitude: number;
}

export interface DailySnapshot {
  date: string;
  generatedAt: string;
  positions: PartyPosition[];
  commentary: string[];
  weeklyShifts: PartyShift[];
  sources: SourceItem[];
}

export interface SourceItem {
  url: string;
  title: string;
  source: string;
  weight: number;
  publishedAt: string;
}

export interface NewsArticle {
  title: string;
  description: string;
  content?: string;
  url: string;
  publishedAt: string;
  source: string;
  sourceWeight: number;
}

export type PolicyArea =
  | 'immigration'
  | 'taxation'
  | 'healthcare'
  | 'environment'
  | 'defense'
  | 'economy'
  | 'education'
  | 'housing'
  | 'welfare'
  | 'foreign_policy'
  | 'constitutional'
  | 'law_order'
  | 'trade';

export type SignalDirection =
  | 'more_conservative'
  | 'more_progressive'
  | 'more_economic_left'
  | 'more_economic_right'
  | 'no_change';

export interface PoliticalSignal {
  party: string;
  policyArea: PolicyArea;
  direction: SignalDirection;
  strength: number;
  socialImpact: number;
  economicImpact: number;
  evidence: string;
  source: string;
  sourceWeight: number;
}

export interface SignalExtractionResult {
  signals: PoliticalSignal[];
  articleId: string;
}

export interface AIProvider {
  name: string;
  extractSignals(articleText: string, parties: string[]): Promise<PoliticalSignal[]>;
  generateCommentary(shifts: PartyShift[], positions: PartyPosition[]): Promise<string[]>;
}

export interface DataManifest {
  latestDate: string;
  dates: string[];
  generatedAt: string;
}
