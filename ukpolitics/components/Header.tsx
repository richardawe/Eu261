'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
}

const NAV: NavItem[] = [
  { href: '/', label: 'Matrix' },
  { href: '/history', label: 'History' },
  { href: '/methodology', label: 'Methodology' },
];

export default function Header({ lastUpdated }: { lastUpdated?: string }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-surface-border bg-surface-raised px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-accent font-mono text-lg font-bold tracking-tight">UK/POLITICS</span>
            <span className="text-ink-faint font-mono text-xs bg-surface-overlay border border-surface-border px-1.5 py-0.5 rounded">
              AI MATRIX
            </span>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname === item.href + '/';
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-xs font-mono px-3 py-1.5 rounded transition-colors ${
                  active
                    ? 'bg-accent text-white'
                    : 'text-ink-muted hover:text-ink hover:bg-surface-overlay'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {lastUpdated && (
          <div className="text-xs font-mono text-ink-faint">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />
            Updated{' '}
            {new Date(lastUpdated).toLocaleString('en-GB', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        )}
      </div>
    </header>
  );
}
