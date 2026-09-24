"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function LeadContactRedirect({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const leadsResponse = await fetch("/api/leads");
        const leadsData = await leadsResponse.json();
        if (!leadsResponse.ok) throw new Error(leadsData.error || "Could not open this lead.");
        const lead = leadsData.state?.leads?.find((item: { id: string }) => item.id === leadId);
        if (!lead) throw new Error("This lead no longer exists.");
        if (lead.contactId) {
          if (active) router.replace(`/contacts/${encodeURIComponent(lead.contactId)}`);
          return;
        }
        if (!lead.company) throw new Error("Add a company to this lead before opening a contact record.");
        const accountResponse = await fetch("/api/companies/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: lead.company }),
        });
        const accountData = await accountResponse.json();
        if (!accountResponse.ok) throw new Error(accountData.error || "Could not link this contact.");
        const linkedResponse = await fetch("/api/leads", { cache: "no-store" });
        const linkedData = await linkedResponse.json();
        const linked = linkedData.state?.leads?.find((item: { id: string }) => item.id === leadId);
        if (!linkedResponse.ok || !linked?.contactId) throw new Error("Could not open this contact record.");
        if (active) router.replace(`/contacts/${encodeURIComponent(linked.contactId)}`);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not open this contact record.");
      }
    })();
    return () => { active = false; };
  }, [leadId, router]);
  return <main className="mx-auto flex min-h-[40vh] max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
    <h1 className="text-xl font-semibold text-text-primary">Opening contact</h1>
    <p className="text-sm text-text-secondary" role="status">{error || "Linking this lead to its contact record…"}</p>
    {error && <button type="button" onClick={() => window.location.reload()} className="text-sm font-semibold text-blue-primary">Try again</button>}
  </main>;
}
