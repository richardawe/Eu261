/**
 * Aggregates political signals into party positions, applying source/type weighting
 * and mean-reversion toward the 2024 election baseline.
 */
import type { PoliticalSignal, PartyPosition } from '../lib/types';
import {
  PARTY_BASELINES,
  POLICY_AXIS_WEIGHTS,
  REVERSION_RATE,
  MAX_DAILY_DELTA,
} from '../lib/weights';

const PARTY_META: Record<string, { partyName: string; shortName: string; color: string }> = {
  labour:           { partyName: 'Labour',           shortName: 'Lab', color: '#E4003B' },
  conservatives:    { partyName: 'Conservative',     shortName: 'Con', color: '#0087DC' },
  reform_uk:        { partyName: 'Reform UK',         shortName: 'Ref', color: '#12B6CF' },
  liberal_democrats:{ partyName: 'Liberal Democrats', shortName: 'LD',  color: '#FAA61A' },
  green:            { partyName: 'Green Party',       shortName: 'Grn', color: '#02A95B' },
  snp:              { partyName: 'SNP',               shortName: 'SNP', color: '#EDDB49' },
};

const DIRECTION_TO_AXIS_DELTA: Record<string, { social: number; economic: number }> = {
  more_conservative:    { social: +1, economic: 0 },
  more_progressive:     { social: -1, economic: 0 },
  more_economic_left:   { social: 0, economic: -1 },
  more_economic_right:  { social: 0, economic: +1 },
  no_change:            { social: 0, economic: 0 },
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function calculatePositions(
  signals: PoliticalSignal[],
  previousPositions: Map<string, PartyPosition>
): PartyPosition[] {
  const partyIds = Object.keys(PARTY_META);

  return partyIds.map((partyId) => {
    const baseline = PARTY_BASELINES[partyId] ?? { social: 0, economic: 0 };
    const prev = previousPositions.get(partyId);
    const startSocial = prev?.socialScore ?? baseline.social;
    const startEconomic = prev?.economicScore ?? baseline.economic;

    // Collect signals for this party
    const partySignals = signals.filter((s) => s.party === partyId);

    // Aggregate weighted deltas
    let socialDelta = 0;
    let economicDelta = 0;
    let totalWeight = 0;
    const evidenceLines: string[] = [];

    for (const sig of partySignals) {
      const axisWeights = POLICY_AXIS_WEIGHTS[sig.policyArea] ?? { social: 0.5, economic: 0.5 };
      const dirDelta = DIRECTION_TO_AXIS_DELTA[sig.direction] ?? { social: 0, economic: 0 };
      const weight = sig.sourceWeight * sig.strength;

      socialDelta += dirDelta.social * axisWeights.social * weight * 10;
      economicDelta += dirDelta.economic * axisWeights.economic * weight * 10;
      totalWeight += weight;

      if (sig.evidence) {
        evidenceLines.push(`[${sig.policyArea}] ${sig.evidence}`);
      }
    }

    // Clamp to max daily movement
    socialDelta = clamp(socialDelta, -MAX_DAILY_DELTA, MAX_DAILY_DELTA);
    economicDelta = clamp(economicDelta, -MAX_DAILY_DELTA, MAX_DAILY_DELTA);

    // Apply mean reversion toward baseline
    const reversionSocial = (baseline.social - startSocial) * REVERSION_RATE;
    const reversionEconomic = (baseline.economic - startEconomic) * REVERSION_RATE;

    const newSocial = clamp(startSocial + socialDelta + reversionSocial, -100, 100);
    const newEconomic = clamp(startEconomic + economicDelta + reversionEconomic, -100, 100);

    // Confidence: based on signal volume and source quality
    const rawConfidence = partySignals.length > 0
      ? Math.min(0.95, 0.5 + totalWeight * 0.15)
      : prev?.confidence ?? 0.6;

    const meta = PARTY_META[partyId];

    return {
      partyId,
      partyName: meta.partyName,
      shortName: meta.shortName,
      color: meta.color,
      socialScore: parseFloat(newSocial.toFixed(1)),
      economicScore: parseFloat(newEconomic.toFixed(1)),
      confidence: parseFloat(rawConfidence.toFixed(2)),
      reasoning: evidenceLines.slice(0, 4),
      sources: [...new Set(partySignals.map((s) => s.source))],
      timestamp: new Date().toISOString(),
    };
  });
}

export function computeWeeklyShifts(
  current: PartyPosition[],
  weekAgo: PartyPosition[]
) {
  return current.map((pos) => {
    const old = weekAgo.find((p) => p.partyId === pos.partyId);
    const socialDelta = old ? parseFloat((pos.socialScore - old.socialScore).toFixed(1)) : 0;
    const economicDelta = old ? parseFloat((pos.economicScore - old.economicScore).toFixed(1)) : 0;
    const magnitude = parseFloat(Math.sqrt(socialDelta ** 2 + economicDelta ** 2).toFixed(1));

    let description = `${pos.partyName} `;
    if (magnitude < 0.5) {
      description += 'remained stable this week.';
    } else {
      const parts: string[] = [];
      if (Math.abs(socialDelta) > 0.3) {
        parts.push(`moved ${socialDelta > 0 ? 'toward the conservative axis' : 'toward the progressive axis'}`);
      }
      if (Math.abs(economicDelta) > 0.3) {
        parts.push(`shifted ${economicDelta > 0 ? 'economically right' : 'economically left'}`);
      }
      description += parts.join(' and ') + '.';
    }

    return { partyId: pos.partyId, partyName: pos.partyName, socialDelta, economicDelta, description, magnitude };
  });
}
