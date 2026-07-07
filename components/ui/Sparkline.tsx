export function Sparkline({
  points,
  color = "#0071E3",
  width = 132,
  height = 34,
}: {
  points: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (!points.length) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const xy = points.map((p, i) => [
    (i / Math.max(1, points.length - 1)) * (width - 4) + 2,
    height - 3 - ((p - min) / range) * (height - 6),
  ]);
  const d = xy
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const last = xy[xy.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  );
}
