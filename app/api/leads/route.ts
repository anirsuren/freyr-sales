import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { getCurrentUser } from "@/lib/currentUser";
import {
  markLeadConverted,
  readLeads,
  removeLead,
  saveLead,
  saveLeadLinkedInLookup,
} from "@/lib/leads";
import { scrapeLeadLinkedInPosts, scrapeLeadLinkedInProfile } from "@/lib/apify";
import { leadLinkedInUrl, normalizeLeadLinkedInProfile } from "@/lib/leadLinkedIn";
import { ensureCustomerAccount } from "@/lib/ensureCustomerAccount";
import { ensureLeadContact } from "@/lib/ensureLeadContact";
import {
  canOpenModule,
  moduleCreateRefusal,
  moduleDeleteRefusal,
  moduleWriteRefusal,
} from "@/lib/moduleAccessServer";

/** Same shape the contacts route uses, so the two modules agree on what an
 *  address is. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const dynamic = "force-dynamic";

/**
 * LEADS API. One route, op-switched, the same shape as Solutioning.
 *
 * The module is admin-only for now (lib/moduleAccess NEW_MODULES_ADMIN_ONLY),
 * and the endpoint enforces that itself rather than trusting the page guard —
 * hiding a nav item is a curtain, this is the lock.
 */
async function closed(): Promise<NextResponse | null> {
  return (await canOpenModule("/leads"))
    ? null
    : NextResponse.json({ error: "Not available on this account." }, { status: 403 });
}

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const shut = await closed();
  if (shut) return shut;
  return NextResponse.json({ state: await readLeads() });
}

export async function POST(req: NextRequest) {
  /* WRITE IS ITS OWN PERMISSION (Suren, Aug 29). Refuses before the
     handler reads a body, so a person who may READ this module cannot
     change it. Falls through to the old role rules while the privilege
     table is not being enforced. */
  {
    const refusal = await moduleWriteRefusal("/leads");
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  }

  const scope = await verifiedRequestMemberScope(req);
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const shut = await closed();
  if (shut) return shut;
  /* Mock writes go to the mock row and can never reach real data, so there is
     nothing to refuse (Anir, Aug 26: "all the same functionality should be on
     mock mode, but it shouldn't affect real data"). See readLeads. */
  const me = await getCurrentUser();
  const body = (await req.json().catch(() => ({}))) ?? {};
  const op = String(body.op ?? "");

  try {
    if (op === "save") {
      /* SAVE IS BOTH VERBS. A lead with no id is a new one, and starting one is
         the owner's right; correcting an existing one is the member's (Suren,
         Aug 29: "owner can create, member can edit"). */
      if (!String((body.lead as { id?: string } | undefined)?.id ?? "")) {
        const refusal = await moduleCreateRefusal("/leads");
        if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
      }
      /* THE SAME CHECK THE CONTACTS ROUTE MAKES. A lead's email box is
         type="email", but a dialog is not a form, so nothing validated it and
         "not-an-email" stored happily — the dialog guards it now, and so does
         this, because the dialog is not the only way in. Optional, as it has
         always been; wrong is what is refused, not missing. */
      const rawEmail = String(
        (body.lead as { email?: unknown } | undefined)?.email ?? ""
      ).trim();
      if (rawEmail && !EMAIL_PATTERN.test(rawEmail)) {
        return NextResponse.json(
          { error: "Enter a valid email address." },
          { status: 400 }
        );
      }
      const requestedUrl = (body.lead as { linkedinUrl?: unknown } | undefined)?.linkedinUrl;
      if (requestedUrl !== undefined && (typeof requestedUrl !== "string" || leadLinkedInUrl(requestedUrl) === null)) {
        return NextResponse.json({ error: "Enter a LinkedIn profile link, such as linkedin.com/in/name." }, { status: 400 });
      }
      const input = body.lead ?? {};
      const company = String(input.company ?? "").trim();
      const account = company ? await ensureCustomerAccount(company, input.customerId, me.name) : null;
      const contact = account ? await ensureLeadContact(account.id, input) : null;
      const lead = await saveLead({ ...input, ...(account ? { company: account.company_name, customerId: account.id, contactId: contact?.id } : {}) }, me.name);
      return NextResponse.json({ ok: true, lead, state: await readLeads() });
    }
    if (op === "enrich-linkedin") {
      const id = String(body.id ?? "");
      const lead = (await readLeads()).leads.find((item) => item.id === id);
      if (!lead) return NextResponse.json({ error: "That lead is gone." }, { status: 404 });
      if (!lead.linkedinUrl) return NextResponse.json({ error: "Add a LinkedIn profile link first." }, { status: 400 });
      const url = lead.linkedinUrl;
      if (!process.env.APIFY_API_TOKEN) {
        await saveLeadLinkedInLookup(id, url, null);
        return NextResponse.json({ error: "Profile lookup is not configured. The link is saved, but no profile facts were imported." }, { status: 503 });
      }
      try {
        const [raw, recentPosts] = await Promise.all([
          scrapeLeadLinkedInProfile(url),
          scrapeLeadLinkedInPosts(url, lead.name).catch(() => []),
        ]);
        const profile = normalizeLeadLinkedInProfile({ ...raw, recentPosts });
        if (!profile) throw new Error("No readable profile details were returned.");
        if (profile.fullName && lead.name) {
          const nameParts = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z]+/).filter((part) => part.length > 1);
          const expected = nameParts(lead.name);
          const actual = nameParts(profile.fullName);
          if (expected.length && !expected.some((part) => actual.includes(part))) {
            return NextResponse.json({ error: `The LinkedIn profile belongs to ${profile.fullName}, not ${lead.name}. The link is saved, but no facts were imported.` }, { status: 409 });
          }
        }
        const saved = await saveLeadLinkedInLookup(id, url, profile);
        if (!saved) return NextResponse.json({ error: "The lead changed while the profile was loading. Please retry." }, { status: 409 });
        return NextResponse.json({ ok: true, lead: saved, state: await readLeads() });
      } catch {
        await saveLeadLinkedInLookup(id, url, null);
        return NextResponse.json({ error: "The link was saved, but the profile could not be read. You can retry from this lead." }, { status: 502 });
      }
    }
    if (op === "delete") {
      const refusal = await moduleDeleteRefusal("/leads");
      if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
      const leadId = String(body.id ?? "");
      /* SAY SO WHEN THERE WAS NOTHING TO DELETE. Answering ok for an id that
         is not there means a caller naming the record by the wrong key gets a
         success and the record stays put — the accruals route fixed exactly
         this on Aug 30 and these four did not follow (found by the Sep 8
         permission matrix, which deleted "__qa_nonexistent__" four times and
         was told yes every time). */
      if (!(await readLeads()).leads.some((l) => l.id === leadId)) {
        return NextResponse.json({ error: "That lead is gone." }, { status: 404 });
      }
      await removeLead(leadId);
      return NextResponse.json({ ok: true, state: await readLeads() });
    }
    if (op === "convert") {
      const lead = await markLeadConverted(
        String(body.id ?? ""),
        String(body.opportunityId ?? ""),
        me.name
      );
      if (!lead) {
        return NextResponse.json({ error: "That lead is gone." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, lead, state: await readLeads() });
    }
    return NextResponse.json({ error: `Unknown op "${op}".` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That didn't save." },
      { status: 400 }
    );
  }
}
