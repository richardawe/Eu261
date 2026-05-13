/**
 * Generates initial seed data using the AI provider.
 *
 * Called once to bootstrap public/data/ before the regular pipeline has run.
 * Uses the AI to estimate current party positions from a structured prompt
 * rather than live RSS data.
 *
 * Run with: npm run politics:seed
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getAIProvider } from '../lib/ai/index';
import type { DailySnapshot, PartyPosition, DataManifest } from '../lib/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'public', 'data');
const HISTORY_DIR = join(DATA_DIR, 'history');

function today(): string {
  return new Date().toISOString().split('T')[0];
}

const SEED_PROMPT = `
You are a political analyst. Estimate the current ideological positions of the following UK political parties
as of ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}, based on their recent
policy announcements, rhetoric, and public statements.

Score each party on two axes:
- socialScore: -100 (progressive/liberal) to +100 (conservative/nationalist)
- economicScore: -100 (economic left) to +100 (economic right)

Parties: Labour, Conservative, Reform UK, Liberal Democrats, Green Party, SNP

Return a JSON object with this exact structure:
{
  "positions": [
    {
      "partyId": "labour",
      "socialScore": <number>,
      "economicScore": <number>,
      "confidence": <0.0-1.0>,
      "reasoning": ["<point 1>", "<point 2>", "<point 3>"]
    },
    ...
  ],
  "commentary": ["<paragraph 1>", "<paragraph 2>", "<paragraph 3>", "<paragraph 4>"]
}

partyId values must be exactly: labour, conservatives, reform_uk, liberal_democrats, green, snp
`;

const PARTY_META: Record<string, { partyName: string; shortName: string; color: string }> = {
  labour:            { partyName: 'Labour',           shortName: 'Lab', color: '#E4003B' },
  conservatives:     { partyName: 'Conservative',     shortName: 'Con', color: '#0087DC' },
  reform_uk:         { partyName: 'Reform UK',        shortName: 'Ref', color: '#12B6CF' },
  liberal_democrats: { partyName: 'Liberal Democrats',shortName: 'LD',  color: '#FAA61A' },
  green:             { partyName: 'Green Party',       shortName: 'Grn', color: '#02A95B' },
  snp:               { partyName: 'SNP',               shortName: 'SNP', color: '#EDDB49' },
};

async function seed() {
  console.log('='.repeat(50));
  console.log('UK Politics — Seed Data Generator');
  console.log(`Date: ${today()}`);
  console.log('='.repeat(50));

  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(HISTORY_DIR, { recursive: true });

  const provider = getAIProvider();
  console.log(`\nUsing AI provider: ${provider.name}`);
  console.log('Requesting initial position estimates from AI…');

  let rawResponse = '';
  try {
    // OpenAI-compatible endpoint (works for OpenRouter, OpenAI, or any compatible provider)
    const isAnthropic = provider.name === 'anthropic';

    if (isAnthropic) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system: 'You are a political analyst. Return only valid JSON with no markdown.',
          messages: [{ role: 'user', content: SEED_PROMPT }],
        }),
      });
      const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
      rawResponse = data.content.find((c) => c.type === 'text')?.text ?? '';
    } else {
      // OpenRouter or OpenAI (both use the same chat completions format)
      const baseUrl = provider.name === 'openrouter'
        ? 'https://openrouter.ai/api/v1'
        : 'https://api.openai.com/v1';
      const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY!;
      const model = provider.name === 'openrouter' ? 'openai/gpt-4o-mini' : 'gpt-4o-mini';

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...(provider.name === 'openrouter' ? {
            'HTTP-Referer': 'https://github.com/richardawe/eu261',
            'X-Title': 'UK Politics AI Matrix',
          } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You are a political analyst. Return only valid JSON with no markdown.' },
            { role: 'user', content: SEED_PROMPT },
          ],
          temperature: 0.4,
          response_format: { type: 'json_object' },
        }),
      });
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      rawResponse = data.choices[0].message.content;
    }
  } catch (e) {
    console.error('API call failed:', e);
    process.exit(1);
  }

  let parsed: { positions: Array<{ partyId: string; socialScore: number; economicScore: number; confidence: number; reasoning: string[] }>; commentary: string[] };
  try {
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawResponse);
  } catch (e) {
    console.error('Failed to parse AI response:', rawResponse);
    process.exit(1);
  }

  const positions: PartyPosition[] = parsed.positions.map((p) => {
    const meta = PARTY_META[p.partyId];
    if (!meta) {
      console.warn(`  Unknown partyId: ${p.partyId} — skipping`);
      return null;
    }
    return {
      partyId: p.partyId,
      partyName: meta.partyName,
      shortName: meta.shortName,
      color: meta.color,
      socialScore: parseFloat(Number(p.socialScore).toFixed(1)),
      economicScore: parseFloat(Number(p.economicScore).toFixed(1)),
      confidence: parseFloat(Math.min(1, Math.max(0, p.confidence)).toFixed(2)),
      reasoning: p.reasoning ?? [],
      sources: ['AI seed generation'],
      timestamp: new Date().toISOString(),
    };
  }).filter(Boolean) as PartyPosition[];

  const snapshot: DailySnapshot = {
    date: today(),
    generatedAt: new Date().toISOString(),
    positions,
    commentary: parsed.commentary ?? [],
    weeklyShifts: [],
    sources: [
      { url: 'https://www.bbc.co.uk/news/politics', title: 'BBC Politics', source: 'BBC Politics', weight: 0.9, publishedAt: new Date().toISOString() },
      { url: 'https://www.theguardian.com/politics', title: 'Guardian Politics', source: 'Guardian', weight: 0.8, publishedAt: new Date().toISOString() },
    ],
  };

  const dateStr = today();
  writeFileSync(join(DATA_DIR, 'latest.json'), JSON.stringify(snapshot, null, 2));
  writeFileSync(join(HISTORY_DIR, `${dateStr}.json`), JSON.stringify(snapshot, null, 2));

  const manifest: DataManifest = {
    latestDate: dateStr,
    dates: [dateStr],
    generatedAt: snapshot.generatedAt,
  };
  writeFileSync(join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('\n✓ Seed data generated');
  console.log(`  Parties: ${positions.length}`);
  console.log(`  Commentary: ${snapshot.commentary.length} paragraphs`);
  console.log('\nPositions:');
  for (const p of positions) {
    console.log(`  ${p.partyName.padEnd(22)} social=${String(p.socialScore).padStart(5)}  economic=${String(p.economicScore).padStart(5)}  conf=${p.confidence}`);
  }
}

seed().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
