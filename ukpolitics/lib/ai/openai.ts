import type { AIProvider, PoliticalSignal, PartyShift, PartyPosition } from '../types';
import { SIGNAL_EXTRACTION_PROMPT, COMMENTARY_PROMPT } from './index';

export class OpenAIProvider implements AIProvider {
  name = 'openai';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
  }

  private async chat(systemPrompt: string, userContent: string): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices[0].message.content;
  }

  async extractSignals(articleText: string, parties: string[]): Promise<PoliticalSignal[]> {
    const raw = await this.chat(
      SIGNAL_EXTRACTION_PROMPT(parties),
      `Article:\n${articleText.slice(0, 3000)}`
    );
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : parsed.signals ?? [];
    } catch {
      return [];
    }
  }

  async generateCommentary(shifts: PartyShift[], positions: PartyPosition[]): Promise<string[]> {
    const raw = await this.chat(
      'You are a political analyst. Return only valid JSON.',
      COMMENTARY_PROMPT(shifts, positions)
    );
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : parsed.commentary ?? [];
    } catch {
      return [];
    }
  }
}
