"use client";

// Interactive SVG charts. Every chart is hover-interactive — point at it and a
// tooltip shows the exact number (Suren: "every single graph"). The `format`
// prop accepts a serializable kind ("money" | "duration" | "percent" | …) so
// SERVER components can use it (a function can't cross the client boundary), or
// a function for client callers.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { VIZ, VIZ_SERIES } from "./palette";

export type Fmt =
  | "money"
  | "millions"
  | "duration"
  | "percent"
  | "compact"
  | "number"
  | ((v: number) => string);

function fmt(f: Fmt | undefined, v: number): string {
  if (typeof f === "function") return f(v);
  switch (f) {
    case "money":
      return v >= 1e6
        ? `$${(v / 1e6).toFixed(1)}M`
        : v >= 1e3
        ? `$${Math.round(v / 1e3)}K`
        : `$${Math.round(v)}`;
    // Values already expressed in millions (e.g. 2.06 → "$2.1M").
    case "millions":
      return v >= 1 ? `$${v.toFixed(1)}M` : `$${Math.round(v * 1000)}K`;
    case "duration":
      return `${Math.floor(v / 60)}:${String(Math.round(v) % 60).padStart(2, "0")}`;
    case "percent":
      return `${Math.round(v)}%`;
    case "compact":
      return v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v);
    default:
      return String(v);
  }
}

function Tip({
  leftPct,
  children,
}: {
  leftPct: number;
  children: React.ReactNode;
}) {
  const clamped = Math.max(6, Math.min(94, leftPct));
  return (
    <div
      className="pointer-events-none absolute -top-1 z-20 -translate-x-1/2 -translate-y-full"
      style={{ left: `${clamped}%` }}
    >
      <div className="chart-tip">{children}</div>
    </div>
  );
}

export function AreaChart({
  data,
  color = VIZ.blue,
  height = 220,
  id = "ac",
  className,
  goal,
  goalLabel,
  xLabels,
  format,
}: {
  data: number[];
  color?: string;
  height?: number;
  id?: string;
  className?: string;
  goal?: number;
  goalLabel?: string;
  xLabels?: string[];
  format?: Fmt;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 600;
  const h = height;
  const pad = 6;
  const max = Math.max(...data, goal ?? 0, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const n = data.length;
  const goalY =
    goal != null ? h - pad - ((goal - min) / range) * (h - pad * 2) : null;
  const px = (i: number) => (i / (n - 1)) * (w - pad * 2) + pad;
  const py = (d: number) => h - pad - ((d - min) / range) * (h - pad * 2);
  const pts = data.map((d, i) => [px(i), py(d)] as const);
  const line = pts
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
  const first = data[0];
  const last = data[data.length - 1];
  const trend = last >= first ? "up" : "down";
  const hi = hover ?? n - 1;

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  }

  return (
    <div
      className={cn("relative w-full", className)}
      style={{ height }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full block"
        style={{ height }}
        role="img"
        aria-label={`Trend chart, ${data.length} points, trending ${trend}${
          goalLabel ? `, ${goalLabel}` : ""
        }`}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id})`} className="chart-area" />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="chart-line"
        />
        {goalY != null && (
          <line
            x1={pad}
            y1={goalY}
            x2={w - pad}
            y2={goalY}
            stroke={VIZ.amber}
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
        )}
        {hover != null && (
          <line
            x1={px(hi)}
            y1={pad}
            x2={px(hi)}
            y2={h - pad}
            stroke={color}
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.5"
          />
        )}
      </svg>
      <span
        className="pointer-events-none absolute w-2.5 h-2.5 rounded-full ring-2 ring-white"
        style={{
          left: `${(px(hi) / w) * 100}%`,
          top: `${(py(data[hi]) / h) * 100}%`,
          background: color,
          transform: "translate(-50%,-50%)",
        }}
      />
      {hover != null && (
        <Tip leftPct={(px(hi) / w) * 100}>
          {xLabels?.[hi] ? `${xLabels[hi]} · ` : ""}
          {fmt(format, data[hi])}
        </Tip>
      )}
      {goalY != null && goalLabel && (
        <span
          className="absolute left-2 text-[11px] font-bold tnum pointer-events-none"
          style={{
            top: `${(goalY / h) * 100}%`,
            color: VIZ.amber,
            transform: "translateY(3px)",
          }}
        >
          {goalLabel}
        </span>
      )}
    </div>
  );
}

export function DonutChart({
  segments,
  size = 150,
  thickness = 16,
  centerLabel,
  centerSub,
  format,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
  format?: Fmt;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const summary = segments
    .map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`)
    .join(", ");
  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Donut chart: ${summary}`}
      >
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="stroke-[var(--border-light)]"
            strokeWidth={thickness}
          />
          {segments.map((s, i) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === i ? thickness + 3 : thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer", transition: "stroke-width 120ms" }}
              />
            );
            offset += len;
            return el;
          })}
        </g>
        {centerLabel && (
          <text
            x={size / 2}
            y={size / 2 - 4}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="24"
            fontWeight="700"
            className="fill-current text-text-primary"
          >
            {centerLabel}
          </text>
        )}
        {centerSub && (
          <text
            x={size / 2}
            y={size / 2 + 16}
            textAnchor="middle"
            fontSize="10"
            className="fill-current text-text-tertiary"
          >
            {centerSub}
          </text>
        )}
      </svg>
      {hover != null && segments[hover] && (
        <div className="pointer-events-none absolute inset-x-0 -top-2 flex justify-center -translate-y-full z-20">
          <div className="chart-tip">
            <span
              className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
              style={{ background: segments[hover].color }}
            />
            {segments[hover].label}: {fmt(format, segments[hover].value)} ·{" "}
            {Math.round((segments[hover].value / total) * 100)}%
          </div>
        </div>
      )}
    </div>
  );
}

export function BarChart({
  data,
  height = 160,
  format,
}: {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  format?: Fmt;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div
      className="relative flex items-end justify-start gap-6"
      style={{ height }}
      role="img"
      aria-label={`Bar chart: ${data
        .map((d) => `${d.label} ${d.value}`)
        .join(", ")}`}
    >
      {data.map((d, i) => (
        <div
          key={i}
          className="relative flex-1 flex flex-col items-center h-full min-w-[44px]"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
        >
          {/* Hover breakdown — a small tooltip, not a big popup (Suren). */}
          {hover === i && (
            <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-20 chart-tip">
              {d.label} · {fmt(format, d.value)}
            </div>
          )}
          {/* Value on top — its own fixed row so tall bars never clip it */}
          <span className="text-[11px] font-semibold text-text-secondary tnum whitespace-nowrap shrink-0 mb-1">
            {fmt(format, d.value)}
          </span>
          {/* Bar grows inside this flex-1 area, so the label below always fits */}
          <div className="flex-1 w-full min-h-0 flex items-end justify-center">
            <div
              className="w-full max-w-[120px] rounded-t-md transition-[opacity,filter]"
              style={{
                height: `${(d.value / max) * 100}%`,
                minHeight: 4,
                background: d.color || VIZ.blue,
                opacity: hover === null || hover === i ? 1 : 0.55,
              }}
            />
          </div>
          <span className="text-[11px] text-text-tertiary truncate w-full text-center shrink-0 mt-1.5">
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function LineChart({
  series,
  xLabels,
  pointLabels,
  unit,
  height = 220,
  className,
  format,
}: {
  series: { label: string; color: string; points: number[] }[];
  // Sparse labels shown along the x-axis (a handful, evenly spread).
  xLabels?: string[];
  // One label PER data point — used for the hover tooltip so it names the exact
  // day/point you're on (Suren: "it's not even telling me the date when I
  // hover"). Falls back to xLabels when omitted.
  pointLabels?: string[];
  // Optional unit appended to the hovered value ("3 calls").
  unit?: string;
  height?: number;
  className?: string;
  format?: Fmt;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 600;
  const h = height;
  const pad = 8;
  const n = Math.max(...series.map((s) => s.points.length), 2);
  const max = Math.max(...series.flatMap((s) => s.points), 1);
  const x = (i: number) => (i / (n - 1)) * (w - pad * 2) + pad;
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const xPct = (i: number) => (x(i) / w) * 100;
  const summary = series
    .map((s) => `${s.label} peaks at ${Math.max(...s.points, 0)}`)
    .join(", ");
  const hi = hover;

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  }

  return (
    <div
      className={cn("relative w-full", className)}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full block"
        style={{ height }}
        role="img"
        aria-label={`Line chart: ${summary}`}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={pad}
            x2={w - pad}
            y1={y(max * f)}
            y2={y(max * f)}
            stroke="#EEF0F3"
            strokeWidth="1"
          />
        ))}
        {hi != null && (
          <line
            x1={x(hi)}
            y1={pad}
            x2={x(hi)}
            y2={h - pad}
            stroke={series[0]?.color || VIZ.blue}
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.5"
          />
        )}
        {series.map((s, si) => {
          const pts = s.points.map((v, i) => [x(i), y(v)] as const);
          const d = pts
            .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
            .join(" ");
          return (
            <path
              key={si}
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="chart-line"
            />
          );
        })}
      </svg>
      {series.map((s, si) => {
        const i = hi ?? s.points.length - 1;
        const v = s.points[i];
        if (v == null) return null;
        return (
          <span
            key={si}
            className="pointer-events-none absolute w-2.5 h-2.5 rounded-full ring-2 ring-white"
            style={{
              // Position the dot in the SVG's pixel space (top = y in px), NOT a
              // % of the container — the x-axis labels make the container taller
              // than the SVG, which pushed the dots below the line (Suren, Jul 8).
              left: `${xPct(i)}%`,
              top: `${y(v)}px`,
              background: s.color,
              transform: "translate(-50%,-50%)",
            }}
          />
        );
      })}
      {hi != null &&
        (() => {
          const tipLabel = pointLabels?.[hi] ?? xLabels?.[hi];
          return (
            <Tip leftPct={xPct(hi)}>
              {series.length === 1 ? (
                <span className="flex flex-col items-center gap-0.5 text-center">
                  {tipLabel && (
                    <span className="text-[10px] font-normal opacity-70 whitespace-nowrap">
                      {tipLabel}
                    </span>
                  )}
                  <span className="text-[13px] font-semibold whitespace-nowrap">
                    {fmt(format, series[0].points[hi] ?? 0)}
                    {unit ? ` ${unit}` : ""}
                  </span>
                </span>
              ) : (
                <span className="flex flex-col gap-1">
                  {tipLabel && (
                    <span className="text-[10px] font-normal opacity-70">{tipLabel}</span>
                  )}
                  {series.map((s) => (
                    <span
                      key={s.label}
                      className="flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: s.color }}
                      />
                      {s.label}: {fmt(format, s.points[hi] ?? 0)}
                    </span>
                  ))}
                </span>
              )}
            </Tip>
          );
        })()}
      {xLabels && xLabels.length > 1 && (
        <div className="flex justify-between mt-1 px-0.5">
          {xLabels.map((l, i) => (
            <span key={i} className="text-[10.5px] text-text-tertiary tnum">
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sparkline({
  points,
  color = VIZ.blue,
  height = 34,
  format,
  xLabels,
}: {
  points: number[];
  color?: string;
  height?: number;
  format?: Fmt;
  xLabels?: string[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 120;
  const h = height;
  const pad = 3;
  const n = Math.max(points.length, 2);
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const x = (i: number) => (i / (n - 1)) * (w - pad * 2) + pad;
  const y = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);
  const d = points
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  const hi = hover ?? n - 1;

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  }

  return (
    <div
      className="relative w-full"
      style={{ height }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full block"
        style={{ height }}
        aria-hidden
      >
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="pointer-events-none absolute w-1.5 h-1.5 rounded-full"
        style={{
          left: `${(x(hi) / w) * 100}%`,
          top: `${(y(points[hi] ?? 0) / h) * 100}%`,
          background: color,
          transform: "translate(-50%,-50%)",
        }}
      />
      {hover != null && (
        <Tip leftPct={(x(hi) / w) * 100}>
          {xLabels?.[hi] ? `${xLabels[hi]} · ` : ""}
          {fmt(format, points[hi] ?? 0)}
        </Tip>
      )}
    </div>
  );
}

export function Legend({
  items,
}: {
  items: { label: string; color: string; value?: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5 text-[12px]">
          <span
            className="w-2.5 h-2.5 rounded-sm"
            style={{ background: it.color }}
          />
          <span className="text-text-secondary">{it.label}</span>
          {it.value && (
            <span className="text-text-primary font-medium tnum">{it.value}</span>
          )}
        </span>
      ))}
    </div>
  );
}
