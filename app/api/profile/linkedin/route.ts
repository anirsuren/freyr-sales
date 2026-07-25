import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { scrapeLinkedInProfile } from "@/lib/apify";
import { verifiedRequestMemberScope } from "@/lib/memberScope";

// The rep pastes their LinkedIn URL in Settings > Profile; this turns it into
// identity the agent can actually use. Before this, the agent knew a name and a
// job title, so every draft read like a form letter (Anir, Jul 25: "the agent
// should know all about my LinkedIn URL... that's how it pulls your profile
// picture too").
//
// Enrichment is stored, not re-run per message: scraping on every agent call
// would be slow and would burn Apify credits for data that changes maybe twice
// a year.

/** Accept only real LinkedIn profile URLs — this string gets fetched. */
function normalizeLinkedInUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  // Subdomains are legitimate (uk.linkedin.com), lookalikes are not.
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
  if (!/^\/in\/[^/]+\/?$/.test(url.pathname)) return null;
  return `https://${host}${url.pathname.replace(/\/$/, "")}`;
}

/** Keep the agent's identity block short — it rides along on every request. */
function trimAbout(about: unknown): string | null {
  if (typeof about !== "string" || !about.trim()) return null;
  const clean = about.trim().replace(/\s+/g, " ");
  return clean.length > 600 ? `${clean.slice(0, 597)}...` : clean;
}

export async function POST(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let rawUrl = "";
  try {
    const body = (await req.json()) as { linkedinUrl?: string };
    rawUrl = typeof body.linkedinUrl === "string" ? body.linkedinUrl : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const db = getDb();

  // Clearing the field is a legitimate action — drop the enrichment with it
  // rather than leaving a stale photo and headline behind.
  if (!rawUrl.trim()) {
    await db.agentPrefs.update(scope, {
      linkedin_url: null,
      linkedin_headline: null,
      linkedin_about: null,
      linkedin_photo: null,
      linkedin_synced_at: null,
    });
    return NextResponse.json({ ok: true, cleared: true });
  }

  const linkedinUrl = normalizeLinkedInUrl(rawUrl);
  if (!linkedinUrl) {
    return NextResponse.json(
      {
        error:
          "That doesn't look like a LinkedIn profile address. It should look like https://www.linkedin.com/in/your-name",
      },
      { status: 400 }
    );
  }

  let profile: Record<string, unknown>;
  try {
    profile = (await scrapeLinkedInProfile(linkedinUrl)) as Record<
      string,
      unknown
    >;
  } catch (error) {
    // Save the URL even when the lookup fails, so the rep's input is not lost
    // and a later retry has something to work from.
    await db.agentPrefs.update(scope, { linkedin_url: linkedinUrl });
    return NextResponse.json(
      {
        error:
          "Saved your link, but we couldn't read the profile just now. Try Refresh in a moment.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }

  const headline =
    typeof profile.headline === "string" && profile.headline.trim()
      ? profile.headline.trim()
      : null;
  const photo =
    typeof profile.profilePicture === "string"
      ? profile.profilePicture
      : typeof profile.photoUrl === "string"
        ? profile.photoUrl
        : null;

  const saved = await db.agentPrefs.update(scope, {
    linkedin_url: linkedinUrl,
    linkedin_headline: headline,
    linkedin_about: trimAbout(profile.about),
    linkedin_photo: photo,
    linkedin_synced_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    profile: {
      headline: saved.linkedin_headline,
      about: saved.linkedin_about,
      photo: saved.linkedin_photo,
      syncedAt: saved.linkedin_synced_at,
    },
  });
}
