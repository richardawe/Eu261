import type { AIProvider, PoliticalSignal, PartyShift, PartyPosition } from '../types';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { OpenRouterProvider } from './openrouter';

export function getAIProvider(): AIProvider {
  if (process.env.OPENROUTER_API_KEY) {
    return new OpenRouterProvider(process.env.OPENROUTER_API_KEY);
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIProvider(process.env.OPENAI_API_KEY);
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider(process.env.ANTHROPIC_API_KEY);
  }
  throw new Error(
    'No AI provider configured. Set OPENROUTER_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.'
  );
}

export const SIGNAL_EXTRACTION_PROMPT = (parties: string[]) => `
You are a political analyst. Given a news article about UK politics, extract political signals for the following parties: ${parties.join(', ')}.

For each relevant signal, return a JSON array of objects with this structure:
{
  "party": "labour|conservatives|reform_uk|liberal_democrats|green|snp",
  "policyArea": "immigration|taxation|healthcare|environment|defense|economy|education|housing|welfare|foreign_policy|constitutional|law_order|trade",
  "direction": "more_conservative|more_progressive|more_economic_left|more_economic_right|no_change",
  "strength": 0.0-1.0,
  "socialImpact": -1.0 to 1.0 (negative=progressive, positive=conservative),
  "economicImpact": -1.0 to 1.0 (negative=left, positive=right),
  "evidence": "brief quote or paraphrase from the article"
}

Distinguish between: rhetoric (low strength ~0.3-0.5), policy announcement (0.6-0.75), legislation/vote (0.85-1.0).
Return only the JSON array, no other text.
`;

export const COMMENTARY_PROMPT = (shifts: PartyShift[], positions: PartyPosition[]) => `
You are a senior political analyst writing for a neutral, data-driven political intelligence service.

Based on the following weekly position shifts and current standings, write 4-6 concise analytical observations (one per paragraph, 1-2 sentences each).
Tone: analytical, neutral, newsroom-grade. Avoid partisan framing.

Current positions (socialScore: -100=progressive to +100=conservative, economicScore: -100=left to +100=right):
${positions.map(p => `- ${p.partyName}: social=${p.socialScore}, economic=${p.economicScore}`).join('\n')}

Weekly shifts:
${shifts.map(s => `- ${s.partyName}: social delta=${s.socialDelta > 0 ? '+' : ''}${s.socialDelta}, economic delta=${s.economicDelta > 0 ? '+' : ''}${s.economicDelta}`).join('\n')}

Return a JSON array of strings (each string is one analytical paragraph).
`;

export type { AIProvider, PoliticalSignal, PartyShift, PartyPosition };
