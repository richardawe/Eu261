import type { AIProvider, PoliticalSignal, PartyShift, PartyPosition } from '../types';
import { SIGNAL_EXTRACTION_PROMPT, COMMENTARY_PROMPT } from './index';

export class AnthropicProvider implements AIProvider {
  name = 'anthropic';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'claude-haiku-4-5-20251001') {
    this.apiKey = apiKey;
    this.model = model;
  }

  private async message(systemPrompt: string, userContent: string): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
    return data.content.find((c) => c.type === 'text')?.text ?? '';
  }

  async extractSignals(articleText: string, parties: string[]): Promise<PoliticalSignal[]> {
    const raw = await this.message(
      SIGNAL_EXTRACTION_PROMPT(parties) + '\nReturn ONLY a valid JSON array.',
      `Article:\n${articleText.slice(0, 3000)}`
    );
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      return jsonMatch ? (JSON.parse(jsonMatch[0]) as PoliticalSignal[]) : [];
    } catch {
      return [];
    }
  }

  async generateCommentary(shifts: PartyShift[], positions: PartyPosition[]): Promise<string[]> {
    const raw = await this.message(
      'You are a political analyst. Return only a valid JSON array of strings.',
      COMMENTARY_PROMPT(shifts, positions)
    );
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      return jsonMatch ? (JSON.parse(jsonMatch[0]) as string[]) : [];
    } catch {
      return [];
    }
  }
}
