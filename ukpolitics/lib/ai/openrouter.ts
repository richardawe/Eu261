/**
 * OpenRouter adapter — OpenAI-compatible API aggregator.
 * Uses free-tier models matching the rest of the Eu261 pipeline (see engine/models.yaml).
 */
import type { AIProvider, PoliticalSignal, PartyShift, PartyPosition } from '../types';
import { SIGNAL_EXTRACTION_PROMPT, COMMENTARY_PROMPT } from './index';

const BASE_URL = 'https://openrouter.ai/api/v1';

const MODEL = 'openai/gpt-oss-120b:free';

export class OpenRouterProvider implements AIProvider {
  name = 'openrouter';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async chat(
    systemPrompt: string,
    userContent: string,
    model: string,
    maxTokens: number
  ): Promise<string> {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/richardawe/Eu261',
        'X-Title': 'UK Politics AI Matrix',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenRouter API error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices[0].message.content;
  }

  async extractSignals(articleText: string, parties: string[]): Promise<PoliticalSignal[]> {
    // Extraction only returns a small JSON array — 1024 tokens is more than enough
    const raw = await this.chat(
      SIGNAL_EXTRACTION_PROMPT(parties) +
        '\nReturn a JSON array of signal objects. No markdown, no explanation — only the JSON array.',
      `Article:\n${articleText.slice(0, 2000)}`,
      MODEL,
      1024
    );
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      return jsonMatch ? (JSON.parse(jsonMatch[0]) as PoliticalSignal[]) : [];
    } catch {
      return [];
    }
  }

  async generateCommentary(shifts: PartyShift[], positions: PartyPosition[]): Promise<string[]> {
    // Commentary is 4–6 short paragraphs — 2048 tokens is ample
    const raw = await this.chat(
      'You are a political analyst. Return a JSON array of strings (one analytical paragraph per string). No markdown, no explanation — only the JSON array.',
      COMMENTARY_PROMPT(shifts, positions),
      MODEL,
      2048
    );
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      return jsonMatch ? (JSON.parse(jsonMatch[0]) as string[]) : [];
    } catch {
      return [];
    }
  }
}
