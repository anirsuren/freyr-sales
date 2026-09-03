import { cn } from "@/lib/utils";

/**
 * THE FREYR AGENTS' OWN FACES.
 *
 * Saras, Sep 2, forwarding Avni's approved artwork: "place the respective
 * avatars as small icons in these 3 parts of the app" — beside the four agent
 * offerings in the Offerings tile view, on agent component cards inside an
 * offering's Overview, and on the roughly twenty FDL components named after
 * Via, Pia, Mia, Ria, Cia and Fia.
 *
 * WHY A NAME LOOKUP AND NOT A STORED FIELD. Nothing in the catalogue records
 * "this offering is Fia". The agent is in the name and nowhere else, on both
 * offerings ("Agent.Fia") and components ("RIA.Chat", "VIA"). A stored field
 * would need somebody to fill it in on every future row and would be wrong the
 * day they forgot; reading the name is right for every row that exists now and
 * every one added later.
 *
 * The match is word-bounded, so "RIA.Chat" and "Agent.Ria" both resolve while
 * a word that merely contains the letters does not. Anything that is not one
 * of the six renders nothing at all, which is what keeps this off the other
 * fifty-odd components.
 *
 * The artwork arrived as 4500px PNGs and as SVGs that turned out to be those
 * same PNGs base64'd inside an <svg> wrapper, so there was no vector to keep.
 * These are downscaled to 256px, about 50KB each, which is plenty for a mark
 * that renders between 16 and 32px.
 *
 * A PLAIN <img>, NOT next/image, and this is not a style preference. The Next
 * optimizer fetches the source URL server-side with no cookies, and this app's
 * middleware guards everything under /, so `/agents/via.png` came back as the
 * login redirect and every avatar rendered as a broken-image box with its alt
 * text spilling across the card. `Avatar` and `CompanyLogo` already use plain
 * <img> for exactly this reason. There is nothing to optimize anyway: these
 * are already 256px.
 */
export type AgentName = "via" | "pia" | "mia" | "ria" | "cia" | "fia";

/** The agent a name refers to, or null when it names no agent at all. */
export function agentIn(name: string | null | undefined): AgentName | null {
  if (!name) return null;
  const m = name.match(/\b(via|pia|mia|ria|cia|fia)\b/i);
  return m ? (m[1].toLowerCase() as AgentName) : null;
}

/**
 * The agent a title is ABOUT, or null. Stricter than `agentIn` on purpose.
 *
 * Capability cards carry prose, not identifiers, and "via" is an ordinary
 * English word in this catalogue: every availability line reads "Available in
 * various markets via in-house delivery team". An anywhere-match would stamp
 * Via's face on those. A card is about an agent only when it LEADS with one,
 * which is exactly how the briefs are written: "MIA (Market Identification
 * Agent):", "RIA (Regulatory Impact Assessment):". Leading punctuation is
 * skipped so the source's own bullet and bold markers do not hide the name.
 */
export function agentLeading(name: string | null | undefined): AgentName | null {
  if (!name) return null;
  const m = name.trim().replace(/^\W+/, "").match(/^(via|pia|mia|ria|cia|fia)\b/i);
  return m ? (m[1].toLowerCase() as AgentName) : null;
}

export function AgentAvatar({
  /** The offering or component name. The agent is read out of it. */
  name,
  className,
  size = 20,
  /**
   * The line-height of the text this sits beside, as a multiple — 1.375 for
   * `leading-snug`, 1.625 for `leading-relaxed`.
   *
   * WHY THIS EXISTS (Anir, Sep 3: "if you're going to use the icons, make
   * sure it's aligned properly"). Beside a heading that can wrap, the row has
   * to be `items-start` or a two-line name would push the avatar half a line
   * down. But top-aligning an avatar taller than the line hangs it below the
   * baseline, which is what he saw on Agent.Via. Given the line height, the
   * avatar is centred on the FIRST LINE instead: it stays put when the name
   * wraps, and it sits on the text rather than under it.
   */
  lineHeight,
}: {
  name: string | null | undefined;
  className?: string;
  size?: number;
  lineHeight?: number;
}) {
  const agent = agentIn(name);
  if (!agent) return null;
  const label = agent.charAt(0).toUpperCase() + agent.slice(1);
  if (lineHeight) {
    return (
      <span
        aria-hidden={false}
        /* A box exactly one line tall. The image is centred in it and may
           overhang symmetrically; the box, not the image, is what the row
           measures, so nothing else moves however big the avatar gets. */
        style={{ height: `${lineHeight}em` }}
        className="flex shrink-0 items-center"
      >
        <AgentAvatar name={name} className={className} size={size} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/agents/${agent}.png`}
      alt={`${label} agent`}
      title={`${label}, one of the Freyr agents`}
      width={size}
      height={size}
      /* The size is pinned in CSS as well as in the attributes, so a broken or
         still-loading file can never push the name it sits beside onto a second
         line — which is exactly what the broken next/image version did. */
      style={{ width: size, height: size }}
      className={cn("block shrink-0 rounded-md object-cover", className)}
    />
  );
}
