// Heuristic buying-style read (DISC-flavored) derived from a contact's role.
// Inferred, not measured — labeled as such in the UI.

export interface Persona {
  code: string;
  label: string;
  blurb: string;
  engage: string[];
  avoid: string[];
}

export function personaFor(roleBucket: string | null | undefined): Persona {
  const r = (roleBucket || "").toLowerCase();

  if (r.includes("exec") || r.includes("chief") || r.includes("vp") || r.includes("head")) {
    return {
      code: "D",
      label: "Driver — direct & outcome-focused",
      blurb:
        "Time-poor and results-oriented. Decides fast when the business case is clear.",
      engage: [
        "Lead with the outcome and ROI, not the feature list",
        "Keep it tight — one clear ask",
        "Tie everything to their upcoming milestone",
      ],
      avoid: ["Long preamble", "Getting lost in implementation detail"],
    };
  }
  if (r.includes("regulatory") || r.includes("quality") || r.includes("compliance")) {
    return {
      code: "C",
      label: "Conscientious — detail-driven & risk-averse",
      blurb:
        "Evidence-led and precise. Trusts specifics, frameworks, and a clean track record.",
      engage: [
        "Bring data, references, and exact frameworks (CTD, MDR, 21 CFR)",
        "Be precise — name the agency and the standard",
        "Show proof points and prior similar work",
      ],
      avoid: ["Vague claims", "Overselling or hard closes"],
    };
  }
  if (r.includes("medical") || r.includes("clinical")) {
    return {
      code: "C/S",
      label: "Analytical-Steady — scientific & collaborative",
      blurb:
        "Methodical and peer-driven. Responds to clinical rigor and a consultative tone.",
      engage: [
        "Speak the science; respect the clinical nuance",
        "Be consultative, not transactional",
        "Offer to include the wider team",
      ],
      avoid: ["Pushy closing", "Glossing over the data"],
    };
  }
  return {
    code: "C",
    label: "Conscientious — evidence-led",
    blurb: "Responds best to specifics, accuracy, and a credible track record.",
    engage: ["Be specific and accurate", "Bring proof points", "Respect their time"],
    avoid: ["Vague claims", "Overselling"],
  };
}
