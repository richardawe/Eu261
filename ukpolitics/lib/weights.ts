import type { PolicyArea } from './types';

export const SOURCE_WEIGHTS: Record<string, number> = {
  official_speech: 1.0,
  manifesto: 1.0,
  hansard: 0.95,
  reuters: 0.95,
  bbc: 0.9,
  financial_times: 0.9,
  guardian: 0.8,
  telegraph: 0.8,
  sky_news: 0.8,
  politicshome: 0.75,
  independent: 0.7,
  mail: 0.65,
  opinion: 0.3,
  social_media: 0.2,
};

export const POLICY_AXIS_WEIGHTS: Record<PolicyArea, { social: number; economic: number }> = {
  immigration: { social: 0.9, economic: 0.1 },
  taxation: { social: 0.05, economic: 0.95 },
  healthcare: { social: 0.15, economic: 0.75 },
  environment: { social: 0.4, economic: 0.55 },
  defense: { social: 0.65, economic: 0.3 },
  economy: { social: 0.0, economic: 1.0 },
  education: { social: 0.3, economic: 0.65 },
  housing: { social: 0.25, economic: 0.7 },
  welfare: { social: 0.2, economic: 0.8 },
  foreign_policy: { social: 0.5, economic: 0.45 },
  constitutional: { social: 0.85, economic: 0.1 },
  law_order: { social: 0.9, economic: 0.1 },
  trade: { social: 0.2, economic: 0.8 },
};

export const SIGNAL_TYPE_MULTIPLIERS: Record<string, number> = {
  legislation: 1.0,
  manifesto_commitment: 0.95,
  policy_announcement: 0.85,
  leader_speech: 0.8,
  party_vote: 0.9,
  rhetoric: 0.5,
  electoral_triangulation: 0.6,
  signalling: 0.4,
};

/** Baseline positions derived from 2024 general election manifestos and post-election positions */
export const PARTY_BASELINES: Record<string, { social: number; economic: number }> = {
  labour: { social: 10, economic: -25 },
  conservatives: { social: 55, economic: 35 },
  reform_uk: { social: 80, economic: 48 },
  liberal_democrats: { social: -65, economic: -15 },
  green: { social: -72, economic: -65 },
  snp: { social: -50, economic: -35 },
};

/** How quickly positions decay back toward baseline (0–1, higher = faster reversion) */
export const REVERSION_RATE = 0.05;

/** Maximum single-day movement per axis */
export const MAX_DAILY_DELTA = 3.0;
