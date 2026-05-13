'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { DailySnapshot } from '@/lib/types';

interface Props {
  history: DailySnapshot[];
  axis: 'social' | 'economic';
}

const PARTY_META: Record<string, { color: string; label: string }> = {
  labour: { color: '#E4003B', label: 'Labour' },
  conservatives: { color: '#0087DC', label: 'Conservative' },
  reform_uk: { color: '#12B6CF', label: 'Reform UK' },
  liberal_democrats: { color: '#FAA61A', label: 'Lib Dems' },
  green: { color: '#02A95B', label: 'Green' },
  snp: { color: '#EDDB49', label: 'SNP' },
};

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function TrendChart({ history, axis }: Props) {
  const data = history.map((snap) => {
    const row: Record<string, string | number> = { date: shortDate(snap.date) };
    for (const pos of snap.positions) {
      row[pos.partyId] = axis === 'social' ? pos.socialScore : pos.economicScore;
    }
    return row;
  });

  const parties = Object.keys(PARTY_META);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 4" stroke="#1e2d4a" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
          tickLine={false}
          axisLine={{ stroke: '#1e2d4a' }}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[-100, 100]}
          tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
          tickLine={false}
          axisLine={{ stroke: '#1e2d4a' }}
          tickFormatter={(v) => (v > 0 ? `+${v}` : String(v))}
        />
        <ReferenceLine y={0} stroke="#334155" strokeWidth={1} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#0f1629',
            border: '1px solid #1e2d4a',
            borderRadius: 4,
            fontFamily: 'monospace',
            fontSize: 11,
          }}
          labelStyle={{ color: '#94a3b8' }}
          formatter={(value: number, name: string) => [
            `${value > 0 ? '+' : ''}${Number(value).toFixed(1)}`,
            PARTY_META[name]?.label ?? name,
          ]}
        />
        <Legend
          formatter={(value) => (
            <span style={{ color: PARTY_META[value]?.color, fontFamily: 'monospace', fontSize: 11 }}>
              {PARTY_META[value]?.label ?? value}
            </span>
          )}
        />
        {parties.map((partyId) => (
          <Line
            key={partyId}
            type="monotone"
            dataKey={partyId}
            stroke={PARTY_META[partyId].color}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
