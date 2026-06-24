import { getDb } from "@/lib/db";
import { scrapeCustomerWebsite } from "@/lib/firecrawl";
import { scrapeLinkedInProfile } from "@/lib/apify";
import {
  classifyCustomer,
  classifyContact,
  runMatchingEngine,
  generatePitches,
} from "@/lib/claude";
import { notifyTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Core pipeline. Streams Server-Sent Events so the loading page can show
// real-time step progress, then emits the final session id on completion.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const {
    companyName,
    websiteUrl,
    contactName,
    contactEmail,
    linkedinUrl,
    additionalContext,
  } = body || {};

  const db = getDb();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) =>
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
        );

      try {
        // 1. Knowledge base must exist
        const kb = await db.freyrKb.get();
        if (!kb || !kb.structured_kb) {
          send({
            step: "error",
            status: "error",
            message:
              "Freyr knowledge base not found. Run the crawl in Admin first.",
          });
          controller.close();
          return;
        }

        // 2. Customer website scrape
        send({
          step: "scraping_website",
          status: "running",
          message: "Scraping customer website...",
        });
        let scrapeText = "";
        if (websiteUrl) {
          scrapeText = await scrapeCustomerWebsite(websiteUrl);
        }
        send({
          step: "scraping_website",
          status: "done",
          message: websiteUrl
            ? "Website scraped successfully"
            : "No website provided — skipped",
        });

        // 3. LinkedIn enrichment
        send({
          step: "linkedin",
          status: "running",
          message: "Fetching LinkedIn profile via Apify...",
        });
        const profile = await scrapeLinkedInProfile(linkedinUrl);
        send({
          step: "linkedin",
          status: "done",
          message: "Contact profile retrieved",
        });

        // 4. Classification (customer + contact)
        send({
          step: "analyzing",
          status: "running",
          message: "Analyzing customer and contact fit...",
        });
        const custClass = await classifyCustomer(companyName, scrapeText);
        const contactClass = await classifyContact(profile);
        send({
          step: "analyzing",
          status: "done",
          message: "Analysis complete",
        });

        // Upsert customer
        let customer = await db.customers.findByName(companyName);
        if (!customer) {
          customer = await db.customers.create({
            company_name: companyName,
            website_url: websiteUrl || null,
            raw_scrape: scrapeText || null,
            size_tier: custClass.size_tier,
            industry: custClass.industry,
            geography: custClass.geography,
            enrichment_summary: custClass.enrichment_summary,
          });
        } else {
          customer =
            (await db.customers.update(customer.id, {
              website_url: websiteUrl || customer.website_url,
              raw_scrape: scrapeText || customer.raw_scrape,
              size_tier: custClass.size_tier,
              industry: custClass.industry,
              geography: custClass.geography,
              enrichment_summary: custClass.enrichment_summary,
            })) || customer;
        }

        // Create contact
        const contact = await db.contacts.create({
          customer_id: customer.id,
          full_name: contactName || profile?.fullName || "Unknown",
          email: contactEmail || null,
          linkedin_url: linkedinUrl || null,
          phone: null,
          raw_linkedin_data: profile,
          job_title: contactClass.job_title,
          role_bucket: contactClass.role_bucket,
          career_summary: contactClass.career_summary,
          enrichment_summary: contactClass.enrichment_summary,
        });

        // 5. Matching engine
        send({
          step: "matching",
          status: "running",
          message: "Matching against Freyr knowledge base...",
        });
        const matching = await runMatchingEngine({
          freyrKb: kb.structured_kb,
          customerSummary: custClass.enrichment_summary,
          contactProfile: profile,
          additionalContext,
        });
        send({
          step: "matching",
          status: "done",
          message: "Services matched",
        });

        // 6. Pitch generation
        send({
          step: "pitches",
          status: "running",
          message: "Generating pitch materials...",
        });
        const pitches = await generatePitches({
          matchingOutput: matching,
          contactProfile: profile,
          customerSummary: custClass.enrichment_summary,
          freyrKb: kb.structured_kb,
        });
        send({
          step: "pitches",
          status: "done",
          message: "Pitch materials generated",
        });

        // 7. Persist session (pitch_email stored as JSON string per TEXT schema)
        const session = await db.pitchSessions.create({
          customer_id: customer.id,
          contact_id: contact.id,
          kb_version: kb.version,
          recommended_services: matching.recommended_services,
          pitch_email: JSON.stringify(pitches.pitch_email),
          pitch_5min_script: pitches.pitch_5min_script,
          pitch_call_script: pitches.pitch_call_script,
          additional_context: additionalContext || null,
        });

        notifyTelegram(
          `🆕 <b>New session</b>\n${customer.company_name} · ${
            contact.full_name
          }\nTop match: ${
            matching.recommended_services?.[0]?.service_name || "—"
          }`
        );

        send({
          step: "complete",
          status: "done",
          sessionId: session.id,
          message: "Complete",
        });
      } catch (e: any) {
        send({
          step: "error",
          status: "error",
          message: e?.message || "Pipeline failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
