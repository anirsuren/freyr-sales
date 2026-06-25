// Factual offerings answers for the agent chat. Pure, grounded lookups over the
// offerings repository — no fuzzy account→offering recommendation (that needs a
// human-defined mapping). Returns null when the message isn't an offerings query
// so the normal brain handles it. Works in BOTH the keyed and deterministic
// paths, so production (no API key → deterministic) gets it too.
import {
  listOfferings,
  getOffering,
  hydrateOffering,
  listMarkets,
  listCustomerTypes,
} from "./offerings";

export interface OfferingsAnswer {
  reply: string;
  suggestions: string[];
}

const SUGGESTIONS = [
  "What offerings do we have?",
  "Which offerings are available in Europe?",
  "What's my open pipeline worth?",
];

export function offeringsAnswer(message: string): OfferingsAnswer | null {
  const m = message.toLowerCase().trim();
  const offs = listOfferings();
  if (offs.length === 0) return null;

  // A specific offering named in the message (longest match wins).
  const named = [...offs]
    .filter((o) => o.offering_name && m.includes(o.offering_name.toLowerCase()))
    .sort((a, b) => b.offering_name.length - a.offering_name.length)[0];

  const mentionsOfferings =
    /\boffering(s)?\b/.test(m) ||
    /\bwhat do we (sell|offer)\b/.test(m) ||
    /\bour (products|catalog|catalogue)\b/.test(m) ||
    /\bfreya\b/.test(m) ||
    !!named;
  if (!mentionsOfferings) return null;

  // 1) A specific offering → describe it factually + deep link.
  if (named) {
    const o = hydrateOffering(named);
    const avail = [
      o.current_availability && `now — ${o.current_availability}`,
      o.future_availability && `future — ${o.future_availability}`,
    ]
      .filter(Boolean)
      .join("; ");
    const isMapped =
      o.customerTypes.length > 0 ||
      o.markets.length > 0 ||
      o.materials.length > 0;
    let detail: string;
    if (isMapped) {
      const bits = [
        `${o.customerTypes.length} customer type${o.customerTypes.length === 1 ? "" : "s"}`,
        `${o.markets.length} market${o.markets.length === 1 ? "" : "s"}`,
      ];
      if (o.materials.length)
        bits.push(`${o.materials.length} sales material${o.materials.length === 1 ? "" : "s"}`);
      detail = ` It's mapped to ${bits.join(", ")}.`;
    } else {
      // Plain-English, not a robotic "0 customer types, 0 markets".
      detail = ` It's in the repository but not yet mapped to customer types or markets — open it to fill that in.`;
    }
    return {
      reply:
        `**${o.offering_name}** (${o.offering_type})` +
        (o.offering_description ? ` — ${o.offering_description}` : "") +
        `.${detail}` +
        (avail ? ` Availability: ${avail}.` : "") +
        `\n\n[Open ${o.offering_name} →](/offerings/${o.id})`,
      suggestions: [
        "What offerings do we have?",
        `Offerings like ${o.offering_type}`,
        "Which offerings are available in Europe?",
      ],
    };
  }

  // 2) Offerings available in a named market.
  const market = listMarkets().find((x) =>
    new RegExp(`\\b${x.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(m)
  );
  if (market) {
    const matches = offs.filter((o) => o.market_ids.includes(market.id));
    if (matches.length === 0) {
      return {
        reply: `No offerings are mapped to ${market.name} yet. Map markets on each offering in the repository.\n\n[Open Offerings →](/offerings?market=${market.id})`,
        suggestions: SUGGESTIONS,
      };
    }
    const lines = matches
      .slice(0, 6)
      .map((o) => `• [${o.offering_name}](/offerings/${o.id})`);
    return {
      reply:
        `${matches.length} offering${matches.length === 1 ? "" : "s"} available in ${market.name}:\n\n${lines.join("\n")}` +
        `\n\n[See all in ${market.name} →](/offerings?market=${market.id})`,
      suggestions: SUGGESTIONS,
    };
  }

  // 3) Offerings for a customer type / family ("offerings for pharmaceutical large").
  const famKey = /biopharma|bio pharma/.test(m)
    ? "Bio Pharmaceutical"
    : /biolog/.test(m)
    ? "Biologics"
    : /pharma/.test(m)
    ? "Pharmaceutical"
    : null;
  if (famKey) {
    const sizeKey = /\blarge\b/.test(m)
      ? "Large"
      : /\b(mid|medium|mid-?size)\b/.test(m)
      ? "Mid size"
      : /\bsmall\b/.test(m)
      ? "Small"
      : null;
    const types = listCustomerTypes().filter(
      (c) => c.family === famKey && (!sizeKey || c.size === sizeKey)
    );
    const ids = new Set(types.map((c) => c.id));
    const label = sizeKey ? `${famKey} – ${sizeKey}` : famKey;
    const matches = offs.filter((o) =>
      o.customer_type_ids.some((id) => ids.has(id))
    );
    const href = types.length === 1 ? `/offerings?type=${types[0].id}` : "/offerings";
    if (matches.length === 0) {
      return {
        reply: `No offerings are mapped to ${label} accounts yet.\n\n[Open Offerings →](${href})`,
        suggestions: SUGGESTIONS,
      };
    }
    const lines = matches
      .slice(0, 6)
      .map((o) => `• [${o.offering_name}](/offerings/${o.id})`);
    return {
      reply: `${matches.length} offering${matches.length === 1 ? "" : "s"} for ${label} accounts:\n\n${lines.join("\n")}\n\n[Open Offerings →](${href})`,
      suggestions: SUGGESTIONS,
    };
  }

  // 4) Availability — Suren explicitly tracks "now" vs "future" availability.
  if (/\b(available now|coming soon|upcoming|future|roadmap|launching|available)\b/.test(m)) {
    const wantsFuture = /\b(coming soon|upcoming|future|roadmap|launching|next year|2026)\b/.test(m);
    const list = offs.filter((o) =>
      wantsFuture ? o.future_availability : o.current_availability
    );
    if (list.length === 0) {
      return {
        reply: `No offerings have ${wantsFuture ? "future" : "current"} availability noted yet — add it on each offering.\n\n[Open Offerings →](/offerings)`,
        suggestions: SUGGESTIONS,
      };
    }
    const lines = list
      .slice(0, 8)
      .map(
        (o) =>
          `• [${o.offering_name}](/offerings/${o.id}) — ${wantsFuture ? o.future_availability : o.current_availability}`
      );
    return {
      reply: `${list.length} offering${list.length === 1 ? "" : "s"} ${wantsFuture ? "coming up" : "available now"}:\n\n${lines.join("\n")}`,
      suggestions: SUGGESTIONS,
    };
  }

  // 5) General "what offerings do we have" → grouped overview.
  const byType = new Map<string, number>();
  for (const o of offs) {
    const t = o.offering_type || "Other";
    byType.set(t, (byType.get(t) || 0) + 1);
  }
  const typeLines = Array.from(byType.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([t, n]) => `• ${t} (${n})`);
  return {
    reply:
      `Freyr's repository has ${offs.length} offering${offs.length === 1 ? "" : "s"} across ${byType.size} type${byType.size === 1 ? "" : "s"}:\n\n${typeLines.join("\n")}` +
      `\n\nAsk me about a specific one (e.g. “tell me about Freya Register”) or by market.\n\n[Open Offerings →](/offerings)`,
    suggestions: [
      "Tell me about Freya Register",
      "Which offerings are available in Europe?",
      "Offerings for pharmaceutical large",
    ],
  };
}
