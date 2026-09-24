"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CompanyLogo } from "@/components/ui/CompanyLogo";

export function CompanyAccountRedirect({ name }: { name: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const response = await fetch("/api/companies/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
        const data = await response.json();
        if (!response.ok || !data.id) throw new Error(data.error || "Could not open the customer account.");
        if (live) router.replace(`/customers/${encodeURIComponent(data.id)}`);
      } catch (cause) {
        if (live) setError(cause instanceof Error ? cause.message : "Could not open the customer account.");
      }
    })();
    return () => { live = false; };
  }, [name, router]);
  return <main className="mx-auto flex min-h-[40vh] max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
    <CompanyLogo name={name} className="h-14 w-14" />
    <h1 className="text-xl font-semibold text-text-primary">{name}</h1>
    <p className="text-sm text-text-secondary" role="status">{error || "Opening customer account…"}</p>
    {error && <button type="button" onClick={() => window.location.reload()} className="text-sm font-semibold text-blue-primary">Try again</button>}
  </main>;
}
