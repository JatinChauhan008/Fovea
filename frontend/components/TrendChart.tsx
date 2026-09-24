"use client";

import { useMemo, useRef, useState } from "react";

export interface TrendPoint {
  label: string;
  value: number | null;
}

interface Props {
  title: string;
  points: TrendPoint[];
  format: (value: number) => string;
  unit: string;
}

const W = 720;
const H = 220;
const PAD = { top: 24, right: 16, bottom: 28, left: 44 };

/** One measure over time, drawn as a plain line with a table fallback. */
export function TrendChart({ title, points, format, unit }: Props) {
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

    return { x, y, min, max };
  }, [data]);

  if (!geometry) return null;

  // A line needs two points; one day on its own is just a dot in empty space.
  if (data.length < 2) {
    return (
      <p className="text-sm text-muted">
        <span className="font-medium text-ink">{title}</span> appears after a second day of
        reading.
      </p>
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
    if (!svg) return;

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
    <figure>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <figcaption>
          <span className="font-medium">{title}</span>
          <span className="ml-2 text-sm text-faint">
            {active
              ? `${active.label}: ${format(active.value)} ${unit}`
              : `${data.length} ${data.length === 1 ? "day" : "days"}, latest ${format(last.value)} ${unit}`}
          </span>
        </figcaption>
        <button
          type="button"
          onClick={() => setShowTable((current) => !current)}
          className="rounded-sm text-sm text-muted underline decoration-1 underline-offset-4 hover:text-ink"
        >
          {showTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {showTable ? (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-paper text-muted">
              <tr className="border-b border-ink">
                <th className="py-2 font-normal">Day</th>
                <th className="py-2 text-right font-normal">Speed ({unit})</th>
              </tr>
            </thead>
            <tbody>
              {data.map((point, index) => (
                <tr key={index} className="border-b border-rule">
                  <td className="py-1.5">{point.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{format(point.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none text-ink"
          role="img"
          aria-label={`${title}. ${data.length} days from ${data[0].label} to ${last.label}.`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {[max, (max + min) / 2, min].map((value, index) => {
            const gy = y(value);
            return (
              <g key={index}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={gy}
                  y2={gy}
                  stroke="var(--rule)"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={gy + 4}
                  textAnchor="end"
                  className="fill-faint text-[11px] tabular-nums"
                >
                  {format(value)}
                </text>
              </g>
            );
          })}

          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {data.map((point, index) => (
            <circle
              key={index}
              cx={x(index)}
              cy={y(point.value)}
              r={hover === index ? 4.5 : 2.5}
              fill={hover === index ? "var(--orp)" : "currentColor"}
            />
          ))}

          <text x={PAD.left} y={H - 6} className="fill-faint text-[11px]">
            {data[0].label}
          </text>
          {data.length > 1 && (
            <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-faint text-[11px]">
              {last.label}
            </text>
          )}

          {hover !== null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--ink-faint)"
              strokeWidth={1}
              strokeDasharray="2 3"
              pointerEvents="none"
            />
          )}
        </svg>
      )}
    </figure>
  );
}
