"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Followed = { kind: "component" | "offering"; id: string; name: string; href: string };

type Subscription = {
  everything: boolean;
  componentIds: string[];
  offeringIds: string[];
};

/**
 * THE ONE SWITCH FOR PEOPLE WHO WANT EVERYTHING.
 *
 * Two kinds of reader came out of the product owner's review (via Anir, Aug
 * 21): one follows the two or three components they sell and wants a mail when
 * those move, and one wants the lot. The per-component switch serves the
 * first. This serves the second, and says out loud that it is still ONE mail,
 * because "a guy who wants everything should not be spammed with updates" is
 * the fear this has to answer before anybody turns it on.
 *
 * Under it, what you currently follow — otherwise the only way to find out is
 * to walk every component page and look at its bell.
 */
export function RoadmapEmailSettings({ followable }: { followable: Followed[] }) {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/roadmap-subscriptions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data?.subscription) setSub(data.subscription);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function save(body: unknown, optimistic: (s: Subscription) => Subscription) {
    if (!sub || busy) return;
    const before = sub;
    setBusy(true);
    setSub(optimistic(sub));
    try {
      const res = await fetch("/api/roadmap-subscriptions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.subscription) setSub(data.subscription);
      else setSub(before);
    } catch {
      setSub(before);
    } finally {
      setBusy(false);
    }
  }

  if (!sub) return null;

  const following = followable.filter((f) =>
    f.kind === "component" ? sub.componentIds.includes(f.id) : sub.offeringIds.includes(f.id)
  );

  return (
    <section className="mb-5 rounded-2xl border border-border-light bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-text-primary">
            <Mail size={15} strokeWidth={2} className="text-blue-primary" />
            Roadmap changes by email
          </h2>
          <p className="mt-1 text-[12.5px] leading-snug text-text-secondary">
            Dates move and features come and go. One email covers every change
            since the last one, so following more never means hearing more
            often.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          aria-pressed={sub.everything}
          onClick={() =>
            save({ everything: !sub.everything }, (s) => ({ ...s, everything: !s.everything }))
          }
          className={cn(
            "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-semibold transition-colors disabled:opacity-60",
            sub.everything
              ? "border-blue-subtle bg-blue-light text-blue-primary"
              : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-blue-primary"
          )}
        >
          {busy && <Loader2 size={13} strokeWidth={2.4} className="animate-spin" />}
          {sub.everything ? "Emailing you about every roadmap" : "Email me about every roadmap"}
        </button>
      </div>

      <div className="mt-3 border-t border-border-light pt-3">
        {sub.everything ? (
          <p className="text-[12.5px] text-text-secondary">
            You hear about all of them. Turn this off to go back to just the
            ones you follow{following.length ? ` (${following.length})` : ""}.
          </p>
        ) : following.length === 0 ? (
          <p className="text-[12.5px] text-text-secondary">
            You are not following anything yet. Open a component and press{" "}
            <b className="font-semibold text-text-primary">Notify me</b> beside
            its versions, or turn on every roadmap above.
          </p>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
              You follow
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {following.map((f) => (
                <li key={`${f.kind}:${f.id}`}>
                  <Link
                    href={f.href}
                    className="inline-flex items-center rounded-lg border border-border-light bg-surface px-2 py-1 text-[12px] font-medium text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                  >
                    {f.name}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
