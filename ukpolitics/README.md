# UK Politics AI Positioning Matrix

A live political intelligence dashboard that monitors UK news, uses AI to infer party ideological positions, and maps them onto a dynamic 2×2 political compass. Deployed via GitHub Pages as a static site updated every 6 hours.

---

## Quick Start

```bash
cd ukpolitics
npm install

# Option A — seed initial data using real AI (requires an API key)
export OPENROUTER_API_KEY=sk-or-...   # or OPENAI_API_KEY / ANTHROPIC_API_KEY
npm run politics:seed

# Option B — use pre-seeded data (already committed)
npm run politics:history   # regenerate 30-day synthetic history if needed

# Start dev server
npm run dev
# → http://localhost:3000
```

---

## Architecture

```
ukpolitics/
├── app/                     Next.js App Router pages
│   ├── page.tsx             Live matrix + commentary
│   ├── history/page.tsx     Timeline replay + trend charts
│   └── methodology/page.tsx Scoring explanation
├── components/
│   ├── PoliticalMatrix.tsx  SVG 2×2 compass (the centrepiece)
│   ├── CommentaryPanel.tsx  AI-generated analysis
│   ├── TrendChart.tsx       Recharts line chart for axis trends
│   ├── TimelineSlider.tsx   Date scrubber + playback
│   ├── MovementIndicator.tsx Weekly shift arrows
│   ├── ConfidenceIndicator.tsx Bar-chart confidence display
│   ├── SourceList.tsx       Credibility-weighted source list
│   └── Header.tsx           Navigation
├── lib/
│   ├── types.ts             TypeScript interfaces
│   ├── weights.ts           Source & policy-area weights, baselines
│   ├── mockData.ts          Dev utilities
│   └── ai/
│       ├── index.ts         Provider selection + shared prompts
│       ├── openai.ts        OpenAI adapter
│       ├── anthropic.ts     Anthropic adapter
│       └── openrouter.ts    OpenRouter adapter (default for this repo)
├── scripts/
│   ├── update.ts            Main pipeline orchestrator
│   ├── fetchNews.ts         RSS ingestion + deduplication
│   ├── extractSignals.ts    AI signal extraction per article
│   ├── calculatePositions.ts Weighted aggregation + mean-reversion
│   ├── generateCommentary.ts AI commentary generation
│   ├── saveSnapshots.ts     JSON persistence + manifest update
│   ├── seed.ts              One-shot AI baseline generator
│   └── generateHistory.ts  Dev utility: synthetic 30-day history
└── public/data/
    ├── latest.json          Current positions (served statically)
    ├── manifest.json        List of available history dates
    └── history/
        └── YYYY-MM-DD.json  Daily snapshots
```

---

## The Axes

| Axis | Min | Max |
|------|-----|-----|
| Horizontal (Social) | −100 Progressive/Liberal | +100 Conservative/Nationalist |
| Vertical (Economic) | −100 Economic Left | +100 Economic Right |

Positions are displayed as coloured nodes on the compass. Hover to see scores, confidence, and reasoning.

---

## AI Pipeline

Each run of `npm run politics:update`:

1. **Fetch** — pulls from BBC Politics, Guardian, Sky News, Reuters, FT, PoliticsHome RSS feeds
2. **Extract** — LLM assigns each article a political signal per party: direction, strength, policy area
3. **Classify** — distinguishes rhetoric (×0.5 weight) from policy (×0.85) from legislation (×1.0)
4. **Weight** — social/economic axis split per policy area; source credibility multiplier applied
5. **Aggregate** — weighted deltas applied to previous positions with 5%/day mean-reversion to 2024 baselines
6. **Comment** — second LLM call generates neutral analyst commentary on detected shifts
7. **Save** — `public/data/latest.json` and `public/data/history/YYYY-MM-DD.json` updated

---

## Supported AI Providers

Set **one** of the following environment variables:

| Variable | Provider | Notes |
|----------|----------|-------|
| `OPENROUTER_API_KEY` | OpenRouter | **Preferred** — same key as main Eu261 pipeline |
| `OPENAI_API_KEY` | OpenAI | Uses `gpt-4o-mini` |
| `ANTHROPIC_API_KEY` | Anthropic | Uses `claude-haiku-4-5-20251001` |

---

## GitHub Actions

The workflow `.github/workflows/ukpolitics-update.yml`:

- Runs **every 6 hours** (`0 */6 * * *`)
- Can be triggered manually via `workflow_dispatch`
- Fetches news → runs AI pipeline → builds Next.js static export → deploys to GitHub Pages
- Commits updated data files back to `main`

**Required Secrets** (set in repo Settings → Secrets):

| Secret | Required |
|--------|----------|
| `OPENROUTER_API_KEY` | Yes (or OPENAI / ANTHROPIC) |
| `SUBMISSIONS_TOKEN` | Only if using the main Eu261 claims site |

---

## GitHub Pages Deployment

The site is exported with `output: 'export'` and deployed at:

```
https://richardawe.github.io/eu261/ukpolitics/
```

The workflow builds the Next.js app and merges the output into the existing `site/` deployment.

For local development the basePath is empty — the app runs at `http://localhost:3000`.

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next.js development server |
| `npm run build` | Build static export (outputs to `out/`) |
| `npm run politics:update` | Full live pipeline (fetch + analyse + save) |
| `npm run politics:seed` | Generate initial data via AI (one-time setup) |
| `npm run politics:history` | Generate synthetic 30-day history for dev |
| `npm run politics:fetch` | Debug: fetch news only |
| `npm run politics:analyze` | Debug: extract signals only |
| `npm run politics:snapshot` | Debug: save snapshot only |

---

## Disclaimer

Positions are AI-estimated ideological mappings derived from public political signals. This is not a truth engine — it is probabilistic, inference-based, and trend-oriented. Not affiliated with any political party.
