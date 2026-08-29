"use client";

import { useMemo, useRef, useState } from "react";

export interface TrendPoint {
  label: string;
  value: number | null;
  meta?: string;
}

interface Props {
  title: string;
  points: TrendPoint[];
  color: string;
  format: (value: number) => string;
  emptyMessage: string;
}

const W = 720;
const H = 220;
const PAD = { top: 20, right: 56, bottom: 30, left: 48 };

/**
 * One measure over time. Speed and comprehension live in separate charts on
 * purpose - they are different scales, and a second y-axis would invite false
 * comparisons between them.
 */
export function TrendChart({ title, points, color, format, emptyMessage }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const data = useMemo(
    () => points.filter((point): point is TrendPoint & { value: number } => point.value !== null),
    [points],
  );

  const geometry = useMemo(() => {
    if (data.length === 0) return null;

    const values = data.map((point) => point.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    // Give a flat series room to breathe rather than collapsing onto one line.
    const span = rawMax - rawMin || Math.max(rawMax * 0.2, 1);
    const min = Math.max(0, rawMin - span * 0.15);
    const max = rawMax + span * 0.15;

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const x = (index: number) =>
      data.length === 1 ? PAD.left + plotW / 2 : PAD.left + (index / (data.length - 1)) * plotW;
    const y = (value: number) => PAD.top + plotH - ((value - min) / (max - min)) * plotH;

    return { x, y, min, max, plotW, plotH };
  }, [data]);

  if (!geometry) {
    return (
      <figure className="rounded-xl border border-line bg-surface p-5">
        <figcaption className="text-sm font-medium">{title}</figcaption>
        <p className="py-12 text-center text-sm text-muted">{emptyMessage}</p>
      </figure>
    );
  }

  const { x, y, min, max } = geometry;
  const path = data
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.value)}`)
    .join(" ");

  const last = data[data.length - 1];
  const active = hover !== null ? data[hover] : null;

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || data.length === 0) return;

    const bounds = svg.getBoundingClientRect();
    const localX = ((event.clientX - bounds.left) / bounds.width) * W;

    let nearest = 0;
    let best = Infinity;
    data.forEach((_, index) => {
      const distance = Math.abs(x(index) - localX);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });
    setHover(nearest);
  };

  return (
    <figure className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <figcaption className="text-sm font-medium">{title}</figcaption>
        <button
          type="button"
          onClick={() => setShowTable((current) => !current)}
          className="focus-ring rounded text-xs text-muted hover:text-text"
        >
          {showTable ? "Show chart" : "Show data"}
        </button>
      </div>

      {showTable ? (
        <div className="max-h-56 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface text-xs uppercase text-muted">
              <tr>
                <th className="py-1.5 font-medium">Date</th>
                <th className="py-1.5 font-medium">{title}</th>
              </tr>
            </thead>
            <tbody className="text-text/90">
              {data.map((point) => (
                <tr key={point.label} className="border-t border-line/60">
                  <td className="py-1.5">{point.label}</td>
                  <td className="py-1.5 tabular-nums">{format(point.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none"
          role="img"
          aria-label={`${title}. ${data.length} data points from ${data[0].label} to ${last.label}.`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {/* Recessive gridlines and scale labels. */}
          {[max, (max + min) / 2, min].map((value, index) => {
            const gy = y(value);
            return (
              <g key={index}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={gy}
                  y2={gy}
                  stroke="var(--color-line)"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={gy + 4}
                  textAnchor="end"
                  className="fill-[var(--color-muted)] text-[11px] tabular-nums"
                >
                  {format(value)}
                </text>
              </g>
            );
          })}

          <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />

          {data.map((point, index) => (
            <circle
              key={point.label}
              cx={x(index)}
              cy={y(point.value)}
              r={hover === index ? 5.5 : 4}
              fill={color}
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
          ))}

          {/* Only the latest point is labelled directly - a number on every point is noise. */}
          <text
            x={x(data.length - 1) + 10}
            y={y(last.value) + 4}
            className="fill-[var(--color-text)] text-[12px] tabular-nums"
          >
            {format(last.value)}
          </text>

          <text
            x={PAD.left}
            y={H - 8}
            className="fill-[var(--color-muted)] text-[11px]"
          >
            {data[0].label}
          </text>
          {data.length > 1 && (
            <text
              x={W - PAD.right}
              y={H - 8}
              textAnchor="end"
              className="fill-[var(--color-muted)] text-[11px]"
            >
              {last.label}
            </text>
          )}

          {active && hover !== null && (
            <g pointerEvents="none">
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="var(--color-muted)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <g
                transform={`translate(${Math.min(Math.max(x(hover) - 60, 4), W - 124)}, ${PAD.top - 12})`}
              >
                <rect
                  width={120}
                  height={26}
                  rx={6}
                  fill="var(--color-raised)"
                  stroke="var(--color-line)"
                />
                <text
                  x={60}
                  y={17}
                  textAnchor="middle"
                  className="fill-[var(--color-text)] text-[12px] tabular-nums"
                >
                  {active.label} · {format(active.value)}
                </text>
              </g>
            </g>
          )}
        </svg>
      )}
    </figure>
  );
}
