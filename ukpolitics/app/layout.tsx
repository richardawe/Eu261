import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'UK Politics AI Matrix',
  description:
    'Live AI-estimated ideological positioning of UK political parties mapped to a dynamic 2×2 political compass.',
  robots: 'index, follow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface text-ink antialiased">
        {children}
        <footer className="border-t border-surface-border mt-12 py-6 px-4">
          <div className="max-w-7xl mx-auto text-center">
            <p className="text-xs text-ink-faint font-mono leading-relaxed">
              Positions are AI-estimated ideological mappings derived from public political signals. &nbsp;
              This is not a truth engine — it is probabilistic, inference-based, and trend-oriented. &nbsp;
              Not affiliated with any political party.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
