'use client';

import type { SourceItem } from '@/lib/types';

interface Props {
  sources: SourceItem[];
  limit?: number;
}

function CredibilityDot({ weight }: { weight: number }) {
  const color = weight >= 0.9 ? '#22c55e' : weight >= 0.75 ? '#f59e0b' : '#94a3b8';
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
      style={{ backgroundColor: color }}
      title={`Source weight: ${weight}`}
    />
  );
}

export default function SourceList({ sources, limit = 8 }: Props) {
  const shown = sources.slice(0, limit);

  return (
    <div>
      <h3 className="text-xs font-mono uppercase tracking-widest text-ink-faint mb-3">
        Sources ({sources.length})
      </h3>
      <ul className="space-y-2">
        {shown.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <CredibilityDot weight={s.weight} />
            <div className="flex-1 min-w-0">
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink-muted hover:text-accent transition-colors line-clamp-1 block"
                title={s.title}
              >
                {s.title}
              </a>
              <span className="text-ink-faint font-mono">{s.source}</span>
              {s.publishedAt && (
                <span className="text-ink-faint ml-2">
                  {new Date(s.publishedAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {sources.length > limit && (
        <p className="text-xs text-ink-faint mt-2 font-mono">
          +{sources.length - limit} more sources
        </p>
      )}
    </div>
  );
}
