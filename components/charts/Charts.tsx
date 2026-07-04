// Lightweight dependency-free SVG charts. Blue-led data-viz palette with
// supporting hues (multi-series charts legitimately need more than one color).
import { cn } from "@/lib/utils";

export const VIZ = {
  blue: "#0071E3",
  sky: "#36A8F5",
  teal: "#19C3B1",
  indigo: "#5E5CE6",
  green: "#34C759",
  amber: "#FF9F0A",
  slate: "#8E98A8",
};
export const VIZ_SERIES = [
  VIZ.blue,
  VIZ.teal,
  VIZ.indigo,
  VIZ.green,
  VIZ.amber,
  VIZ.sky,
  VIZ.slate,
];

export function AreaChart({
  data,
  color = VIZ.blue,
  height = 220,
  id = "ac",
  className,
  goal,
  goalLabel,
}: {
  data: number[];
  color?: string;
  height?: number;
  id?: string;
  className?: string;
  goal?: number;
  goalLabel?: string;
}) {
  const w = 600;
  const h = height;
  const pad = 6;
  const max = Math.max(...data, goal ?? 0, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const goalY =
    goal != null ? h - pad - ((goal - min) / range) * (h - pad * 2) : null;
  const pts = data.map(
    (d, i) =>
      [
        (i / (data.length - 1)) * (w - pad * 2) + pad,
        h - pad - ((d - min) / range) * (h - pad * 2),
      ] as const
  );
  const line = pts
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
  const first = data[0];
  const last = data[data.length - 1];
  const trend = last >= first ? "up" : "down";
  return (
    // Wrapper lets us overlay the goal label as crisp HTML — text inside a
    // preserveAspectRatio="none" SVG gets stretched horizontally, which looked
    // distorted. The line/area still live in the stretched SVG (that's fine for
    // shapes); only the typography is lifted out.
    <div className={cn("relative w-full", className)} style={{ height }}>
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
      </svg>
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
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const summary = segments
    .map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`)
    .join(", ");
  return (
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
          stroke="#EEF0F3"
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
              strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
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
          fill="#1D1D1F"
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
          fill="#6E6E73"
        >
          {centerSub}
        </text>
      )}
    </svg>
  );
}

export function BarChart({
  data,
  height = 160,
  format,
}: {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  format?: (v: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div
      className="flex items-end gap-3"
      style={{ height }}
      role="img"
      aria-label={`Bar chart: ${data
        .map((d) => `${d.label} ${d.value}`)
        .join(", ")}`}
    >
      {data.map((d, i) => (
        <div
          key={i}
          className="flex-1 flex flex-col items-center justify-end gap-2 h-full"
        >
          <span className="text-[11px] font-semibold text-text-secondary tnum whitespace-nowrap">
            {format ? format(d.value) : d.value}
          </span>
          <div
            className="w-full rounded-t-md transition-all"
            style={{
              height: `${(d.value / max) * 100}%`,
              minHeight: 4,
              background: d.color || VIZ.blue,
            }}
          />
          <span className="text-[11px] text-text-tertiary truncate w-full text-center">
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// Multi-series line chart — same dependency-free SVG approach as AreaChart,
// for comparing a few series over time (engagement, calls per day, …).
export function LineChart({
  series,
  xLabels,
  height = 220,
  className,
}: {
  series: { label: string; color: string; points: number[] }[];
  xLabels?: string[];
  height?: number;
  className?: string;
}) {
  const w = 600;
  const h = height;
  const pad = 8;
  const n = Math.max(...series.map((s) => s.points.length), 2);
  const max = Math.max(...series.flatMap((s) => s.points), 1);
  const x = (i: number) => (i / (n - 1)) * (w - pad * 2) + pad;
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const summary = series
    .map((s) => `${s.label} peaks at ${Math.max(...s.points, 0)}`)
    .join(", ");
  return (
    <div className={cn("relative w-full", className)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full block"
        style={{ height }}
        role="img"
        aria-label={`Line chart: ${summary}`}
      >
        {/* light horizontal gridlines */}
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
        {series.map((s, si) => {
          const pts = s.points.map((v, i) => [x(i), y(v)] as const);
          const d = pts
            .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
            .join(" ");
          return (
            <g key={si}>
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="chart-line"
              />
              {pts.length > 0 && (
                <circle
                  cx={pts[pts.length - 1][0]}
                  cy={pts[pts.length - 1][1]}
                  r="3.5"
                  fill={s.color}
                />
              )}
            </g>
          );
        })}
      </svg>
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
