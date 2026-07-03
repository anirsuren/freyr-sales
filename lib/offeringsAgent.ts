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
  listOfferingCategories,
  MATERIAL_META,
  type MaterialKind,
} from "./offerings";

export interface OfferingsAnswer {
  reply: string;
  suggestions: string[];
}

const SUGGESTIONS = [
  "Which offerings are available now?",
  "Which offerings have a demo video?",
  "Offerings for pharmaceutical large",
];

export function offeringsAnswer(
  message: string,
  _customers: { id: string; company_name: string }[] = []
): OfferingsAnswer | null {
  const m = message.toLowerCase().trim();
  const offs = listOfferings();
  if (offs.length === 0) return null;

  // Normalize dots/spaces so a rep who types "Freya Register" still matches the
  // sheet's "Freya.Register" (Suren's offering names are dotted).
  const norm = (s: string) => s.toLowerCase().replace(/[.\s]+/g, " ").trim();
  const mNorm = norm(message);

  // A specific offering named in the message (longest match wins).
  const named = [...offs]
    .filter((o) => o.offering_name && mNorm.includes(norm(o.offering_name)))
    .sort((a, b) => b.offering_name.length - a.offering_name.length)[0];

  // Service-delivery POC lookups. Sara's MPR list is organised by POC — the team
  // collects each offering's data from its POC — so "who owns X's data?" and
  // "what is <name> the POC for?" are real, grounded questions worth answering.
  const pocNames = Array.from(
    new Set(
      offs
        .map((o) => o.poc)
        .filter(Boolean)
        .flatMap((p) => [p, ...p.split(/[/&,]|\band\b/i)])
        .flatMap((s) => [s, ...s.split(/\s+/)])
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length >= 4)
    )
  );
  const matchedPoc = pocNames.find((n) => m.includes(n)) || null;
  const pocIntent =
    /\b(poc|owner|owns|own|responsible|in charge|data owner|collect)\b/.test(m);

  // Offering CATEGORY questions (Suren's Jun 27 grouping). A category named in
  // the message (longest match), plus the master-list / owner intents.
  const cats = listOfferingCategories();
  const namedCategory = [...cats]
    .filter((c) => c.name && mNorm.includes(norm(c.name)))
    .sort((a, b) => b.name.length - a.name.length)[0];
  const categoryWord = /\bcategor(y|ies)\b/.test(m);
  const categoryListIntent =
    /\b(what|which|list|all|our|the|how many|show me( the)?)\b[^?]*\bcategor(y|ies)\b/.test(
      m
    );
  // "who owns / who's the owner of <category>?" — Suren wants an owner per
  // category.
  const categoryOwnerIntent =
    !!namedCategory &&
    /\b(owner|owns|own|who('?s| is)?\s+(the\s+)?owner|responsible|in charge|accountable)\b/.test(
      m
    );

  // Material questions — Suren modeled materials by TYPE (video, deck, pricing,
  // competition, case study, customer reference) so a rep can grab the right one
  // for a pitch. Detect the kind so "what materials / the competition / pricing
  // for <offering>" lists the actual items, not a generic count.
  const matKind: MaterialKind | null = /\b(video|demo|webinar)\b/.test(m)
    ? "video"
    : /\b(deck|slides|presentation)\b/.test(m)
    ? "presentation"
    : /\b(white ?paper|thought leadership)\b/.test(m)
    ? "whitepaper"
    : /\b(pricing|price sheet|price list|prices|cost)\b/.test(m)
    ? "pricing"
    : /\b(competition|competitors?|competitive|versus)\b/.test(m) || /\bvs\.?\b/.test(m)
    ? "competition"
    : /\bcase stud(y|ies)\b/.test(m)
    ? "case_study"
    : /\bcustomer references?\b|\btestimonials?\b/.test(m)
    ? "reference"
    : null;
  const materialIntent =
    matKind !== null ||
    /\b(materials|collateral|assets|sales material|resources)\b/.test(m);

  // Offering-TYPE questions — Suren's model leans on the AI-native vs agentic
  // distinction, so "which offerings are AI-native?" / "which have agents?"
  // should filter by type instead of dumping the generic overview.
  const aiNativeIntent = /\bai[ -]?native\b/.test(m);
  const agenticIntent =
    /\b(with|have|having|include[sd]?|come with|bundled with)\s+agents?\b/.test(m) ||
    /\bagentic\b/.test(m) ||
    /\bmodule\s+agents?\b/.test(m);

  // Suren's core taxonomy — reps should be able to ask the agent for the master
  // lists (the markets we sell in, the customer types/segments) and get them,
  // not a generic pipeline answer.
  const marketsListIntent =
    /\b(what|which|list|all|our|the|how many|show me the)\b[^?]*\b(markets?|regions?|geograph(y|ies)|territories)\b/.test(
      m
    ) || /\bwhere do we (sell|operate)\b/.test(m);
  const customerTypesListIntent =
    /\b(customer types?|segments?|account types?|who do we (sell to|target))\b/.test(
      m
    );

  const mentionsOfferings =
    /\boffering(s)?\b/.test(m) ||
    /\bwhat do we (sell|offer)\b/.test(m) ||
    /\bour (products|catalog|catalogue)\b/.test(m) ||
    /\bfreya\b/.test(m) ||
    !!named ||
    !!namedCategory ||
    categoryWord ||
    aiNativeIntent ||
    agenticIntent ||
    marketsListIntent ||
    customerTypesListIntent ||
    (!!matchedPoc && (pocIntent || /\boffering/.test(m)));
  if (!mentionsOfferings) return null;

  // 0a) A specific offering + "category" → name its category (and owner).
  if (named && categoryWord) {
    const o = hydrateOffering(named);
    if (!o.offering_category) {
      return {
        reply: `**${o.offering_name}** isn't assigned to a category yet — open it to set one.\n\n[Open ${o.offering_name} →](/offerings/${o.id})`,
        suggestions: [
          "What categories are there?",
          `Tell me about ${o.offering_name}`,
          "What offerings do we have?",
        ],
      };
    }
    const cat = o.offeringCategory;
    return {
      reply:
        `**${o.offering_name}** is in the **${o.offering_category}** category` +
        (cat?.owner ? `, owned by ${cat.owner}` : "") +
        `.` +
        (cat?.description ? ` ${cat.description}` : "") +
        `\n\n[See all in ${o.offering_category} →](/offerings?cat=${cat?.id ?? ""})`,
      suggestions: [
        `What else is in ${o.offering_category}?`,
        `Tell me about ${o.offering_name}`,
        "What categories are there?",
      ],
    };
  }

  // 0b) Category owner — "who owns Global Regulatory Intelligence?"
  if (categoryOwnerIntent && namedCategory) {
    const inCat = offs.filter((o) => o.offering_category === namedCategory.name);
    return {
      reply: namedCategory.owner
        ? `**${namedCategory.name}** is owned by ${namedCategory.owner}. It groups ${inCat.length} offering${inCat.length === 1 ? "" : "s"}.\n\n[See all in ${namedCategory.name} →](/offerings?cat=${namedCategory.id})`
        : `**${namedCategory.name}** doesn't have an owner assigned yet — set one under Offering categories.\n\n[Open offering categories →](/offerings/offering-categories)`,
      suggestions: [
        `What's in ${namedCategory.name}?`,
        "What categories are there?",
        "What offerings do we have?",
      ],
    };
  }

  // 0c) A category named (no specific offering) → list its offerings + owner.
  // Suren: "if I pick Global Regulatory Intelligence I see these offerings."
  if (namedCategory && !named) {
    const inCat = offs.filter((o) => o.offering_category === namedCategory.name);
    if (inCat.length === 0) {
      return {
        reply: `No offerings are in the **${namedCategory.name}** category yet.\n\n[Open offering categories →](/offerings/offering-categories)`,
        suggestions: [
          "What categories are there?",
          "What offerings do we have?",
          "Which offerings are available now?",
        ],
      };
    }
    const lines = inCat
      .slice(0, 10)
      .map((o) => `• [${o.offering_name}](/offerings/${o.id})`);
    const ownerLine = namedCategory.owner ? ` Owner: ${namedCategory.owner}.` : "";
    return {
      reply: `**${namedCategory.name}** — ${inCat.length} offering${inCat.length === 1 ? "" : "s"}.${ownerLine}\n\n${lines.join("\n")}\n\n[See all in ${namedCategory.name} →](/offerings?cat=${namedCategory.id})`,
      suggestions: [
        `Who owns ${namedCategory.name}?`,
        "What categories are there?",
        "What offerings do we have?",
      ],
    };
  }

  // 0d) Category master list — "what categories are there?"
  if (categoryListIntent) {
    if (cats.length === 0) {
      return {
        reply: `No offering categories are set up yet.\n\n[Open offering categories →](/offerings/offering-categories)`,
        suggestions: SUGGESTIONS,
      };
    }
    const counts = new Map<string, number>();
    for (const o of offs)
      counts.set(
        o.offering_category,
        (counts.get(o.offering_category) || 0) + 1
      );
    const lines = cats.map(
      (c) =>
        `• ${c.name} (${counts.get(c.name) || 0})${c.owner ? ` — ${c.owner}` : ""}`
    );
    return {
      reply: `${cats.length} offering categor${cats.length === 1 ? "y" : "ies"}:\n\n${lines.join("\n")}\n\n[Open offering categories →](/offerings/offering-categories)`,
      suggestions: [
        "What's in Global Regulatory Intelligence?",
        "What offerings do we have?",
        "What markets do we sell in?",
      ],
    };
  }

  // 1a) A specific offering + a material question → list its actual materials
  // (filtered by kind if one was named) so "what materials / the competition /
  // pricing for Freya.Register" names the items, not just a count.
  if (named && materialIntent) {
    const o = hydrateOffering(named);
    const mats = matKind
      ? o.materials.filter((x) => x.kind === matKind)
      : o.materials;
    const label = matKind
      ? MATERIAL_META[matKind].plural.toLowerCase()
      : "sales materials";
    if (mats.length === 0) {
      return {
        reply: `**${o.offering_name}** has no ${label} attached yet — add them on the offering.\n\n[Open ${o.offering_name} →](/offerings/${o.id})`,
        suggestions: [
          `Tell me about ${o.offering_name}`,
          "What offerings do we have?",
          "Which offerings have pricing?",
        ],
      };
    }
    const lines = mats.map(
      (x) => `• ${MATERIAL_META[x.kind].label}: [${x.label}](${x.url})`
    );
    return {
      reply: `**${o.offering_name}** — ${mats.length} ${label}:\n\n${lines.join("\n")}\n\n[Open ${o.offering_name} →](/offerings/${o.id})`,
      suggestions: [
        `Tell me about ${o.offering_name}`,
        o.offering_category
          ? `What else is in ${o.offering_category}?`
          : "What offerings do we have?",
        "Which offerings have pricing?",
      ],
    };
  }

  // 1b) A specific offering + a specific market → answer availability directly
  // ("is Freya.Register available in Japan?"), instead of a generic summary.
  if (named) {
    const mkt = listMarkets().find((x) =>
      new RegExp(
        `\\b${x.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`
      ).test(m)
    );
    if (mkt) {
      const o = hydrateOffering(named);
      if (o.markets.length === 0) {
        return {
          reply: `**${o.offering_name}**'s markets aren't filled in yet, so I can't confirm ${mkt.name} — open it to set where it's available.\n\n[Open ${o.offering_name} →](/offerings/${o.id})`,
          suggestions: [
            `Tell me about ${o.offering_name}`,
            `Which offerings are available in ${mkt.name}?`,
            "What offerings do we have?",
          ],
        };
      }
      const inMkt = o.markets.some((x) => x.id === mkt.id);
      const all = o.markets.map((x) => x.name).join(", ");
      return {
        reply:
          (inMkt
            ? `Yes — **${o.offering_name}** is available in ${mkt.name}.`
            : `No — **${o.offering_name}** isn't mapped to ${mkt.name}.`) +
          ` Its markets: ${all}.\n\n[Open ${o.offering_name} →](/offerings/${o.id})`,
        suggestions: [
          `Tell me about ${o.offering_name}`,
          `Which offerings are available in ${mkt.name}?`,
          "What offerings do we have?",
        ],
      };
    }
  }

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
      detail = ` It's set up with ${bits.join(", ")}.`;
    } else {
      // Plain-English, not a robotic "0 customer types, 0 markets".
      detail = ` It's in the repository, but its details aren't filled in yet — open it to add who it's for, its markets, and sales materials.`;
    }
    const pocLine = o.poc ? ` The data POC is ${o.poc}.` : "";
    const catLine = o.offering_category
      ? ` It's in the ${o.offering_category} category.`
      : "";
    return {
      reply:
        `**${o.offering_name}** (${o.offering_type})` +
        (o.offering_description ? ` — ${o.offering_description}` : "") +
        `.${detail}` +
        catLine +
        pocLine +
        (avail ? ` Availability: ${avail}.` : "") +
        `\n\n[Open ${o.offering_name} →](/offerings/${o.id})`,
      suggestions: [
        o.offering_category
          ? `What else is in ${o.offering_category}?`
          : "What offerings do we have?",
        `Offerings like ${o.offering_type}`,
        "Which offerings are available in Europe?",
      ],
    };
  }

  // 1.5) A service-delivery POC named in the message → what they own. Serves the
  // team's actual rollout task: "what do I collect from <person>?"
  if (matchedPoc && (pocIntent || /\boffering/.test(m))) {
    const mine = offs.filter((o) => (o.poc || "").toLowerCase().includes(matchedPoc));
    if (mine.length) {
      const display = mine[0].poc;
      const lines = mine
        .slice(0, 12)
        .map((o) => `• [${o.offering_name}](/offerings/${o.id})`);
      return {
        reply:
          `${display} is the data POC for ${mine.length} offering${mine.length === 1 ? "" : "s"}:\n\n${lines.join("\n")}` +
          `\n\nThe team collects each one's details from its POC.`,
        suggestions: [
          "Who's the data POC for Publishing?",
          "What offerings do we have?",
          "Which offerings are available now?",
        ],
      };
    }
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

  // 5) Sales materials at the CATALOG level — "which offerings have a deck / a
  // demo / pricing / competition". (matKind + materialIntent are computed up top
  // so a named-offering material question is handled earlier.)
  if (materialIntent) {
    const list = offs.filter((o) =>
      matKind ? o.materials.some((x) => x.kind === matKind) : o.materials.length > 0
    );
    const label = matKind ? MATERIAL_META[matKind].plural.toLowerCase() : "sales materials";
    if (list.length === 0) {
      return {
        reply: `No offerings have ${label} attached yet — add them on each offering.\n\n[Open Offerings →](/offerings)`,
        suggestions: SUGGESTIONS,
      };
    }
    const lines = list.slice(0, 8).map((o) => {
      const n = matKind
        ? o.materials.filter((x) => x.kind === matKind).length
        : o.materials.length;
      return `• [${o.offering_name}](/offerings/${o.id}) — ${n} ${n === 1 ? "item" : "items"}`;
    });
    return {
      reply: `${list.length} offering${list.length === 1 ? "" : "s"} with ${label}:\n\n${lines.join("\n")}`,
      suggestions: SUGGESTIONS,
    };
  }

  // 5a) Markets master list — "what markets do we sell in?" (a specific market
  // name is handled above; this is the general list).
  if (marketsListIntent) {
    const mkts = listMarkets();
    if (mkts.length === 0) {
      return {
        reply: `No markets are set up yet.\n\n[Open Offerings →](/offerings)`,
        suggestions: SUGGESTIONS,
      };
    }
    return {
      reply: `We sell across ${mkts.length} market${mkts.length === 1 ? "" : "s"}: ${mkts
        .map((x) => x.name)
        .join(", ")}.\n\n[Open Offerings →](/offerings)`,
      suggestions: [
        "Which offerings are available in Europe?",
        "What customer types are there?",
        "What offerings do we have?",
      ],
    };
  }

  // 5c) Customer-type master list — "what customer types are there?" (Suren's 9,
  // grouped by family).
  if (customerTypesListIntent) {
    const cts = listCustomerTypes();
    if (cts.length === 0) {
      return {
        reply: `No customer types are set up yet.\n\n[Open customer types →](/offerings/customer-types)`,
        suggestions: SUGGESTIONS,
      };
    }
    const fams = new Map<string, string[]>();
    for (const c of cts) {
      if (!fams.has(c.family)) fams.set(c.family, []);
      fams.get(c.family)!.push(c.size);
    }
    const lines = Array.from(fams.entries()).map(
      ([fam, sizes]) => `• ${fam}: ${sizes.join(", ")}`
    );
    return {
      reply: `${cts.length} customer type${cts.length === 1 ? "" : "s"} across ${fams.size} famil${fams.size === 1 ? "y" : "ies"}:\n\n${lines.join("\n")}\n\n[Open customer types →](/offerings/customer-types)`,
      suggestions: [
        "Offerings for pharmaceutical large",
        "What markets do we sell in?",
        "What offerings do we have?",
      ],
    };
  }

  // 5b) Offering-TYPE filter — "which offerings are AI-native / have agents?".
  if (aiNativeIntent || agenticIntent) {
    const matches = aiNativeIntent
      ? offs.filter((o) => o.offering_type === "Freyr AI Native Service")
      : offs.filter((o) => /Module Agent/.test(o.offering_type));
    const n = matches.length;
    const plural = n === 1 ? "" : "s";
    if (n === 0) {
      return {
        reply: `No offerings are ${aiNativeIntent ? "AI-native" : "bundled with agents"} yet.\n\n[Open Offerings →](/offerings)`,
        suggestions: SUGGESTIONS,
      };
    }
    const headline = aiNativeIntent
      ? `${n} AI-native offering${plural}`
      : `${n} offering${plural} with agents`;
    const lines = matches
      .slice(0, 10)
      .map((o) => `• [${o.offering_name}](/offerings/${o.id}) — ${o.offering_type}`);
    return {
      reply: `${headline}:\n\n${lines.join("\n")}`,
      suggestions: [
        "What offerings do we have?",
        aiNativeIntent
          ? "Which offerings have agents?"
          : "Which offerings are AI-native?",
        "Which offerings are available now?",
      ],
    };
  }

  // 6) General "what offerings do we have" → grouped overview.
  const byType = new Map<string, number>();
  for (const o of offs) {
    const t = o.offering_type || "Other";
    byType.set(t, (byType.get(t) || 0) + 1);
  }
  // List every type — the headline counts all of them, so a capped list would
  // contradict it ("8 types" but only 6 shown, counts not summing to the total).
  // The offering types are a small managed master list, so this stays readable.
  const typeLines = Array.from(byType.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `• ${t} (${n})`);
  return {
    reply:
      `Freyr's repository has ${offs.length} offering${offs.length === 1 ? "" : "s"} across ${byType.size} type${byType.size === 1 ? "" : "s"}:\n\n${typeLines.join("\n")}` +
      `\n\nYou can ask about a specific one (e.g. “tell me about Freya Register”), by market, what's available now, or which have sales materials.\n\n[Open Offerings →](/offerings)`,
    suggestions: [
      "Tell me about Freya Register",
      "Which offerings are available in Europe?",
      "What is Ragav the data POC for?",
    ],
  };
}
