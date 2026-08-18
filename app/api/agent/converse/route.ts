import { NextRequest, NextResponse } from "next/server";
import { bumpUsage } from "@/lib/usageCounters";
import { getDb, type Db } from "@/lib/db";
import { escapeRegExp } from "@/lib/utils";
import { manualFor } from "@/lib/appManual";
import { nextBestActions, focusActions, DRAFTABLE } from "@/lib/agent";
import { buildDeals, formatMoney, ROTTING_DAYS } from "@/lib/pipeline";
import { accountHealth } from "@/lib/health";
import {
  answerAgentChat,
  findAccount,
  parseWhen,
  type ChatContext,
  type ChatTurn,
  type ChatAction,
} from "@/lib/agentChat";
import { agentConverseAgentic, type AgentToolDef } from "@/lib/claude";
import { offeringsAnswer } from "@/lib/offeringsAgent";
import {
  getOffering,
  hydrateOffering,
  initializeLiveOfferings,
  listOfferings,
} from "@/lib/offerings";
import {
  redactAgentOnlyMaterials,
  secureKnowledgePassagesForMember,
} from "@/lib/materialAccess";
import { isOfferingsOnly } from "@/lib/release";
import { getDataMode } from "@/lib/dataMode";
import {
  listAssignablePeople,
  redactUnverifiedOfferingPeople,
} from "@/lib/assignablePeople";
import {
  canViewNextCustomerVersion,
  hideNextCustomerVersions,
} from "@/lib/roadmapAccess";
import {
  searchKnowledge,
  knowledgeBlock,
  buildKnowledgeBaseAsync,
} from "@/lib/knowledgeBase";
import { sourceDateWindowForQuestion } from "@/lib/sourceDates";
import {
  verifiedWorkflowActor,
  type VerifiedWorkflowActor,
} from "@/lib/workflowAuthorization";
import type { Contact, PitchSession } from "@/lib/types";
import { rejectRealModeAgentMutation } from "@/lib/agentMutationPolicy";
import { readMemberProfile } from "@/lib/memberProfile";
import { searchMarketIntel } from "@/lib/marketIntelAgent";

export const dynamic = "force-dynamic";

// The agent chat (V11). One conversational endpoint that can ANSWER or ACT.
// - Builds live pipeline context every call (always grounded in real data).
// - If the message asks the agent to DO something (save a draft, set a
//   follow-up, log a call), it executes a real write and reports back exactly
//   what happened — it never claims to have sent anything outward.
// - For conversation, Claude is the primary voice when ANTHROPIC_API_KEY is set
//   (it gets the live facts + full history as real message turns); otherwise the
//   deterministic brain answers so the chat is never silent.
export async function POST(req: NextRequest) {
  const actor = await verifiedWorkflowActor(req);
  if (!actor) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  const scope = {
    workspaceId: actor.workspaceId,
    userId: actor.userId,
  };
  const actorName = actor.name;
  /**
   * WHAT A COLLEAGUE WOULD CALL THEM.
   *
   * The prompt handed the assistant a full name and told it to use it, so every
   * other message opened with "Anir Suren" — nobody talks like that (Anir,
   * Jul 29: "it doesn't have to refer to me by my full name. It's kind of
   * annoying, just like a regular friend"). First name for talking; the full
   * name survives only where it belongs, on the signature of a draft.
   */
  const firstName = actorName.trim().split(/\s+/)[0] || actorName;
  const body = await req.json().catch(() => ({}));
  const message = String(body.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }
  // Counted for the monthly note (Anir, Aug 18: "interactions with the AI
  // agent"). Fire-and-forget, after validation so refusals never count.
  bumpUsage(actor.userId, "agent");
  // Where the person is standing and what their screen shows, sent by the
  // dock on every message (Anir, Aug 11: "it'll know what page I'm on").
  const onPath = String(body.path || "").slice(0, 200);
  const onSubject = String(body.subject || "").slice(0, 120);
  const pageContext = String(body.pageContext || "").slice(0, 5000);
  /** The dock keeps one thread across navigation; this says the ground moved. */
  const pathChanged = body.pathChanged === true;
  // The destinations behind the words on screen. textContent drops every
  // href, so without these the agent can see "Read the article" and honestly
  // cannot tell you where it goes.
  const pageLinks = Array.isArray(body.pageLinks)
    ? body.pageLinks
        .map((l: unknown) => String(l).slice(0, 300))
        .filter(Boolean)
        .slice(0, 30)
    : [];
  const liveAccounts =
    getDataMode() === "live" ? await listAssignablePeople() : [];
  const visibleOfferings = () =>
    listOfferings().map((offering) =>
      redactUnverifiedOfferingPeople(offering, liveAccounts)
    );
  const requestedOfferingId = String(body.offeringId || "").trim().slice(0, 120);
  const requestedMaterialId = String(body.materialId || "").trim().slice(0, 160);
  let focusedOfferingName = "";
  let focusedMaterialId = "";
  let focusedMaterialLabel = "";
  let offeringFocus = "";
  if (requestedOfferingId) {
    try {
      await initializeLiveOfferings();
      const raw = getOffering(requestedOfferingId);
      if (raw) {
        const displayRaw = redactUnverifiedOfferingPeople(raw, liveAccounts);
        const roadmapSafe = (await canViewNextCustomerVersion(raw))
          ? hydrateOffering(displayRaw)
          : hideNextCustomerVersions(hydrateOffering(displayRaw));
        const offering = redactAgentOnlyMaterials(roadmapSafe, actor.userId);
        const verifiedContacts = offering.contacts;
        focusedOfferingName = offering.offering_name;
        const materials = offering.materials || [];
        const focusedMaterial = requestedMaterialId
          ? materials.find((material) => material.id === requestedMaterialId)
          : undefined;
        focusedMaterialId = focusedMaterial?.id || "";
        focusedMaterialLabel = focusedMaterial?.label || "";
        offeringFocus =
          "\n\nOFFERING SELECTED BY THE USER (explicit context from the Ask Freyr AI button):\n" +
          [
            focusedMaterial &&
              "SPECIFIC SALES MATERIAL CURRENTLY OPEN ON SCREEN:\n" +
                [
                  `Material: ${focusedMaterial.label}`,
                  `Material ID: ${focusedMaterial.id}`,
                  `Format: ${focusedMaterial.kind}`,
                  focusedMaterial.folder && `Folder: ${focusedMaterial.folder}`,
                  (focusedMaterial.journeyStages?.length ||
                    focusedMaterial.journeyStage) &&
                    `Buyer journey: ${(
                      focusedMaterial.journeyStages?.length
                        ? focusedMaterial.journeyStages
                        : [focusedMaterial.journeyStage]
                    ).join(", ")}`,
                  focusedMaterial.accessLevel &&
                    `Access level: ${focusedMaterial.accessLevel}`,
                  focusedMaterial.description &&
                    `Description: ${focusedMaterial.description}`,
                  "Resolve phrases such as 'this material', 'this file', 'this document', and 'it' to this exact sales material unless the user explicitly changes the subject.",
                ]
                  .filter(Boolean)
                  .join("\n"),
            `Name: ${offering.offering_name}`,
            offering.offering_type && `Offering type: ${offering.offering_type}`,
            offering.offering_category && `Category: ${offering.offering_category}`,
            offering.current_availability &&
              `Current availability: ${offering.current_availability}`,
            offering.offering_description &&
              `Offering brief: ${offering.offering_description}`,
            offering.customerTypes?.length &&
              `Customer fit: ${offering.customerTypes.map((type) => type.name).join(", ")}`,
            offering.markets?.length &&
              `Markets: ${offering.markets.map((market) => market.name).join(", ")}`,
            verifiedContacts.length &&
              `Contacts: ${verifiedContacts
                .map((contact) =>
                  `${contact.name}${contact.role ? ` (${contact.role})` : ""}`
                )
                .join(", ")}`,
            offering.releases?.length &&
              `Versions: ${offering.releases
                .map(
                  (release) =>
                    `${release.version} (${release.status}${
                      release.date ? `, ${release.date}` : ""
                    })`
                )
                .join("; ")}`,
            `Visible sales materials (${materials.length}): ${
              materials.length
                ? materials
                    .map(
                      (material) =>
                        `${material.label} [${material.kind}]${
                          material.folder ? ` in ${material.folder}` : ""
                        }`
                    )
                    .join("; ")
                : "None recorded"
            }`,
            "Resolve phrases such as 'this offering', 'it', and 'its materials' to this offering unless the user explicitly changes the subject.",
          ]
            .filter(Boolean)
            .join("\n");
      }
    } catch {
      // Invalid/stale context must not take the whole assistant down. The chat
      // remains generic rather than pretending an offering was loaded.
    }
  }
  // Sources THIS chat has switched off in the Knowledge base panel. Sent as
  // exclusions so the default — nothing sent — means the assistant uses
  // everything, and one narrowed conversation never narrows another.
  const requestedExclusions: string[] = Array.isArray(body.excludeSources)
    ? body.excludeSources
        .filter((v: unknown) => typeof v === "string")
        .slice(0, 500)
    : [];
  // Uploaded offering files are always readable. Ignore legacy chat state that
  // excluded one of their material ids; catalogue-only sources may still be
  // scoped for a conversation.
  const uploadedMaterialIds = new Set(
    visibleOfferings().flatMap((offering) =>
      offering.materials
        .filter((material) => !!material.docsPath)
        .map((material) => material.id)
    )
  );
  const excludedSourceIds = requestedExclusions.filter(
    (id) => !uploadedMaterialIds.has(id)
  );
  const isAllowed = (p: { id: string; href: string }) =>
    !excludedSourceIds.some(
      (id) => p.id === id || p.id.startsWith(`${id}#`) || p.href.endsWith(id)
    );

  // THE WHOLE CHAT IS THE MEMORY.
  //
  // This used to keep the last ten turns, which is five exchanges — so by the
  // sixth question the assistant had quietly forgotten how the conversation
  // started and began asking what "it" referred to (Anir, Jul 29: "one chat is
  // the entire memory"). The client already sends every message; the server was
  // the one throwing them away.
  //
  // Nothing crosses a chat boundary: a new conversation starts empty and knows
  // only the shared knowledge base, never what was said in another thread.
  //
  // The only trimming left is a context-window guard, and it drops the OLDEST
  // turns first so the recent thread — the part "it" and "that one" refer to —
  // always survives.
  const HISTORY_BUDGET = 240_000; // characters, ~60k tokens: whole chats fit
  const claimed: ChatTurn[] = Array.isArray(body.history)
    ? body.history
        .map((t: any) => {
          if (!t || (t.role !== "user" && t.role !== "agent")) return null;
          // `text` is the contract, but accept `content` too: a caller using
          // the wrong field name should not silently lose the conversation.
          const text = typeof t.text === "string" ? t.text : t.content;
          return typeof text === "string" && text ? { role: t.role, text } : null;
        })
        .filter(Boolean)
    : [];
  let budget = HISTORY_BUDGET;
  const kept: ChatTurn[] = [];
  for (let i = claimed.length - 1; i >= 0; i--) {
    budget -= claimed[i].text.length;
    if (budget < 0) break;
    kept.unshift(claimed[i]);
  }
  const history: ChatTurn[] = kept;

  const db = getDb();
  const [sessions, customers, contacts, interactions, runs, prefs, memberProfile] =
    await Promise.all([
      db.pitchSessions.list(),
      db.customers.list(),
      db.contacts.list(),
      db.interactions.list(),
      db.agentRuns.list(),
      db.agentPrefs.get(scope),
      readMemberProfile(scope).catch(() => ({ title: "", signature: "" })),
    ]);
  const deals = buildDeals(sessions, customers, contacts, interactions);
  const { actions } = focusActions(
    nextBestActions({ sessions, customers, contacts, interactions }),
    customers,
    prefs,
    actorName,
    scope.userId
  );
  const needsApproval = actions.filter((a) => !DRAFTABLE.includes(a.kind)).length;
  const companyById = Object.fromEntries(
    customers.map((c) => [c.id, c.company_name])
  );

  const ctx: ChatContext = {
    customers,
    contacts,
    deals,
    interactions,
    runs,
    needsApproval,
    topActions: actions.map((a) => ({
      title: a.title,
      rationale: a.rationale,
      kind: a.kind,
      company: companyById[a.customerId] || "",
    })),
  };

  const base = answerAgentChat(message, ctx, history, actorName);

  // `mock:true` forces the deterministic brain — used by the test suite so
  // assertions stay reproducible whether or not a key is set.
  const forceMock = body.mock === true;

  // Deterministic responder: the offline safety net. Runs for the test suite
  // (mock:true) and whenever the live agent is unavailable (no key) or errors,
  // so the chat is never silent. It detects actions by pattern as a best effort —
  // the real reasoning lives in the tool-using agent below.
  const deterministic = async () => {
    // Factual offerings questions answered straight from the repository:
    // grounded and keyless. This used to run BEFORE Claude, so a rigid
    // template answered even when the real model was available. Now the model
    // owns the conversation and this is purely the offline net.
    const off = offeringsAnswer(
      message,
      visibleOfferings().map((offering) =>
        redactAgentOnlyMaterials(offering, actor.userId)
      )
    );
    if (off) {
      return NextResponse.json({
        ok: true,
        reply: off.reply,
        suggestions: off.suggestions,
        source: "offerings",
      });
    }
    const action = base.action;
    if (action?.type === "show_pitch") {
      const result = showPitch(action, sessions);
      return NextResponse.json({
        ok: true,
        reply: result.reply,
        suggestions: result.suggestions,
        source: "pitch",
        did: "show_pitch",
      });
    }
    if (action) {
      const denied = rejectRealModeAgentMutation();
      if (denied) return denied;
      const result = await executeAction(
        db,
        action,
        contacts,
        history,
        actor
      );
      return NextResponse.json({
        ok: true,
        reply: result.reply,
        suggestions: result.suggestions,
        source: "action",
        did: action.type,
      });
    }
    return NextResponse.json({
      ok: true,
      reply: base.text,
      suggestions: base.suggestions,
      source: "mock",
    });
  };

  if (forceMock) return deterministic();

  // -----------------------------------------------------------------------
  // PRIMARY: the real tool-using agent. Claude gets the whole book and DECIDES
  // what to do — read deeper detail, list/filter, or take a real (human-led)
  // action — instead of us pattern-matching. It answers anything, in any
  // language. Falls through to the deterministic net if there's no key/it errors.
  // -----------------------------------------------------------------------
  // ALWAYS RETRIEVE, don't wait to be asked.
  //
  // The catalogue and the uploaded documents used to reach this page only
  // through the search_offerings TOOL, which means the model had to decide the
  // question sounded like an offerings question. Ask "what is my discount
  // authority?" — a fact sitting in an uploaded one-pager — and it never
  // called the tool, so it answered "I don't have that information" while the
  // bubble on the offering page answered correctly from the same file. Same
  // brain, same documents, two different answers depending on the surface.
  //
  // So the most relevant passages are put in front of it every turn, exactly
  // as the assistant dock does. The tool stays for follow-up searches.
  // THE CATALOGUE, COUNTED, AS FACT.
  //
  // The only offerings tool is a SEARCH, so a question like "how many
  // offerings do we have?" made the model count its own search hits and answer
  // 20 when the true number is 29. Totals are cheap and always available, so
  // they belong in the grounding rather than behind a tool the model has to
  // guess how to use.
  /**
   * THE WHOLE CATALOGUE, HANDED OVER, NOT SEARCHED FOR.
   *
   * The only offerings tool is a keyword search, so "list all the offerings"
   * meant running searches and stitching hits together: it found 26 of 29 and
   * said so (Anir, Jul 29: "it doesn't even know the offerings"). Anything the
   * user can see on the Offerings page the assistant must simply know. Twenty
   * nine rows is nothing to a model, so the full list goes in every time and
   * the search tool is left for digging into documents.
   */
  const catalogueGrounding = (() => {
    try {
      /**
       * UNCHECKING AN OFFERING HAS TO ACTUALLY REMOVE IT.
       *
       * This block listed the whole catalogue unconditionally while only the
       * document search respected the Knowledge panel — so a person could
       * untick an offering, watch the panel say "1 turned off", and still get
       * answers about it, because its name, category and availability were
       * sitting in the system prompt regardless (Anir, Jul 30: "make sure that
       * when I uncheck and stuff, it actually works").
       *
       * Offering ids in the panel are the offering's own id, so the same
       * matcher the corpus uses applies here.
       */
      const all = visibleOfferings().filter((o) =>
        isAllowed({ id: o.id, href: `/offerings/${o.id}` })
      );
      if (!all.length) return "";
      const byType = new Map<string, typeof all>();
      for (const o of all) {
        const t = o.offering_type || "Other";
        if (!byType.has(t)) byType.set(t, []);
        byType.get(t)!.push(o);
      }
      const blocks = [...byType.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(
          ([type, list]) =>
            `${type} (${list.length}):\n` +
            list
              .map(
                (o) =>
                  `  - ${o.offering_name} | category: ${o.offering_category || "none"}` +
                  ` | availability: ${o.current_availability || "unknown"}`
              )
              .join("\n")
        )
        .join("\n");
      return (
        `\n\nFREYR'S OFFERINGS CATALOGUE (${all.length} offerings` +
        (excludedSourceIds.length
          ? ", narrowed to what this chat was told to use"
          : ", the whole list") +
        `, authoritative: never search to answer "how many" or "list them", ` +
        `just read this):\n${blocks}`
      );
    } catch {
      return "";
    }
  })();

  const knowledgeGrounding = await (async () => {
    try {
      const corpus = secureKnowledgePassagesForMember(
        await buildKnowledgeBaseAsync(),
        actor.userId
      );
      const scoped = excludedSourceIds.length ? corpus.filter(isAllowed) : corpus;
      const materialScoped = focusedMaterialId
        ? scoped.filter(
            (passage) =>
              passage.id === focusedMaterialId ||
              passage.id.startsWith(`${focusedMaterialId}#`)
          )
        : [];
      const searchScope = materialScoped.length ? materialScoped : scoped;
      const hits = searchKnowledge(
        focusedMaterialLabel
          ? `${focusedMaterialLabel} ${message}`
          : message,
        5,
        searchScope
      );
      if (!hits.length) return "";
      return (
        "\n\nFREYR'S OWN KNOWLEDGE (offerings catalogue and the contents of " +
        "uploaded sales material. Quote it when it answers the question. Name " +
        "normal documents, but keep sources labelled 'Private AI training material' " +
        "anonymous):\n" +
        knowledgeBlock(hits, sourceDateWindowForQuestion(message))
      );
    } catch {
      return "";
    }
  })();

  /**
   * WHAT THE PERSON CAN ACTUALLY SEE IS WHAT THE AGENT KNOWS.
   *
   * In real (offerings-only) mode the app hides the pipeline entirely: no
   * customers, no deals, no sessions, no to-do. The assistant was still being
   * handed all of it, so it opened with "9 Launch Biotech accounts at risk"
   * about records the user cannot open (Anir, Jul 29: "in real mode, just the
   * shit that's visible to the user should be in the agent"). Talking about
   * invisible demo data is worse than saying nothing: it reads as either a bug
   * or a lie.
   *
   * The same helper the navigation and search already use decides it here, so
   * the three can never disagree.
   */
  const offeringsOnly = isOfferingsOnly(getDataMode());

  const facts = offeringsOnly ? "" : buildFacts(ctx, deals, needsApproval, runs);
  const savedSignature =
    memberProfile.signature.trim() || `${actorName}\nFreyr Solutions`;
  const memberIdentity = memberProfile.title
    ? `${firstName}, whose role is ${memberProfile.title}`
    : firstName;
  // One prompt, six short sections. Every reactive "NEVER do X" patch that
  // accumulated here has been folded into plain statements of how to behave —
  // a stack of prohibitions reads like a form and produces a bot that sounds
  // like one (Anir, Jul 29: "stop confusing with all of these different rules").
  const agentSystem =
    `You are Freyr's AI sales assistant, working for ${memberIdentity} in regulatory life-sciences.\n\n` +

    "VOICE. Talk like a friend who works here: warm, direct, plain English, no jargon, no filler. " +
    "Answer the question in your first sentence. A greeting gets a short, friendly greeting back, nothing more. " +
    `Their name is ${firstName}. Do not open messages by addressing them, and never use their surname; ` +
    "people don't say each other's names in most sentences, so only use it if it genuinely fits. " +
    "Reply in English. " +
    "Use a period, comma or colon where an em dash would go. Keep answers to 2-5 sentences unless the user asks for depth or a draft.\n\n" +

    "HONESTY. Every number, name and figure comes from your grounding or a tool result; if you don't have it, say so. " +
    "For latest/recent questions, rank by the labelled document content/published date before an upload-date fallback, and state the exact source date and inclusive date window. " +
    "You answer questions and write things; you do not save, send, file, schedule or change anything, " +
    "and you never claim to have contacted anyone.\n\n" +

    (offeringsOnly
      ? "SCOPE. This workspace holds Freyr's offerings catalogue, uploaded sales materials, AND the live Market " +
        "Intelligence feed (tracked customer and competitor companies: their real LinkedIn posts, news, AI signals, " +
        "followed people, and the M&A tracker). No deals/pipeline/to-do records exist here, so never bring those up or quote zeros for them. " +
        "Use search_offerings for anything about offerings, materials, markets or customer types; use search_market_intel " +
        "for anything about a tracked company, what someone is posting, industry news, signals, competitors or M&A. " +
        "Name the document when you quote one unless it is labelled 'Private AI training material'. Never guess or reveal an anonymous source's title, filename, URL or upload metadata.\n\n"
      : "SCOPE. You have the user's full book (below) plus tools to read it: get_account_detail (depth on one account), " +
        "list_accounts (filter the book), search_offerings (anything about offerings, materials, markets, customer types - " +
        "search before answering those, and name the document when you quote one unless it is labelled 'Private AI training material'; never guess or reveal an anonymous source's title, filename, URL or upload metadata), " +
        "and search_market_intel (the live Market Intelligence feed: tracked companies' LinkedIn posts, news, AI signals, followed people and the M&A tracker - search it for anything about what a tracked company or person is doing).\n\n") +

    /**
     * HOW THE APP ITSELF WORKS (Anir, Aug 16: "if I have questions about the
     * application, it should do that... How can I do this feature? How can I
     * add a person to an offering?").
     *
     * lib/appManual was written for exactly this and was only ever wired into
     * /api/agent/assistant, which no screen calls. The dock and the agent page
     * both post to THIS route, so the manual never reached a single user: the
     * agent answered "I don't see anything about a log a result feature" and
     * read "verify someone's number" as a phone number. Both are core flows it
     * now has the steps for.
     */
    `HOW THIS APP WORKS. The product manual below is authoritative for any
how-to, where-is, or who-can question about Freyr Sales Intelligence itself:
the pages, the buttons, and the steps. Answer those from it directly and name
the page and control. Never say a feature does not exist just because it is
absent from the offerings catalogue or the market intel feed; those hold
Freyr's PRODUCTS, not this app's own functionality.\nMANUAL:\n"""\n${manualFor(
      onPath,
      message
    )}\n"""\n\n` +

    // A CHATBOT, NOT AN OPERATOR (Anir, Jul 29: "just have it like a normal
    // chatbot for now. I don't know what kind of features they wanted to do and
    // what kind of actions they wanted to take").
    //
    // It used to end drafts with "want me to save that?" \u2014 an offer that was
    // broken in real mode (no save_draft tool) and, where it did work, decided
    // on Freyr's behalf that an assistant should be writing to their records.
    // Until Suren says which actions he actually wants, it writes and hands
    // over; the person puts it wherever it belongs.
    "DRAFTS. When asked to write outreach, write the whole thing: a Subject line plus 3-5 short sentences, " +
    `with no placeholders and signed using exactly these saved lines:\n${savedSignature}\n` +
    "Show it and stop there: you have no way to save, send or file it, so never offer to. " +
    "The person copies it wherever they need it.\n\n" +

    "FORMAT. Markdown renders: bold, bullets, tables (use a table for 3+ records). " +
    "When comparing 3+ numbers from your grounding, also add a chart block:\n" +
    '```chart\n{"type":"bar","title":"Open pipeline by stage","format":"money","data":[{"label":"Prospect","value":391000}]}\n```\n' +
    'Types: "bar" (comparisons), "donut" (share of a whole), "area" (trend). Real values only.\n\n' +

    /**
     * WHERE THEY ARE IS NOT CONDITIONAL ON PAGE CONTENT (bug, Aug 16).
     * The dock sends `path` on every message, but this whole block used to
     * hang off `pageContext`, so whenever the screen scraped to nothing the
     * model was never told the path it had been handed — and answered "I can't
     * see your screen, which page are you on?" to someone standing on
     * /performance/goal/g-1. The location is a fact we have; only PAGE CONTENT
     * depends on there being page text to quote.
     */
    (onPath || pageContext
      ? (pathChanged
          ? "THEY HAVE MOVED. This question comes from a DIFFERENT page than the last one. " +
            "Everything earlier in this conversation described a page they have left: do not carry " +
            "its records, names or numbers into this answer. Answer only from the PAGE CONTENT below.\n\n"
          : "") +
        `WHERE THEY ARE. The person is on ${onPath || "the app"}${onSubject ? `, looking at ${onSubject}` : ""}. ` +
        'Never ask them which page they are on, and never say you cannot see their screen: "this page" means ' +
        `${onPath || "the page named above"}. Answer for that page, using the MANUAL section for it.\n` +
        (pageContext
          ? "PAGE CONTENT below is the exact text on their screen right now; treat it as ground truth for questions " +
            'about "this page", "this company" or anything they can see.' +
            "\nPAGE CONTENT:\n" + '"""' + "\n" +
            pageContext +
            "\n" + '"""' + "\n" +
            (pageLinks.length
              ? "LINKS ON THIS PAGE (label — destination). Use these when asked " +
                "for an article, source or link:\n" +
                pageLinks.map((l: string) => `- ${l}`).join("\n") +
                "\n"
              : "")
          : "") +
        "\n"
      : "") +
    (offeringsOnly ? "" : "THE BOOK (live data):\n" + facts) +
    offeringFocus +
    catalogueGrounding +
    knowledgeGrounding;

  const turns: { role: "user" | "assistant"; content: string }[] = [
    ...history.map((t) => ({
      role: (t.role === "agent" ? "assistant" : "user") as "user" | "assistant",
      content: t.text,
    })),
    { role: "user" as const, content: message },
  ];

  // Resolve whatever the model put in an `account` field to a real customer:
  // a company name (full or partial), an id, OR a CONTACT's name — reps say
  // "draft something for Patricia" or "what's the latest with Lena Vogt" all the time.
  const resolveAccount = (q: unknown) => {
    const s = String(q || "").trim();
    if (!s) return null;
    const byCompany = findAccount(s, customers) || customers.find((c) => c.id === s);
    if (byCompany) return byCompany;
    const lc = s.toLowerCase();
    if (lc.length < 3) return null;
    const ct = contacts.find((x) => {
      const fn = x.full_name
        .toLowerCase()
        .replace(/^(dr|mr|mrs|ms|prof)\.?\s+/, "")
        .trim();
      if (!fn) return false;
      if (lc.includes(fn) || fn.includes(lc)) return true;
      return fn
        .split(/\s+/)
        .some(
          (p) => p.length >= 4 && new RegExp(`\\b${escapeRegExp(p)}\\b`).test(lc)
        );
    });
    return ct ? customers.find((c) => c.id === ct.customer_id) || null : null;
  };
  const dateOf = (iso: string) => new Date(iso).getTime();

  const runTool = async (
    name: string,
    input: any
  ): Promise<{ content: string; did?: string }> => {
    const notFound = (q: unknown) => ({
      content: `No account matching "${q}". Accounts on the book: ${customers
        .map((c) => c.company_name)
        .join(", ")}.`,
    });

    if (name === "get_account_detail") {
      const c = resolveAccount(input?.account);
      if (!c) return notFound(input?.account);
      const cDeals = deals.filter((d) => d.customerId === c.id);
      const open = cDeals.filter((d) => d.stage !== "Closed Lost");
      const cContacts = contacts.filter((x) => x.customer_id === c.id);
      const cInts = interactions
        .filter((i) => i.customer_id === c.id)
        .sort((a, b) => dateOf(b.created_at) - dateOf(a.created_at));
      const health = accountHealth({
        interactions: cInts,
        deals: cDeals,
        contactCount: cContacts.length,
      });
      const content = [
        `Account: ${c.company_name} - ${c.industry}, ${c.geography}, size ${c.size_tier}`,
        `Enrichment: ${c.enrichment_summary || "n/a"}`,
        `Health: ${health.label} (${health.score}/100)`,
        `Open deals (${open.length}, ${formatMoney(
          open.reduce((s, d) => s + d.value, 0)
        )}): ${open
          .map((d) => `${d.stage} ${formatMoney(d.value)}, quiet ${d.staleDays}d`)
          .join("; ") || "none"}`,
        `Contacts (${cContacts.length}): ${cContacts
          .map(
            (x) =>
              `${x.full_name}, ${x.job_title}${x.email ? ` <${x.email}>` : ""}`
          )
          .join("; ") || "none mapped"}`,
        `Recent interactions: ${cInts
          .slice(0, 6)
          .map(
            (i) =>
              `${new Date(i.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })} ${i.outcome}: ${(i.notes || "").replace(/\s+/g, " ").slice(0, 100)}`
          )
          .join(" | ") || "none"}`,
      ].join("\n");
      return { content };
    }

    if (name === "list_accounts") {
      const filter = String(input?.filter || "all");
      const open = deals.filter((d) => d.stage !== "Closed Lost");
      const healthOf = (c: (typeof customers)[number]) =>
        accountHealth({
          interactions: interactions.filter((i) => i.customer_id === c.id),
          deals: deals.filter((d) => d.customerId === c.id),
          contactCount: contacts.filter((x) => x.customer_id === c.id).length,
        });
      let rows: string[] = [];
      if (filter === "at_risk") {
        rows = customers
          .filter((c) => healthOf(c).band === "at_risk")
          .map((c) => `${c.company_name}: health ${healthOf(c).score}/100`);
      } else if (filter === "cooling") {
        rows = open
          .filter((d) => d.staleDays > ROTTING_DAYS)
          .sort((a, b) => b.staleDays - a.staleDays)
          .map((d) => `${d.company} - ${formatMoney(d.value)}, quiet ${d.staleDays}d (${d.stage})`);
      } else if (filter === "biggest") {
        rows = [...open]
          .sort((a, b) => b.value - a.value)
          .slice(0, 8)
          .map((d) => `${d.company} - ${formatMoney(d.value)} (${d.stage})`);
      } else {
        rows = customers.map((c) => {
          const d = open.find((x) => x.customerId === c.id);
          return `${c.company_name} - ${d ? `${d.stage} ${formatMoney(d.value)}` : "no open deal"}, health ${healthOf(c).score}/100`;
        });
      }
      return { content: rows.length ? rows.join("\n") : `No accounts match "${filter}".` };
    }

    if (name === "show_pitch") {
      const c = resolveAccount(input?.account);
      if (!c) return notFound(input?.account);
      const result = showPitch(
        { customerId: c.id, company: c.company_name },
        sessions
      );
      return { content: result.reply, did: "show_pitch" };
    }

    if (name === "save_draft") {
      if (rejectRealModeAgentMutation()) {
        return { content: "Agent actions are disabled in Real mode. Nothing was changed." };
      }
      const c = resolveAccount(input?.account);
      if (!c) return notFound(input?.account);
      const result = await executeAction(
        db,
        {
          type: "save_draft",
          customerId: c.id,
          company: c.company_name,
          body: String(input?.body || ""),
        },
        contacts,
        history,
        actor
      );
      return { content: result.reply, did: "save_draft" };
    }

    if (name === "set_followup") {
      if (rejectRealModeAgentMutation()) {
        return { content: "Agent actions are disabled in Real mode. Nothing was changed." };
      }
      const c = resolveAccount(input?.account);
      if (!c) return notFound(input?.account);
      const when = parseWhen(String(input?.when || "next week"));
      const result = await executeAction(
        db,
        {
          type: "set_followup",
          customerId: c.id,
          company: c.company_name,
          when: when.iso,
          label: when.label,
        },
        contacts,
        history,
        actor
      );
      return { content: result.reply, did: "set_followup" };
    }

    if (name === "log_touch") {
      if (rejectRealModeAgentMutation()) {
        return { content: "Agent actions are disabled in Real mode. Nothing was changed." };
      }
      const c = resolveAccount(input?.account);
      if (!c) return notFound(input?.account);
      const outcome = ["interested", "meeting_booked", "in_progress"].includes(
        String(input?.outcome)
      )
        ? (input.outcome as "interested" | "meeting_booked" | "in_progress")
        : "in_progress";
      const result = await executeAction(
        db,
        {
          type: "log_touch",
          customerId: c.id,
          company: c.company_name,
          notes: String(input?.notes || "Logged a touch."),
          outcome,
        },
        contacts,
        history,
        actor
      );
      return { content: result.reply, did: "log_touch" };
    }

    if (name === "search_market_intel") {
      const q = String(input?.query || "").trim();
      if (!q) return { content: "Give search_market_intel a query." };
      return { content: await searchMarketIntel(q) };
    }

    if (name === "search_offerings") {
      const q = String(input?.query || "").trim();
      if (!q) return { content: "Give search_offerings a query." };
      // A chat can be scoped to particular sources from the Knowledge base
      // panel. Passages carry the id of the record they came from; a file's
      // chunks carry the material id, so matching on the prefix keeps every
      // chunk of a chosen document.
      const corpus = secureKnowledgePassagesForMember(
        await buildKnowledgeBaseAsync(),
        actor.userId
      );
      const scoped = excludedSourceIds.length ? corpus.filter(isAllowed) : corpus;
      const hits = searchKnowledge(q, 6, scoped);
      if (!hits.length)
        return { content: `Nothing in the offerings catalogue matches "${q}".` };
      return {
        content: knowledgeBlock(hits, sourceDateWindowForQuestion(q)),
      };
    }

    return { content: `Unknown tool: ${name}.` };
  };

  // THE ASSISTANT READS; IT DOES NOT WRITE.
  //
  // save_draft / set_followup / log_touch / show_pitch are no longer offered to
  // the model in either mode. Nobody has decided yet which actions this thing
  // should be allowed to take on a real workspace (Anir, Jul 29: "does it make
  // sense for this agent to be able to do that? I don't even know. Just have it
  // like a normal chatbot for now"), and an assistant that quietly files things
  // against live records is the wrong default to ship while that is open.
  //
  // The handlers below stay for the in-progress demo, where explicit UI actions
  // are useful. The server-level Real-mode guard still refuses them even if a
  // caller bypasses this tool list. Turning the live agent into an operator
  // therefore requires an explicit capability decision in both places.
  const readOnlyTools = AGENT_TOOLS.filter((t) =>
    offeringsOnly
      ? ["search_offerings", "search_market_intel"].includes(t.name)
      : [
          "search_offerings",
          "search_market_intel",
          "get_account_detail",
          "list_accounts",
        ].includes(t.name)
  );
  const agentResult = await agentConverseAgentic(
    agentSystem,
    turns,
    readOnlyTools,
    runTool
  );
  if (agentResult && agentResult.text) {
    return NextResponse.json({
      ok: true,
      reply: linkifyAccounts(agentResult.text, customers),
      suggestions: focusedOfferingName
        ? [
            `Who is ${focusedOfferingName} best suited for?`,
            `What sales materials do we have for ${focusedOfferingName}?`,
            `Write a short pitch for ${focusedOfferingName}`,
          ]
        : base.suggestions,
      source: "claude-agent",
      did: agentResult.dids[0],
      continuationAvailable: agentResult.truncated,
    });
  }

  // NO PRE-WRITTEN ANSWER EVER REACHES A PERSON.
  //
  // Every template that used to answer here was indistinguishable from the
  // assistant itself, so a bad minute at the API read as "this is not an AI"
  // (Anir, Jul 29: "no hardcoded messages are allowed, remove all hardcoded
  // messages"). If Claude cannot answer after its retries, that is an outage,
  // and it should look like one: the chat shows a plain "couldn't reach the
  // agent, try again" notice, which is honest, rather than a canned reply
  // wearing the assistant's face.
  //
  // The deterministic brain survives for `mock:true` only, which is the test
  // suite, never a user.
  return NextResponse.json(
    { ok: false, error: "The assistant is unreachable right now." },
    { status: 503 }
  );
}

// Tools the live agent can call. Reads (detail/list/pitch) keep it grounded;
// writes (draft/follow-up/log) are the only real side effects, and every one is
// human-led — saved for the signed-in user to review, never sent.
const AGENT_TOOLS: AgentToolDef[] = [
  {
    name: "search_market_intel",
    description:
      "Search the live Market Intelligence feed: every tracked customer and competitor company's real LinkedIn posts, news articles, AI-detected signals and AI rundown, the senior people followed at each one, and the M&A tracker. Use for ANY question about what a tracked company or person is doing, posting, or in the news for, and for mergers/acquisitions. Query with the company or person's name, or a topic.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Company name ('GSK'), person's name, topic ('layoffs', 'FDA approval'), or 'M&A deals'",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_offerings",
    description:
      "Search Freyr's own offerings catalogue AND THE FULL TEXT OF EVERY UPLOADED FILE (decks, one-pagers, demo transcripts, spreadsheets) alongside each offering's description, capabilities, availability, markets, customer types and contacts. Use for ANY question about what Freyr sells, what a document says, or the materials behind an offering. Search more than once with different wording if the first search misses.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What to look up, e.g. 'labelling artwork Japan' or 'deck for Freya.Submit'",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_account_detail",
    description:
      "Full detail on ONE account: health score, every deal, all contacts (name, title, email), and recent interaction history. Use for any specific or in-depth question about a named account.",
    input_schema: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "Company name; partial is fine (e.g. 'bionex').",
        },
      },
      required: ["account"],
    },
  },
  {
    name: "list_accounts",
    description:
      "List accounts matching a filter, with key stats. Use for portfolio-level questions.",
    input_schema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["at_risk", "cooling", "biggest", "all"],
          description:
            "at_risk = unhealthy; cooling = open deal gone quiet; biggest = by open value; all = everything.",
        },
      },
      required: ["filter"],
    },
  },
  {
    name: "save_draft",
    description:
      "Save an outreach draft onto an account's timeline for the signed-in user to review and send. NEVER sends. Provide the full draft body including a 'Subject:' line.",
    input_schema: {
      type: "object",
      properties: {
        account: { type: "string" },
        body: { type: "string", description: "Full draft incl. 'Subject:' line." },
      },
      required: ["account", "body"],
    },
  },
  {
    name: "set_followup",
    description: "Set a follow-up reminder on an account.",
    input_schema: {
      type: "object",
      properties: {
        account: { type: "string" },
        when: {
          type: "string",
          description:
            "Natural language: 'next week', 'in 3 days', 'Friday', 'June 30'.",
        },
      },
      required: ["account", "when"],
    },
  },
  {
    name: "log_touch",
    description:
      "Log a call/meeting/email the rep ALREADY had with an account (a past touch). Do NOT use for future intentions.",
    input_schema: {
      type: "object",
      properties: {
        account: { type: "string" },
        notes: { type: "string" },
        outcome: {
          type: "string",
          enum: ["interested", "meeting_booked", "in_progress"],
        },
      },
      required: ["account", "notes"],
    },
  },
  {
    name: "show_pitch",
    description:
      "Surface the pitch already prepared and stored for an account (subject + email body). Use when asked to show/pull up/review a pitch. Present the returned pitch to the rep verbatim: don't paraphrase it.",
    input_schema: {
      type: "object",
      properties: { account: { type: "string" } },
      required: ["account"],
    },
  },
];

// Deep-link the first mention of each account in free-form (Claude) text, longest
// names first, unwrapping any surrounding ** so the link renders cleanly. The
// (?<!\[) guard avoids relinking text that's already inside a markdown link.
function linkifyAccounts(
  text: string,
  customers: { id: string; company_name: string }[]
): string {
  let out = text;
  const sorted = [...customers].sort(
    (a, b) => b.company_name.length - a.company_name.length
  );
  for (const c of sorted) {
    const esc = c.company_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<!\\[)(\\*\\*)?${esc}(\\*\\*)?`);
    out = out.replace(re, `[${c.company_name}](/customers/${c.id})`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Execute a real action and return a truthful confirmation.
// ---------------------------------------------------------------------------
async function executeAction(
  db: Db,
  action: Exclude<ChatAction, { type: "show_pitch" }>,
  contacts: Contact[],
  history: ChatTurn[],
  actor: Pick<VerifiedWorkflowActor, "userId" | "name">
): Promise<{ reply: string; suggestions: string[] }> {
  const contact = contacts.find((c) => c.customer_id === action.customerId);
  const contactId = contact?.id || "";

  if (action.type === "save_draft") {
    const draft = action.body || lastDraftFromHistory(history) || "Draft outreach.";
    const interaction = await db.interactions.create({
      customer_id: action.customerId,
      contact_id: contactId,
      pitch_session_id: null,
      outcome: "in_progress",
      notes: `✍️ Draft outreach (NOT sent: saved for your review):\n\n${draft}`,
      follow_up_date: null,
      logged_by: "Freyr Agent",
    });
    await db.agentRuns.create({
      kind: "act",
      created_by_user_id: actor.userId,
      created_by: actor.name,
      title: `Saved a draft for ${action.company}`,
      customer_id: action.customerId,
      company: action.company,
      outcome: "handled",
      summary: `Wrote outreach and saved it to ${action.company}'s timeline for your review. Nothing was sent.`,
      steps: [
        { label: "Wrote the draft", status: "done" },
        { label: `Saved it to ${action.company}'s timeline`, status: "done" },
        { label: "Left it for you to review and send", status: "gated" },
      ],
      interaction_ids: [interaction.id],
    });
    return {
      reply: `Done. I saved the draft to ${action.company}'s timeline. It's marked as a draft for you to review and send; I didn't send anything. Want me to set a follow-up reminder too?\n\n[View it on ${action.company} →](/customers/${action.customerId})`,
      suggestions: [
        `Set a follow-up with ${action.company} next week`,
        `Tell me about ${action.company}`,
        "What should I focus on today?",
      ],
    };
  }

  if (action.type === "set_followup") {
    const interaction = await db.interactions.create({
      customer_id: action.customerId,
      contact_id: contactId,
      pitch_session_id: null,
      outcome: "in_progress",
      notes: `Follow-up reminder set by the agent (${action.label}).`,
      follow_up_date: action.when,
      logged_by: "Freyr Agent",
    });
    await db.agentRuns.create({
      kind: "act",
      created_by_user_id: actor.userId,
      created_by: actor.name,
      title: `Set a follow-up with ${action.company}`,
      customer_id: action.customerId,
      company: action.company,
      outcome: "handled",
      summary: `Scheduled a follow-up with ${action.company} for ${action.label}.`,
      steps: [
        { label: `Scheduled the follow-up (${action.label})`, status: "done" },
        { label: `Added it to ${action.company}'s timeline`, status: "done" },
      ],
      interaction_ids: [interaction.id],
    });
    return {
      reply: `Set. I'll keep ${action.company} on your radar for ${prettyWhen(action.when)} (${action.label}). It's on the account timeline and in your to-dos. Want me to draft what you'll send then?\n\n[View it on ${action.company} →](/customers/${action.customerId})`,
      suggestions: [
        `Draft an email to ${action.company}`,
        "Who needs a follow-up?",
        "What should I focus on today?",
      ],
    };
  }

  // log_touch
  const interaction = await db.interactions.create({
    customer_id: action.customerId,
    contact_id: contactId,
    pitch_session_id: null,
    outcome: action.outcome,
    notes: action.notes,
    follow_up_date: null,
    logged_by: actor.name,
  });
  await db.agentRuns.create({
    kind: "act",
    created_by_user_id: actor.userId,
    created_by: actor.name,
    title: `Logged a touch on ${action.company}`,
    customer_id: action.customerId,
    company: action.company,
    outcome: "handled",
    summary: `Logged your note on ${action.company}.`,
    steps: [{ label: "Saved your note to the timeline", status: "done" }],
    interaction_ids: [interaction.id],
  });
  return {
    reply: `Logged it on ${action.company}'s timeline. Want me to set a follow-up so it doesn't slip?\n\n[View it on ${action.company} →](/customers/${action.customerId})`,
    suggestions: [
      `Set a follow-up with ${action.company} next week`,
      `Tell me about ${action.company}`,
      "What should I focus on today?",
    ],
  };
}

// Read-only: surface the account's real, already-prepared pitch.
function showPitch(
  action: { customerId: string; company: string },
  sessions: PitchSession[]
): { reply: string; suggestions: string[] } {
  const session = sessions.find((s) => s.customer_id === action.customerId);
  if (!session) {
    return {
      reply: `There's no pitch prepared for ${action.company} yet: want me to draft one now?`,
      suggestions: [
        `Draft an email to ${action.company}`,
        `Tell me about ${action.company}`,
        "What should I focus on today?",
      ],
    };
  }
  let email: { subject_lines?: string[]; body?: string } = {};
  try {
    email =
      typeof session.pitch_email === "string"
        ? JSON.parse(session.pitch_email)
        : ((session.pitch_email as any) || {});
  } catch {}
  const subject = email.subject_lines?.[0] || "Introducing Freyr";
  const body = (email.body || "").trim() || "Pitch content is being prepared.";
  return {
    reply:
      `Here's the pitch queued for ${action.company}: this is what's waiting for your approval:\n\n` +
      `**Subject: ${subject}**\n\n${body}\n\n` +
      `There's also a 5-minute script and a cold-call script saved on the account. Want me to tighten this, change the tone, or set a follow-up? I won't send anything without your OK.`,
    suggestions: [
      "Make it shorter",
      `Set a follow-up with ${action.company} next week`,
      "What should I focus on today?",
    ],
  };
}

function lastDraftFromHistory(history: ChatTurn[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== "agent") continue;
    const idx = history[i].text.search(/subject:/i);
    if (idx !== -1)
      return history[i].text
        .slice(idx)
        .replace(/\n+Want me to[\s\S]*$/i, "")
        .trim();
  }
  return null;
}

function prettyWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "soon";
  }
}

// A compact, grounded snapshot of the pipeline for Claude to reason over.
function buildFacts(
  ctx: ChatContext,
  deals: ReturnType<typeof buildDeals>,
  needsApproval: number,
  runs: ChatContext["runs"]
): string {
  const open = deals.filter((d) => d.stage !== "Closed Lost");
  const openValue = open.reduce((s, d) => s + d.value, 0);
  const weighted = Math.round(openValue * 0.45);
  const cooling = open.filter((d) => d.staleDays > ROTTING_DAYS);
  const atRisk = ctx.customers.filter((c) => {
    const ints = ctx.interactions.filter((i) => i.customer_id === c.id);
    const cDeals = deals.filter((d) => d.customerId === c.id);
    const contactCount = ctx.contacts.filter((x) => x.customer_id === c.id).length;
    return accountHealth({ interactions: ints, deals: cDeals, contactCount }).band === "at_risk";
  });
  const top = [...open].sort((a, b) => b.value - a.value).slice(0, 5);
  const recent = runs.filter((r) => !r.reverted).slice(0, 5);
  const now = Date.now();
  const pending = ctx.topActions.filter((a) => a.kind === "approve" || a.kind === "send");

  // Per-account roster so the agent can answer specifics (contact, stage, last
  // touch, health) for ANY account instead of saying it doesn't have the data.
  const dealByCust: Record<string, (typeof deals)[number]> = {};
  for (const d of deals) if (!dealByCust[d.customerId]) dealByCust[d.customerId] = d;
  const roster = ctx.customers.map((c) => {
    const d = dealByCust[c.id];
    const contact = ctx.contacts.find((x) => x.customer_id === c.id);
    const ints = ctx.interactions
      .filter((i) => i.customer_id === c.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const lastDays = ints[0]
      ? `${Math.max(0, Math.floor((now - new Date(ints[0].created_at).getTime()) / 86400000))}d ago`
      : "no activity yet";
    const health = accountHealth({
      interactions: ints,
      deals: deals.filter((x) => x.customerId === c.id),
      contactCount: ctx.contacts.filter((x) => x.customer_id === c.id).length,
    });
    return (
      `- ${c.company_name} (${c.industry}, ${c.geography}). ` +
      `${d ? `${d.stage}, ${formatMoney(d.value)}` : "no open deal"}; ` +
      `contact ${contact ? `${contact.full_name}, ${contact.job_title}${contact.email ? ` <${contact.email}>` : ""}` : "none mapped"}; ` +
      `health ${health.label}; last touch ${lastDays}`
    );
  });

  return [
    `PIPELINE: ${open.length} open deals worth ${formatMoney(openValue)} (≈${formatMoney(weighted)} weighted by stage).`,
    `PENDING APPROVALS (${pending.length}): ${pending.map((a) => a.title).join("; ") || "none"}.`,
    `TO-DO / FOCUS ACTIONS: ${ctx.topActions.slice(0, 10).map((a) => a.title).join("; ") || "none"}.`,
    `COOLING DEALS (${cooling.length}): ${cooling.slice(0, 6).map((d) => `${d.company} ${formatMoney(d.value)} quiet ${d.staleDays}d`).join("; ") || "none"}.`,
    `AT-RISK ACCOUNTS (${atRisk.length}): ${atRisk.slice(0, 6).map((c) => c.company_name).join("; ") || "none"}.`,
    `BIGGEST OPEN DEALS: ${top.map((d) => `${d.company} ${formatMoney(d.value)} (${d.stage})`).join("; ") || "none"}.`,
    `RECENT AGENT ACTIONS: ${recent.map((r) => r.title).join("; ") || "none"}.`,
    `ACCOUNTS (${ctx.customers.length} total, ${ctx.contacts.length} contacts):`,
    ...roster,
    `NOTE: a per-account pitch is already prepared and stored on each account with a session: if asked to show/pull up a pitch, say you'll pull it up (the app shows the real pitch).`,
  ].join("\n");
}
