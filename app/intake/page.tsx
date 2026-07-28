"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, History, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PIPELINE_STEPS } from "@/components/sessions/ProgressTracker";
import {
  SessionForm,
  type RecentProspect,
  type SessionFormPrefill,
} from "@/components/sessions/SessionForm";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";
import { userScopedStorageKey } from "@/lib/userIdentity";

// The form itself lives in components/sessions/SessionForm.tsx — this page and
// the New Session modal on /sessions render the SAME component, so the fields
// and the validation can never drift apart. This page keeps the extras that
// only make sense with a full screen: the recent-prospect rail, the bulk
// paste-a-list intake, and the "what happens next" explainer.
type Recent = RecentProspect;

// Sample "recent prospects" shown before the rep has researched anyone. These
// are net-new companies (deliberately NOT existing CRM accounts) so clicking
// one starts a fresh session for a new prospect — and so they never contradict
// a real account's contact/website. Names, domains and emails are self-consistent.
const SEED_RECENTS: Recent[] = [
  {
    companyName: "Lumen Therapeutics",
    websiteUrl: "https://lumentherapeutics.com",
    contactName: "Dr. Aria Voss",
    contactEmail: "aria.voss@lumentherapeutics.com",
    linkedinUrl: "https://linkedin.com/in/aria-voss",
  },
  {
    companyName: "Halcyon Biopharma",
    websiteUrl: "https://halcyonbiopharma.com",
    contactName: "Marcus Lindqvist",
    contactEmail: "m.lindqvist@halcyonbiopharma.com",
    linkedinUrl: "https://linkedin.com/in/marcus-lindqvist",
  },
];

function parseBulk(text: string): Recent[] {
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const c = line.split(/[,\t]/).map((x) => x.trim());
      return {
        companyName: c[0] || "",
        contactName: c[1] || "",
        contactEmail: c[2] || "",
        linkedinUrl: c[3] || "",
        websiteUrl: "",
      };
    })
    .filter((r) => r.companyName);
}

export default function IntakePage() {
  const currentUser = useCurrentUser();
  const recentProspectsKey = userScopedStorageKey(
    "freyr.recentProspects",
    currentUser.id
  );
  const bulkQueueKey = userScopedStorageKey("freyr.bulkQueue", currentUser.id);
  const { toast } = useToast();
  // Clicking a recent prospect pushes its details into the mounted form.
  const [prefill, setPrefill] = useState<SessionFormPrefill | null>(null);

  // recent prospects (#71)
  const [recents, setRecents] = useState<Recent[]>([]);
  useEffect(() => {
    setRecents([]);
    let active = true;
    fetch("/api/settings/data-mode")
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        if (data.mode !== "mock") { setRecents([]); return; }
        try {
          const raw = localStorage.getItem(recentProspectsKey);
          setRecents(raw ? JSON.parse(raw) : SEED_RECENTS);
        } catch { setRecents(SEED_RECENTS); }
      })
      .catch(() => setRecents([]));
    return () => { active = false; };
  }, [recentProspectsKey]);

  // bulk intake (#73)
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const parsed = useMemo(() => parseBulk(bulkText), [bulkText]);

  useEffect(() => {
    setShowBulk(false);
    setBulkText("");
  }, [currentUser.id]);

  function loadRecent(r: Recent) {
    setPrefill({ values: r, token: Date.now() });
    toast(`Loaded ${r.companyName}`);
  }

  function queueBulk() {
    const n = parsed.length;
    try {
      const raw = localStorage.getItem(bulkQueueKey);
      const prev = raw ? JSON.parse(raw) : [];
      localStorage.setItem(
        bulkQueueKey,
        JSON.stringify([...parsed, ...prev].slice(0, 100))
      );
    } catch {}
    toast(`Queued ${n} prospect${n === 1 ? "" : "s"} for research`);
    setBulkText("");
    setShowBulk(false);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 max-w-[1000px]">
      <div>
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="New Sales Session"
            subtitle="Enter customer and contact details to generate your pitch."
          />
          <button
            onClick={() => setShowBulk(true)}
            className="mt-1 flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors shrink-0"
          >
            <ClipboardList size={15} strokeWidth={1.7} />
            Paste a list
          </button>
        </div>

        <Card>
          <SessionForm
            prefill={prefill}
            prefillFromUrl
            recents={recents}
          />
        </Card>
      </div>

      <aside className="hidden lg:block space-y-4">
        {recents.length > 0 && (
          <Card>
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3 flex items-center gap-2">
              <History size={14} strokeWidth={1.7} /> Recent prospects
            </h3>
            <div className="space-y-1.5">
              {recents.map((r, i) => (
                <button
                  key={`${r.companyName}-${i}`}
                  onClick={() => loadRecent(r)}
                  className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg hover:bg-surface transition-colors group"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-text-primary truncate">
                      {r.companyName}
                    </span>
                    <span className="block text-[12px] text-text-secondary truncate">
                      {r.contactName}
                    </span>
                  </span>
                  <ArrowRight
                    size={14}
                    strokeWidth={1.6}
                    className="text-text-tertiary group-hover:text-blue-primary shrink-0"
                  />
                </button>
              ))}
            </div>
          </Card>
        )}

        <Card className="sticky top-4">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-4">
            What happens next
          </h3>
          <ol className="space-y-3">
            {PIPELINE_STEPS.map((step, i) => (
              <li key={step.key} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-light text-blue-primary flex items-center justify-center text-[12px] font-semibold tnum shrink-0">
                  {i + 1}
                </span>
                <span className="text-[13px] text-text-secondary">
                  {step.label}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-[12px] text-text-tertiary mt-5 pt-4 border-t border-border-light leading-relaxed">
            Takes ~30 seconds. We research the company and contact, match Freyr&apos;s
            services, and draft three ready-to-send pitch formats.
          </p>
        </Card>
      </aside>

      {/* Bulk intake (#73) */}
      <Modal open={showBulk} onClose={() => setShowBulk(false)} title="Bulk add prospects">
        <p className="text-[13px] text-text-secondary mb-3">
          One prospect per line:{" "}
          <span className="text-text-primary font-medium">
            Company, Contact, Email, LinkedIn
          </span>
          . We&apos;ll research each one.
        </p>
        <Textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder={"Acme Biotech, Jane Doe, jane@acme.com, linkedin.com/in/jane\nZephyr Labs, Sam Lee, sam@zephyr.com"}
          className="min-h-[160px] font-mono text-[13px]"
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-[13px] text-text-secondary tnum">
            {parsed.length} prospect{parsed.length === 1 ? "" : "s"} detected
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowBulk(false)}>
              Cancel
            </Button>
            <Button onClick={queueBulk} disabled={parsed.length === 0}>
              Add {parsed.length} to queue
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
