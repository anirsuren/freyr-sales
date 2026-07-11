"use client";

// Interactive SVG charts. Every chart is hover-interactive — point at it and a
// tooltip shows the exact number (Suren: "every single graph"). The `format`
// prop accepts a serializable kind ("money" | "duration" | "percent" | …) so
// SERVER components can use it (a function can't cross the client boundary), or
// a function for client callers.
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { VIZ, VIZ_SERIES } from "./palette";

// A tooltip rendered into <body> via a portal so it can NEVER be clipped by a
// card's overflow or painted over by a neighbouring container — the recurring
// "the pop-up gets covered / cut off on every graph" bug (Suren). It's fixed to
// the viewport at the cursor, clamped to stay fully on screen.
function PortalTip({
  anchor,
  wide,
  children,
}: {
  anchor: { x: number; y: number } | null;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready || !anchor) return null;
  const width = wide ? 260 : 210;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(8, Math.min(vw - width - 8, anchor.x - width / 2));
  // Prefer above the cursor; flip below if too close to the top.
  const above = anchor.y > 150;
  return createPortal(
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{
        left,
        top: above ? anchor.y - 16 : anchor.y + 18,
        width,
        transform: above ? "translateY(-100%)" : undefined,
        maxHeight: Math.max(160, (above ? anchor.y : vh - anchor.y) - 24),
      }}
    >
      <div
        className="chart-tip text-left overflow-hidden"
        style={{ whiteSpace: "normal", width: "100%" }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

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

// Thin wrapper kept so existing call sites read the same — now portals to body.
function Tip({
  anchor,
  children,
  wide,
}: {
  anchor: { x: number; y: number } | null;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <PortalTip anchor={anchor} wide={wide}>
      {children}
    </PortalTip>
  );
}

// One data point's breakdown — the WHO/WHICH behind a bar, slice, or plot point.
// A row can carry a logo/headshot, a name, a secondary line, and a value, so the
// tooltip reads like a mini record a rep can act on — not just a bare name
// (Suren: "add the logo, give me more info, I'm a sales agent").
export type TipItem = {
  name: string;
  value?: string;
  sub?: string; // secondary line — contact, stage, region…
  logo?: string; // company name → CompanyLogo
  avatar?: string; // person name → headshot
};

function TipBreakdown({ items }: { items?: TipItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5 border-t border-white/15 pt-2 text-left">
      {items.slice(0, 5).map((t, j) => (
        <div key={j} className="flex items-center gap-2 text-[11px]">
          {t.logo ? (
            <CompanyLogo name={t.logo} className="w-[18px] h-[18px] text-[7px] shrink-0" />
          ) : t.avatar ? (
            <Avatar name={t.avatar} className="w-[18px] h-[18px] text-[7px] shrink-0" />
          ) : null}
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate font-medium text-white">{t.name}</span>
            {t.sub && (
              <span className="block truncate text-[10px] text-white/60">{t.sub}</span>
            )}
          </span>
          {t.value != null && (
            <span className="tnum text-white/80 shrink-0 self-center">{t.value}</span>
          )}
        </div>
      ))}
      {items.length > 5 && (
        <div className="text-[10.5px] text-white/50">+{items.length - 5} more</div>
      )}
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
  unit,
  pointTips,
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
  // Short unit shown after axis values ("deals", "calls") so the chart reads
  // without hovering (Suren: "there are no units, I can't see anything").
  unit?: string;
  // The who/which behind each plotted point, same index as `data`.
  pointTips?: TipItem[][];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const w = 600;
  const h = height;
  const pad = 6;
  // Big enough to carry axes + always-visible dots (vs. a tiny inline sparkline).
  const showAxes = height >= 140;
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
    setMouse({ x: e.clientX, y: e.clientY });
  }

  return (
    <div
      className={cn("relative w-full", className)}
      style={{ height }}
      onMouseMove={onMove}
      onMouseLeave={() => {
        setHover(null);
        setMouse(null);
      }}
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
        {showAxes &&
          [0, 0.5, 1].map((f) => {
            const gy = pad + f * (h - pad * 2);
            return (
              <line
                key={f}
                x1={pad}
                y1={gy}
                x2={w - pad}
                y2={gy}
                stroke="var(--border-light)"
                strokeWidth="1"
                opacity="0.7"
              />
            );
          })}
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
      {/* Always-visible dots so the series reads as data points, not just a bare
          line you have to hover to understand (Suren). */}
      {showAxes &&
        pts.map((p, i) => (
          <span
            key={i}
            className="pointer-events-none absolute w-2 h-2 rounded-full ring-2 ring-white transition-opacity"
            style={{
              left: `${(p[0] / w) * 100}%`,
              top: `${(p[1] / h) * 100}%`,
              background: color,
              transform: "translate(-50%,-50%)",
              opacity: hover === null || hover === i ? 1 : 0.45,
            }}
          />
        ))}
      {/* Y-axis scale — max (top) + baseline, with the unit, so the chart has
          numbers you can read at a glance. */}
      {showAxes && (
        <>
          <span className="pointer-events-none absolute left-1.5 top-1 text-[10px] font-semibold tnum text-text-tertiary bg-white/70 rounded px-1">
            {fmt(format, max)}
            {unit ? ` ${unit}` : ""}
          </span>
          <span className="pointer-events-none absolute left-1.5 bottom-1 text-[10px] tnum text-text-tertiary bg-white/70 rounded px-1">
            {fmt(format, Math.round(min))}
          </span>
          {xLabels && xLabels.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 -bottom-4 flex justify-between px-1 text-[10px] text-text-tertiary tnum">
              <span>{xLabels[0]}</span>
              {xLabels.length > 2 && <span>{xLabels[Math.floor((n - 1) / 2)]}</span>}
              <span>{xLabels[n - 1]}</span>
            </div>
          )}
        </>
      )}
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
        <Tip anchor={mouse} wide={!!pointTips?.[hi]?.length}>
          <div className="whitespace-nowrap font-semibold">
            {xLabels?.[hi] ? `${xLabels[hi]} · ` : ""}
            {fmt(format, data[hi])}
          </div>
          <TipBreakdown items={pointTips?.[hi]} />
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
  noTip = false,
}: {
  segments: {
    label: string;
    value: number;
    color: string;
    tip?: TipItem[];
  }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
  format?: Fmt;
  // Suppress the segment hover tooltip — for cramped popovers where a legend
  // beside the donut already shows the breakdown, so the tip would only clip and
  // duplicate (Suren: "the pop-up is getting cut off / a bare '1' looks atrocious").
  noTip?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  // Circumference draw-in: each arc starts at length 0 and grows to its share,
  // staggered by its start position so the ring sweeps around on load (Suren).
  const [drawn, setDrawn] = useState(false);
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const r =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (r) {
      setReduce(true);
      setDrawn(true);
      return;
    }
    const t = setTimeout(() => setDrawn(true), 40);
    return () => clearTimeout(t);
  }, []);
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
                strokeDasharray={drawn ? `${len} ${c - len}` : `0 ${c}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                onMouseEnter={(e) => {
                  setHover(i);
                  setMouse({ x: e.clientX, y: e.clientY });
                }}
                onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}
                onMouseLeave={() => {
                  setHover(null);
                  setMouse(null);
                }}
                style={{
                  cursor: "pointer",
                  transition: reduce
                    ? "stroke-width 120ms"
                    : "stroke-dasharray 0.75s cubic-bezier(0.22, 1, 0.36, 1), stroke-width 120ms",
                  transitionDelay: reduce ? undefined : `${(offset / c) * 0.55}s`,
                }}
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
      {!noTip && hover != null && segments[hover] && (
        <PortalTip anchor={mouse} wide={!!segments[hover].tip?.length}>
          <div className="whitespace-nowrap font-semibold">
            <span
              className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
              style={{ background: segments[hover].color }}
            />
            {segments[hover].label}: {fmt(format, segments[hover].value)} ·{" "}
            {Math.round((segments[hover].value / total) * 100)}%
          </div>
          <TipBreakdown items={segments[hover].tip} />
        </PortalTip>
      )}
    </div>
  );
}

export function BarChart({
  data,
  height = 160,
  format,
  activeIndex = null,
}: {
  data: {
    label: string;
    value: number;
    color?: string;
    // Optional breakdown shown in the hover tooltip so it ADDS information
    // (who's in this bar) instead of just restating the label + total.
    tip?: TipItem[];
  }[];
  height?: number;
  format?: Fmt;
  // When a caller has a "selected" bar (e.g. a stage drill-down is open), pass
  // its index so that bar stays lit + ringed while the rest dim (Suren: "when I
  // highlight one, show that its bar is highlighted").
  activeIndex?: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1);
  // Hover wins over the externally-selected bar; otherwise the selected bar lit.
  const lit = hover ?? activeIndex;
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
          onMouseEnter={(e) => {
            setHover(i);
            setMouse({ x: e.clientX, y: e.clientY });
          }}
          onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}
          onMouseLeave={() => {
            setHover(null);
            setMouse(null);
          }}
        >
          {/* Hover breakdown — portaled so it's never clipped by the card. */}
          {hover === i && (
            <PortalTip anchor={mouse} wide={!!(d.tip && d.tip.length)}>
              <div className="font-semibold whitespace-nowrap">
                {d.label} · {fmt(format, d.value)}
              </div>
              <TipBreakdown items={d.tip} />
            </PortalTip>
          )}
          {/* Value on top — its own fixed row so tall bars never clip it */}
          <span className="text-[11px] font-semibold text-text-secondary tnum whitespace-nowrap shrink-0 mb-1">
            {fmt(format, d.value)}
          </span>
          {/* Bar grows inside this flex-1 area, so the label below always fits */}
          <div className="flex-1 w-full min-h-0 flex items-end justify-center">
            <div
              className="chart-bar w-full max-w-[120px] rounded-t-md transition-[opacity,filter,box-shadow,transform]"
              style={{
                height: `${(d.value / max) * 100}%`,
                minHeight: 4,
                animationDelay: `${i * 45}ms`,
                background: d.color || VIZ.blue,
                opacity: lit === null || lit === i ? 1 : 0.4,
                transform: activeIndex === i && hover === null ? "scaleY(1.02)" : undefined,
                transformOrigin: "bottom",
                boxShadow:
                  activeIndex === i
                    ? `0 0 0 2px #fff, 0 0 0 4px ${d.color || VIZ.blue}`
                    : undefined,
              }}
            />
          </div>
          <span className="text-[11px] text-text-tertiary w-full text-center shrink-0 mt-1.5 leading-tight break-words">
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
  pointTips,
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
  // The who/which behind each x-point (shared across series).
  pointTips?: TipItem[][];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
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
    setMouse({ x: e.clientX, y: e.clientY });
  }

  return (
    <div
      className={cn("relative w-full", className)}
      onMouseMove={onMove}
      onMouseLeave={() => { setHover(null); setMouse(null); }}
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
            <Tip anchor={mouse} wide={!!pointTips?.[hi]?.length}>
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
              <TipBreakdown items={pointTips?.[hi]} />
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
  unit,
  pointTips,
}: {
  points: number[];
  color?: string;
  height?: number;
  format?: Fmt;
  xLabels?: string[];
  // A unit appended to the hovered value so a bare "7" reads as "7 touches"
  // (Suren: "7, what the fuck? What date was this?").
  unit?: string;
  pointTips?: TipItem[][];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
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
    setMouse({ x: e.clientX, y: e.clientY });
  }

  return (
    <div
      className="relative w-full"
      style={{ height }}
      onMouseMove={onMove}
      onMouseLeave={() => { setHover(null); setMouse(null); }}
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
          className="chart-line"
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
        <Tip anchor={mouse} wide={!!pointTips?.[hi]?.length}>
          <div className="whitespace-nowrap font-semibold">
            {fmt(format, points[hi] ?? 0)}
            {unit ? ` ${unit}` : ""}
            {xLabels?.[hi] ? ` · ${xLabels[hi]}` : ""}
          </div>
          <TipBreakdown items={pointTips?.[hi]} />
        </Tip>
      )}
    </div>
  );
}

// A donut/pie side legend where the count sits RIGHT AFTER the label (Suren:
// "don't do this stupid thing where the numbers are so far from the tags"), with
// the share % and a subtle proportion bar filling the space that freed up on the
// right — so the width reads as information, not a dead gap.
export function DonutLegend({
  items,
  total,
  format,
  className,
}: {
  items: { label: string; color: string; value: number }[];
  total?: number;
  format?: Fmt;
  className?: string;
}) {
  const sum = (total ?? items.reduce((s, x) => s + x.value, 0)) || 1;
  return (
    <div className={cn("flex-1 min-w-0 space-y-2.5", className)}>
      {items.map((it) => {
        const pct = Math.round((it.value / sum) * 100);
        return (
          <div key={it.label} className="flex items-center gap-2 text-[12.5px]">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: it.color }}
            />
            {/* Never truncate the label — a "Prosp…" tag is useless (Suren).
                The share bar (flex-1) yields space instead. */}
            <span className="text-text-secondary whitespace-nowrap shrink-0">{it.label}</span>
            <span className="font-semibold text-text-primary tnum shrink-0">
              {format ? fmt(format, it.value) : it.value}
            </span>
            <span className="text-text-tertiary tnum text-[11px] shrink-0">
              {pct}%
            </span>
            <span className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden ml-1 min-w-[12px]">
              <span
                className="block h-full rounded-full transition-all"
                style={{ width: `${Math.max(pct, 3)}%`, background: it.color }}
              />
            </span>
          </div>
        );
      })}
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
