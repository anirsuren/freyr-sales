import type { AgentPrefs } from "@/lib/types";

/**
 * Who the rep is, as a short block the agent can read.
 *
 * The agent drafts in the rep's voice and signs their name, but all it used to
 * know was a display name and a job title — so a 20-year regulatory VP and a
 * new SDR got word-for-word identical emails (Anir, Jul 25: "it should have all
 * the context from who the person is"). The rep pastes a LinkedIn URL in
 * Settings > Profile; the enrichment run stores the headline, background and
 * photo, and this turns that into prompt text.
 *
 * Deliberately compact: this rides along on every agent request, so it earns
 * its tokens with identity that changes the writing (seniority, specialism,
 * background) and nothing that doesn't.
 */
export function repIdentityBlock(
  rep: { name?: string | null; title?: string | null },
  prefs?: Partial<AgentPrefs> | null
): string {
  const lines: string[] = [];
  const name = rep.name?.trim();
  const title = rep.title?.trim();

  if (name) lines.push(`Name: ${name}`);
  if (title) lines.push(`Role: ${title}`);

  const headline = prefs?.linkedin_headline?.trim();
  // The LinkedIn headline is usually richer than the internal job title
  // ("VP Regulatory Affairs | FDA & EMA" vs "Rep"), so keep both when they
  // differ and skip the repetition when they don't.
  if (headline && headline.toLowerCase() !== title?.toLowerCase()) {
    lines.push(`LinkedIn headline: ${headline}`);
  }

  const about = prefs?.linkedin_about?.trim();
  if (about) lines.push(`Background: ${about}`);

  if (!lines.length) return "";

  return [
    "About the rep you are writing as (write in their voice, match their seniority):",
    ...lines,
  ].join("\n");
}

/**
 * The rep's own avatar. Falls back to null so callers keep using initials —
 * an enriched photo is a bonus, never a requirement.
 */
export function repPhotoUrl(prefs?: Partial<AgentPrefs> | null): string | null {
  const photo = prefs?.linkedin_photo?.trim();
  return photo ? photo : null;
}
