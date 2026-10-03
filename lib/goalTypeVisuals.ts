import { Activity, BadgeDollarSign, Handshake, Magnet, Sparkles, type LucideIcon } from "lucide-react";

type TypeMeta = { color: string; icon: LucideIcon };

const TYPE_META_BY_NAME: Record<string, TypeMeta> = {
  "financial and revenue performance": {
    color: "var(--ink-teal-deep)",
    icon: BadgeDollarSign,
  },
  "lead generation and outreach": { color: "var(--ink-bright-blue)", icon: Magnet },
  "sales activity & engagement": { color: "var(--ink-magenta)", icon: Activity },
  "proposal & deal execution": { color: "var(--ink-orange)", icon: Handshake },
};

const FALLBACK_TYPE_COLORS = ["var(--ink-violet)", "#0EA5E9", "#DB2777", "#4F46E5"];

export function typeMeta(type: string): TypeMeta {
  const hit = TYPE_META_BY_NAME[type.trim().toLowerCase()];
  if (hit) return hit;
  let h = 0;
  for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
  return {
    color: FALLBACK_TYPE_COLORS[h % FALLBACK_TYPE_COLORS.length],
    icon: Sparkles,
  };
}

