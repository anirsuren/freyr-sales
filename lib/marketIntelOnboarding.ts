import "server-only";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  companyDomain,
  findCompanyDuplicate,
  DuplicateCompanyError,
} from "./marketIntelDuplicates";
import { linkedInIdentifier } from "./marketIntelLinks";
import {
  bustMarketIntelTrackingCache,
  miSlug,
  type TrackedCompany,
} from "./marketIntelTracking";
import type { Division } from "./offeringMaterials";
const ROW = "market-intel:default";
// Renew frequently; an interrupted worker should not block recovery for 15 minutes.
const LEASE_MS = 3 * 60_000;
const HEARTBEAT_MS = 30_000;
const db = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(30_000) }) },
    },
  );
export async function editQueuedCompany(
  id: string,
  edit: (c: TrackedCompany) => TrackedCompany,
): Promise<TrackedCompany> {
  for (let i = 0; i < 6; i++) {
    const client = db();
    const { data, error } = await client
      .from("offering_catalog_state")
      .select("catalog,updated_at")
      .eq("id", ROW)
      .single();
    if (error) throw error;
    const index = data.catalog.companies.findIndex(
      (c: TrackedCompany) => c.id === id,
    );
    if (index < 0) throw new Error("Company is no longer tracked.");
    const company = edit(data.catalog.companies[index]);
    data.catalog.companies[index] = company;
    const saved = await client
      .from("offering_catalog_state")
      .update({
        catalog: data.catalog,
        updated_at: new Date(
          Math.max(Date.now(), Date.parse(data.updated_at) + 1),
        ).toISOString(),
      })
      .eq("id", ROW)
      .eq("updated_at", data.updated_at)
      .select("id");
    if (saved.error) throw saved.error;
    if (saved.data?.length) {
      bustMarketIntelTrackingCache();
      return company;
    }
  }
  throw new Error("The list changed while saving. Please retry.");
}
export async function enqueueCompany(
  input: { name?: string; website?: string; linkedinUrl?: string },
  group: "customer" | "competitor",
  meta: { divisions: Division[]; addedBy: TrackedCompany["addedBy"] },
): Promise<TrackedCompany> {
  const website = String(input.website || "").trim(),
    linkedin = String(input.linkedinUrl || "").trim();
  const domain = website ? companyDomain(website) : null,
    slug = linkedin ? linkedInIdentifier(linkedin, "company") : null;
  if (!domain && !slug)
    throw new Error("Enter an official website or LinkedIn company page.");
  if (website && (!domain || /(^|\.)linkedin\.com$/.test(domain)))
    throw new Error("Enter a valid company website.");
  if (linkedin && !slug)
    throw new Error("Enter a valid LinkedIn company page.");
  const divisions = meta.divisions.filter((d) =>
    ["MPR", "MDV", "CON"].includes(d),
  );
  if (!divisions.length) throw new Error("Pick at least one division.");
  const suppliedName = String(input.name || "")
      .trim()
      .slice(0, 120),
    name = suppliedName || domain || slug!;
  const now = new Date().toISOString();
  const company: TrackedCompany = {
    id: `${miSlug(name)}-${randomUUID().slice(0, 8)}`,
    name,
    website: domain ? `https://${domain}` : "",
    linkedinUrl: slug ? `https://www.linkedin.com/company/${slug}` : "",
    group,
    industry: "",
    hq: "",
    competitors: [],
    keywords: [],
    note: "",
    divisions,
    addedAt: now,
    addedBy: meta.addedBy,
    onboarding: {
      status: "queued",
      requestedName: suppliedName,
      attempts: 0,
      updatedAt: now,
    },
  };
  for (let i = 0; i < 6; i++) {
    const client = db();
    const { data, error } = await client
      .from("offering_catalog_state")
      .select("catalog,updated_at")
      .eq("id", ROW)
      .single();
    if (error) throw error;
    const duplicate = findCompanyDuplicate(
      data.catalog.companies,
      company.website,
      company.linkedinUrl,
    );
    if (duplicate) throw new DuplicateCompanyError(duplicate);
    data.catalog.companies.push(company);
    data.catalog.divisions = {
      ...data.catalog.divisions,
      [company.id]: divisions,
    };
    const saved = await client
      .from("offering_catalog_state")
      .update({
        catalog: data.catalog,
        updated_at: new Date(
          Math.max(Date.now(), Date.parse(data.updated_at) + 1),
        ).toISOString(),
      })
      .eq("id", ROW)
      .eq("updated_at", data.updated_at)
      .select("id");
    if (saved.error) throw saved.error;
    if (saved.data?.length) {
      bustMarketIntelTrackingCache();
      return company;
    }
  }
  throw new Error("The list changed while saving. Please retry.");
}
export async function retryCompanyOnboarding(id: string): Promise<void> {
  await editQueuedCompany(id, (c) => {
    if (c.onboarding?.status !== "failed") return c;
    return {
      ...c,
      onboarding: {
        ...c.onboarding,
        status: "queued",
        stage: undefined,
        stageStartedAt: undefined,
        error: undefined,
        attempts: 0,
        updatedAt: new Date().toISOString(),
      },
    };
  });
}
export async function runCompanyOnboarding(onlyCompanyId?: string): Promise<void> {
  const { data, error } = await db()
    .from("offering_catalog_state")
    .select("catalog")
    .eq("id", ROW)
    .single();
  if (error) throw error;
  for (const candidate of data.catalog.companies as TrackedCompany[]) {
    if (onlyCompanyId && candidate.id !== onlyCompanyId) continue;
    const job = candidate.onboarding;
    if (!job || job.status === "failed" || (job.leaseUntil || 0) > Date.now())
      continue;
    const lease = randomUUID();
    let claimed: TrackedCompany;
    try {
      claimed = await editQueuedCompany(candidate.id, (c) => {
        if (
          !c.onboarding ||
          c.onboarding.status === "failed" ||
          (c.onboarding.leaseUntil || 0) > Date.now()
        )
          throw new Error("Job already claimed");
        return {
          ...c,
          onboarding: {
            ...c.onboarding,
            status: "collecting",
            stage: undefined,
            stageStartedAt: undefined,
            lease,
            leaseUntil: Date.now() + LEASE_MS,
            attempts: c.onboarding.attempts + 1,
            updatedAt: new Date().toISOString(),
          },
        };
      });
    } catch {
      continue;
    }
    const heartbeat = setInterval(() => {
      void editQueuedCompany(claimed.id, (c) => {
        if (c.onboarding?.lease !== lease) throw new Error("Lease changed");
        return {
          ...c,
          onboarding: { ...c.onboarding, leaseUntil: Date.now() + LEASE_MS },
        };
      }).catch(() => {});
    }, HEARTBEAT_MS);
    try {
      const { addCompanyByLink } = await import("./marketIntelRefresh");
      await addCompanyByLink(
        {
          name: claimed.onboarding?.requestedName,
          website: claimed.website,
          linkedinUrl: claimed.linkedinUrl,
        },
        claimed.group || "customer",
        {
          divisions: claimed.divisions,
          addedBy: claimed.addedBy,
          queuedCompanyId: claimed.id,
          queueLease: lease,
          onProgress: async ({ stage }) => {
            await editQueuedCompany(claimed.id, c => {
              if (c.onboarding?.lease !== lease || c.onboarding.status !== "collecting") throw new Error("Collection was superseded.");
              return { ...c, onboarding: { ...c.onboarding, stage, stageStartedAt: new Date().toISOString() } };
            });
          },
        },
      );
    } catch (error) {
      await editQueuedCompany(claimed.id, (c) => {
        if (c.onboarding?.lease !== lease) throw new Error("Lease changed");
        return {
          ...c,
          onboarding: {
            ...c.onboarding,
            status: "failed",
            error:
              error instanceof Error
                ? error.message
                : "Could not collect the first updates.",
            leaseUntil: 0,
            updatedAt: new Date().toISOString(),
          },
        };
      }).catch(() => {});
    } finally {
      clearInterval(heartbeat);
    }
  }
}
export function armCompanyOnboarding(): void {
  const g = globalThis as any;
  g.__MI_ONBOARDING_RUN__ = runCompanyOnboarding;
  if (g.__MI_ONBOARDING_ARMED__) return;
  g.__MI_ONBOARDING_ARMED__ = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await g.__MI_ONBOARDING_RUN__();
    } catch (error) {
      console.error("[market-intel] onboarding worker failed", error);
    } finally {
      running = false;
    }
  };
  setInterval(tick, 60_000).unref();
  setTimeout(tick, 1000).unref();
}
