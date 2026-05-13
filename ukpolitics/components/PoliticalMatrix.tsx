'use client';

import { useState, useCallback } from 'react';
import type { PartyPosition } from '@/lib/types';

interface Props {
  positions: PartyPosition[];
  /** Previous positions to draw movement trails */
  trail?: PartyPosition[][];
  animated?: boolean;
}

const VIEWBOX_SIZE = 620;
const MARGIN = 70;
const PLOT_SIZE = VIEWBOX_SIZE - MARGIN * 2;
const CENTER = VIEWBOX_SIZE / 2;
const SCALE = PLOT_SIZE / 2 / 100;

function toSvgX(socialScore: number) {
  return CENTER + socialScore * SCALE;
}
function toSvgY(economicScore: number) {
  // negative economic score (left) → low Y (top of SVG)
  return CENTER + economicScore * SCALE;
}

const QUADRANT_LABELS = [
  { x: MARGIN + 8, y: MARGIN + 18, label: 'AUTH. LEFT', color: '#ef4444' },
  { x: CENTER + 8, y: MARGIN + 18, label: 'AUTH. RIGHT', color: '#f97316' },
  { x: MARGIN + 8, y: CENTER + 18, label: 'PROG. LEFT', color: '#3b82f6' },
  { x: CENTER + 8, y: CENTER + 18, label: 'PROG. RIGHT', color: '#a855f7' },
];

const TICK_VALUES = [-75, -50, -25, 25, 50, 75];

interface Tooltip {
  party: PartyPosition;
  x: number;
  y: number;
}

export default function PoliticalMatrix({ positions, trail, animated = false }: Props) {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const handleMouseEnter = useCallback(
    (party: PartyPosition, svgX: number, svgY: number) => {
      setTooltip({ party, x: svgX, y: svgY });
    },
    []
  );
  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        className="w-full h-auto select-none"
        aria-label="UK Political Positioning Matrix"
      >
        {/* Quadrant backgrounds */}
        <rect x={MARGIN} y={MARGIN} width={PLOT_SIZE / 2} height={PLOT_SIZE / 2} fill="rgba(239,68,68,0.05)" />
        <rect x={CENTER} y={MARGIN} width={PLOT_SIZE / 2} height={PLOT_SIZE / 2} fill="rgba(249,115,22,0.05)" />
        <rect x={MARGIN} y={CENTER} width={PLOT_SIZE / 2} height={PLOT_SIZE / 2} fill="rgba(59,130,246,0.06)" />
        <rect x={CENTER} y={CENTER} width={PLOT_SIZE / 2} height={PLOT_SIZE / 2} fill="rgba(168,85,247,0.05)" />

        {/* Outer border */}
        <rect
          x={MARGIN}
          y={MARGIN}
          width={PLOT_SIZE}
          height={PLOT_SIZE}
          fill="none"
          stroke="#1e2d4a"
          strokeWidth="1"
        />

        {/* Grid lines */}
        {TICK_VALUES.map((v) => (
          <g key={v}>
            <line
              x1={toSvgX(v)}
              y1={MARGIN}
              x2={toSvgX(v)}
              y2={MARGIN + PLOT_SIZE}
              stroke="#1e2d4a"
              strokeWidth="0.5"
              strokeDasharray="3 4"
            />
            <line
              x1={MARGIN}
              y1={toSvgY(v)}
              x2={MARGIN + PLOT_SIZE}
              y2={toSvgY(v)}
              stroke="#1e2d4a"
              strokeWidth="0.5"
              strokeDasharray="3 4"
            />
          </g>
        ))}

        {/* Main axes */}
        <line x1={MARGIN} y1={CENTER} x2={MARGIN + PLOT_SIZE} y2={CENTER} stroke="#334155" strokeWidth="1.5" />
        <line x1={CENTER} y1={MARGIN} x2={CENTER} y2={MARGIN + PLOT_SIZE} stroke="#334155" strokeWidth="1.5" />

        {/* Quadrant labels */}
        {QUADRANT_LABELS.map((q) => (
          <text
            key={q.label}
            x={q.x}
            y={q.y}
            fill={q.color}
            fontSize="9"
            fontFamily="monospace"
            opacity="0.55"
            letterSpacing="0.08em"
          >
            {q.label}
          </text>
        ))}

        {/* Axis labels */}
        <text x={MARGIN + 4} y={CENTER - 6} fill="#64748b" fontSize="10" fontFamily="monospace">
          ← PROGRESSIVE
        </text>
        <text x={CENTER + 8} y={CENTER - 6} fill="#64748b" fontSize="10" fontFamily="monospace">
          CONSERVATIVE →
        </text>
        <text
          x={CENTER}
          y={MARGIN - 10}
          fill="#64748b"
          fontSize="10"
          fontFamily="monospace"
          textAnchor="middle"
        >
          ECONOMIC LEFT ↑
        </text>
        <text
          x={CENTER}
          y={MARGIN + PLOT_SIZE + 22}
          fill="#64748b"
          fontSize="10"
          fontFamily="monospace"
          textAnchor="middle"
        >
          ↓ ECONOMIC RIGHT
        </text>

        {/* Axis tick labels */}
        {[-50, 50].map((v) => (
          <g key={`tick-${v}`}>
            <text x={toSvgX(v)} y={CENTER + 14} fill="#475569" fontSize="8" textAnchor="middle" fontFamily="monospace">
              {v > 0 ? `+${v}` : v}
            </text>
            <text x={CENTER + 4} y={toSvgY(v) + 3} fill="#475569" fontSize="8" fontFamily="monospace">
              {v > 0 ? `+${v}` : v}
            </text>
          </g>
        ))}

        {/* Movement trails */}
        {trail &&
          trail.map((trailPositions, trailIdx) =>
            trailPositions.map((tp, i) => {
              if (i === 0) return null;
              const prev = trailPositions[i - 1];
              return (
                <line
                  key={`trail-${trailIdx}-${i}`}
                  x1={toSvgX(prev.socialScore)}
                  y1={toSvgY(prev.economicScore)}
                  x2={toSvgX(tp.socialScore)}
                  y2={toSvgY(tp.economicScore)}
                  stroke={tp.color}
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  opacity={0.15 + (i / trailPositions.length) * 0.35}
                />
              );
            })
          )}

        {/* Trail dots */}
        {trail &&
          trail.map((trailPositions, trailIdx) =>
            trailPositions.slice(0, -1).map((tp, i) => (
              <circle
                key={`tdot-${trailIdx}-${i}`}
                cx={toSvgX(tp.socialScore)}
                cy={toSvgY(tp.economicScore)}
                r="3"
                fill={tp.color}
                opacity={0.12 + (i / trailPositions.length) * 0.25}
              />
            ))
          )}

        {/* Party nodes */}
        {positions.map((p) => {
          const sx = toSvgX(p.socialScore);
          const sy = toSvgY(p.economicScore);
          const isHovered = tooltip?.party.partyId === p.partyId;

          return (
            <g
              key={p.partyId}
              transform={`translate(${sx},${sy})`}
              style={{ transition: animated ? 'transform 0.8s ease-in-out' : undefined }}
              onMouseEnter={() => handleMouseEnter(p, sx, sy)}
              onMouseLeave={handleMouseLeave}
              className="cursor-pointer"
            >
              {/* Confidence ring */}
              <circle
                r={isHovered ? 28 : 24}
                fill="none"
                stroke={p.color}
                strokeWidth="1.5"
                opacity={p.confidence * 0.4}
                style={{ transition: 'r 0.15s ease' }}
              />
              {/* Main dot */}
              <circle
                r={isHovered ? 22 : 18}
                fill={p.color}
                opacity={isHovered ? 1 : 0.88}
                style={{ transition: 'r 0.15s ease, opacity 0.15s ease' }}
              />
              {/* Party label */}
              <text
                dy="0.35em"
                textAnchor="middle"
                fill="white"
                fontSize={p.shortName.length > 3 ? '7' : '9'}
                fontFamily="monospace"
                fontWeight="700"
                pointerEvents="none"
              >
                {p.shortName}
              </text>
            </g>
          );
        })}

        {/* Tooltip */}
        {tooltip && (() => {
          const tx = tooltip.x;
          const ty = tooltip.y;
          const boxW = 170;
          const boxH = 90;
          const bx = Math.min(tx + 28, VIEWBOX_SIZE - boxW - 4);
          const by = Math.min(ty - 10, VIEWBOX_SIZE - boxH - 4);

          return (
            <g>
              <rect x={bx} y={by} width={boxW} height={boxH} rx="4" fill="#0f1629" stroke="#1e2d4a" strokeWidth="1" />
              <text x={bx + 10} y={by + 18} fill={tooltip.party.color} fontSize="11" fontWeight="700" fontFamily="monospace">
                {tooltip.party.partyName}
              </text>
              <text x={bx + 10} y={by + 33} fill="#94a3b8" fontSize="9" fontFamily="monospace">
                Social: {tooltip.party.socialScore > 0 ? '+' : ''}{tooltip.party.socialScore}
              </text>
              <text x={bx + 10} y={by + 45} fill="#94a3b8" fontSize="9" fontFamily="monospace">
                Economic: {tooltip.party.economicScore > 0 ? '+' : ''}{tooltip.party.economicScore}
              </text>
              <text x={bx + 10} y={by + 57} fill="#94a3b8" fontSize="9" fontFamily="monospace">
                Confidence: {Math.round(tooltip.party.confidence * 100)}%
              </text>
              <text x={bx + 10} y={by + 72} fill="#64748b" fontSize="8" fontFamily="monospace" style={{ fontStyle: 'italic' }}>
                {tooltip.party.reasoning[0]?.slice(0, 55)}…
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
