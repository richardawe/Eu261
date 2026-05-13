import Header from '@/components/Header';

const SOURCE_WEIGHTS = [
  { source: 'Official speeches / Hansard', weight: '1.0', note: 'Direct statements carry maximum weight' },
  { source: 'Party manifestos', weight: '1.0', note: 'Formal policy commitments' },
  { source: 'Reuters UK Politics', weight: '0.95', note: 'High-credibility wire service' },
  { source: 'BBC Politics', weight: '0.90', note: 'Verified public-service journalism' },
  { source: 'Financial Times', weight: '0.90', note: 'Strong economic policy coverage' },
  { source: 'Guardian Politics', weight: '0.80', note: 'Solid political reporting' },
  { source: 'The Telegraph', weight: '0.80', note: 'Strong Conservative-sphere coverage' },
  { source: 'Sky News Politics', weight: '0.80', note: 'Broadcast political reporting' },
  { source: 'PoliticsHome', weight: '0.75', note: 'Westminster-focused aggregator' },
  { source: 'Opinion columns', weight: '0.30', note: 'Low weight — signalling only' },
  { source: 'Social media', weight: '0.20', note: 'Excluded from core scoring' },
];

const POLICY_WEIGHTS = [
  { area: 'Immigration', social: '0.9', economic: '0.1' },
  { area: 'Taxation', social: '0.05', economic: '0.95' },
  { area: 'Healthcare', social: '0.15', economic: '0.75' },
  { area: 'Environment / Net Zero', social: '0.40', economic: '0.55' },
  { area: 'Defence', social: '0.65', economic: '0.30' },
  { area: 'Economy (general)', social: '0.00', economic: '1.0' },
  { area: 'Housing', social: '0.25', economic: '0.70' },
  { area: 'Welfare', social: '0.20', economic: '0.80' },
  { area: 'Foreign Policy', social: '0.50', economic: '0.45' },
  { area: 'Constitutional / Civil Liberties', social: '0.85', economic: '0.10' },
  { area: 'Law & Order', social: '0.90', economic: '0.10' },
  { area: 'Trade', social: '0.20', economic: '0.80' },
];

export default function MethodologyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-mono font-bold text-ink tracking-tight mb-2">Methodology</h1>
        <p className="text-sm text-ink-faint mb-8">
          How the AI Political Matrix estimates party positions — transparently.
        </p>

        {/* Disclaimer box */}
        <div className="mb-8 p-4 rounded border border-amber-900/50 bg-amber-950/20">
          <p className="text-sm font-mono text-amber-300">
            This is not a truth engine. Positions are probabilistic, inference-based, and
            trend-oriented — derived from public political signals, not verified polling data or
            official measurements. Treat all scores as approximations.
          </p>
        </div>

        <section className="space-y-10">
          {/* Axes */}
          <div>
            <h2 className="text-base font-mono font-semibold text-ink mb-3 pb-1 border-b border-surface-border">
              The Axes
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="p-4 bg-surface-raised border border-surface-border rounded">
                <div className="font-mono font-semibold text-accent mb-2">Horizontal — Social Axis</div>
                <p className="text-ink-muted text-xs leading-relaxed">
                  Measures cultural and social positioning.<br />
                  <strong className="text-blue-400">−100</strong> = Progressive / Liberal (open
                  borders, civil liberties, social reform)<br />
                  <strong className="text-orange-400">+100</strong> = Conservative / Nationalist
                  (traditional values, strong borders, national identity)
                </p>
              </div>
              <div className="p-4 bg-surface-raised border border-surface-border rounded">
                <div className="font-mono font-semibold text-accent mb-2">Vertical — Economic Axis</div>
                <p className="text-ink-muted text-xs leading-relaxed">
                  Measures economic positioning.<br />
                  <strong className="text-blue-400">−100</strong> = Economic Left (public ownership,
                  redistribution, high public spending)<br />
                  <strong className="text-orange-400">+100</strong> = Economic Right (low tax,
                  deregulation, free-market capitalism)
                </p>
              </div>
            </div>
          </div>

          {/* Pipeline */}
          <div>
            <h2 className="text-base font-mono font-semibold text-ink mb-3 pb-1 border-b border-surface-border">
              AI Analysis Pipeline
            </h2>
            <ol className="space-y-4 text-sm">
              {[
                {
                  step: '1. Source Ingestion',
                  desc: 'RSS feeds from BBC Politics, Guardian, Sky News, Reuters, FT, and Telegraph are fetched every 6 hours. Articles are deduplicated by URL and title similarity.',
                },
                {
                  step: '2. Signal Extraction',
                  desc: 'Each article is passed to a large language model (OpenAI GPT-4o-mini or Claude Haiku). The model identifies which party is mentioned, the policy area, and the directional signal — e.g. "Labour signals tougher immigration stance (strength 0.6, social impact +0.7)".',
                },
                {
                  step: '3. Type Classification',
                  desc: 'The model distinguishes between: legislation (weight ×1.0), policy announcement (×0.85), rhetoric (×0.5), electoral triangulation (×0.6), and signalling (×0.4). Not all statements move the matrix equally.',
                },
                {
                  step: '4. Axis Weighting',
                  desc: 'Each signal is split between the social and economic axes using policy-area weights (see table below). Immigration signals primarily affect the social axis; taxation signals primarily affect the economic axis.',
                },
                {
                  step: '5. Position Aggregation',
                  desc: 'Signals are weighted by source credibility and type, then aggregated into a daily position delta. A mean-reversion factor (5% per day) prevents excessive drift from baseline positions established at the 2024 general election.',
                },
                {
                  step: '6. Commentary Generation',
                  desc: 'A second LLM pass generates neutral, analytical commentary explaining the observed shifts. The prompt explicitly prohibits partisan framing.',
                },
                {
                  step: '7. Snapshot Storage',
                  desc: 'Daily snapshots are saved as static JSON files in /data/history/YYYY-MM-DD.json. The frontend reads these files directly — no server required.',
                },
              ].map((item) => (
                <li key={item.step} className="flex gap-4">
                  <span className="font-mono text-accent font-semibold text-xs mt-0.5 w-32 shrink-0">
                    {item.step}
                  </span>
                  <p className="text-ink-muted leading-relaxed text-xs">{item.desc}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* Source weights */}
          <div>
            <h2 className="text-base font-mono font-semibold text-ink mb-3 pb-1 border-b border-surface-border">
              Source Credibility Weights
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-ink-faint border-b border-surface-border">
                    <th className="text-left py-2">Source</th>
                    <th className="text-right py-2">Weight</th>
                    <th className="text-left py-2 pl-4">Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  {SOURCE_WEIGHTS.map((row) => (
                    <tr key={row.source} className="border-b border-surface-border hover:bg-surface-overlay">
                      <td className="py-2 text-ink-muted">{row.source}</td>
                      <td className="text-right text-accent">{row.weight}</td>
                      <td className="pl-4 text-ink-faint">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Policy axis weights */}
          <div>
            <h2 className="text-base font-mono font-semibold text-ink mb-3 pb-1 border-b border-surface-border">
              Policy Area → Axis Mapping
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-ink-faint border-b border-surface-border">
                    <th className="text-left py-2">Policy Area</th>
                    <th className="text-right py-2">Social Weight</th>
                    <th className="text-right py-2">Economic Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {POLICY_WEIGHTS.map((row) => (
                    <tr key={row.area} className="border-b border-surface-border hover:bg-surface-overlay">
                      <td className="py-2 text-ink-muted">{row.area}</td>
                      <td className="text-right text-blue-400">{row.social}</td>
                      <td className="text-right text-orange-400">{row.economic}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Limitations */}
          <div>
            <h2 className="text-base font-mono font-semibold text-ink mb-3 pb-1 border-b border-surface-border">
              Known Limitations
            </h2>
            <ul className="space-y-2 text-xs text-ink-muted">
              {[
                'LLM signal extraction is imperfect — models may misclassify nuanced policy positions.',
                'RSS feeds capture mainstream media coverage; niche or specialist political publications are not monitored.',
                'The scoring model reflects individual statements and rhetoric, not necessarily enacted policy.',
                'Baseline positions are set at the 2024 general election — earlier historical comparisons are not available.',
                'Confidence scores reflect source quality and signal volume, not external validation.',
                'SNP positions are evaluated primarily through their Westminster parliamentary activity, which may not reflect Holyrood policy positions.',
              ].map((l) => (
                <li key={l} className="flex gap-2">
                  <span className="text-ink-faint mt-0.5">—</span>
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
