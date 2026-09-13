"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { TrackedCompany } from "@/lib/marketIntelTracking";

function signature(companies: Pick<TrackedCompany, "id" | "onboarding">[]) {
  return companies
    .map((company) => `${company.id}:${company.onboarding?.status ?? "ready"}:${company.onboarding?.stage ?? ""}`)
    .sort()
    .join("|");
}

/** Poll only the tiny collection-status payload. A full RSC refresh is made
 * when a phase actually changes, instead of every five seconds while a long
 * provider request is running. */
export function useCollectionStatusRefresh(companies: Pick<TrackedCompany, "id" | "onboarding">[]) {
  const router = useRouter();
  const ids = companies.filter((company) => company.onboarding && company.onboarding.status !== "failed").map((company) => company.id);
  const propSignature = signature(companies);
  const latest = useRef(propSignature);
  latest.current = propSignature;

  useEffect(() => {
    if (!ids.length) return;
    let stopped = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const params = new URLSearchParams({ statusIds: ids.join(",") });
        const response = await fetch(`/api/market-intel/tracking?${params}`, { cache: "no-store" });
        const data = await response.json();
        const remote = signature(Array.isArray(data.companies) ? data.companies : []);
        if (response.ok && remote !== latest.current) {
          latest.current = remote;
          router.refresh();
        }
      } catch {
        // The next poll retries; collection continues on the server.
      } finally {
        if (!stopped) timer = window.setTimeout(poll, 5_000);
      }
    };
    timer = window.setTimeout(poll, 5_000);
    return () => { stopped = true; if (timer) window.clearTimeout(timer); };
  }, [ids.join(","), router]);
}
