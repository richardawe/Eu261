/**
 * Generates neutral AI commentary about party position changes.
 */
import type { PartyShift, PartyPosition } from '../lib/types';
import { getAIProvider } from '../lib/ai/index';

const FALLBACK_COMMENTARY = [
  'Insufficient new political signals were detected in today\'s news cycle to generate updated AI commentary.',
];

export async function generateCommentary(
  shifts: PartyShift[],
  positions: PartyPosition[]
): Promise<string[]> {
  const significantShifts = shifts.filter((s) => s.magnitude >= 0.5);

  if (significantShifts.length === 0) {
    return FALLBACK_COMMENTARY;
  }

  try {
    const provider = getAIProvider();
    const commentary = await provider.generateCommentary(significantShifts, positions);
    if (commentary.length > 0) {
      return commentary;
    }
  } catch (e) {
    console.warn(`  Commentary generation failed: ${(e as Error).message}`);
  }

  // Rule-based fallback
  return significantShifts.slice(0, 4).map((s) => {
    const parts: string[] = [];
    if (Math.abs(s.socialDelta) > 0.3) {
      parts.push(
        s.socialDelta > 0
          ? `moved toward the conservative axis on social issues`
          : `shifted toward more progressive social positioning`
      );
    }
    if (Math.abs(s.economicDelta) > 0.3) {
      parts.push(
        s.economicDelta > 0
          ? `shifted economically right`
          : `adopted a more economically left-leaning stance`
      );
    }
    return `${s.partyName} ${parts.join(' and ')} this week, based on detected signals in monitored news sources.`;
  });
}
