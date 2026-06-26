"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ClipboardList, History, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input, Field } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PIPELINE_STEPS } from "@/components/sessions/ProgressTracker";

type Recent = {
  companyName: string;
  websiteUrl: string;
  contactName: string;
  contactEmail: string;
  linkedinUrl: string;
};

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

const CRED_STOP = new Set([
  "md", "phd", "mba", "jr", "sr", "ii", "iii", "cpa", "pe", "rn", "do", "msc", "bsc",
]);

function titleCase(s: string): string {
  return s
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

// Derive a company name from a website URL ("acme-bio.com" → "Acme Bio").
function domainToCompany(url: string): string {
  if (!url.trim()) return "";
  try {
    const host = new URL(
      /^https?:\/\//i.test(url) ? url : `https://${url}`
    ).hostname;
    const core = host.replace(/^www\./i, "").split(".")[0];
    return titleCase(core);
  } catch {
    return "";
  }
}

// Derive a person's name from a LinkedIn profile URL slug.
function slugToName(url: string): string {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!m) return "";
  const parts = decodeURIComponent(m[1])
    .split(/[-_]/)
    .filter(Boolean)
    .filter((p) => !/\d/.test(p) && !CRED_STOP.has(p.toLowerCase()));
  return parts
    .slice(0, 3)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

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
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState({
    companyName: "",
    websiteUrl: "",
    contactName: "",
    contactEmail: "",
    linkedinUrl: "",
    additionalContext: "",
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  // auto-detect (#69)
  const auto = useRef<{ companyName?: boolean; contactName?: boolean }>({});
  const [autoFlags, setAutoFlags] = useState<{
    companyName?: boolean;
    contactName?: boolean;
  }>({});

  // recent prospects (#71)
  const [recents, setRecents] = useState<Recent[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("freyr.recentProspects");
      setRecents(raw ? JSON.parse(raw) : SEED_RECENTS);
    } catch {
      setRecents(SEED_RECENTS);
    }
  }, []);

  // bulk intake (#73)
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const parsed = useMemo(() => parseBulk(bulkText), [bulkText]);

  function update(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function blur(key: string) {
    setTouched((t) => ({ ...t, [key]: true }));
  }

  function onWebsiteChange(v: string) {
    setForm((f) => {
      const next = { ...f, websiteUrl: v };
      const cand = domainToCompany(v);
      if (cand && (!f.companyName.trim() || auto.current.companyName)) {
        next.companyName = cand;
        auto.current.companyName = true;
      }
      return next;
    });
    setAutoFlags({ ...auto.current });
  }
  function onLinkedinChange(v: string) {
    setForm((f) => {
      const next = { ...f, linkedinUrl: v };
      const cand = slugToName(v);
      if (cand && (!f.contactName.trim() || auto.current.contactName)) {
        next.contactName = cand;
        auto.current.contactName = true;
      }
      return next;
    });
    setAutoFlags({ ...auto.current });
  }
  function onCompanyChange(v: string) {
    auto.current.companyName = false;
    setAutoFlags({ ...auto.current });
    update("companyName", v);
  }
  function onContactChange(v: string) {
    auto.current.contactName = false;
    setAutoFlags({ ...auto.current });
    update("contactName", v);
  }

  function loadRecent(r: Recent) {
    auto.current = {};
    setAutoFlags({});
    setForm((f) => ({
      ...f,
      companyName: r.companyName,
      websiteUrl: r.websiteUrl,
      contactName: r.contactName,
      contactEmail: r.contactEmail,
      linkedinUrl: r.linkedinUrl,
    }));
    toast(`Loaded ${r.companyName}`);
  }

  function queueBulk() {
    const n = parsed.length;
    try {
      const raw = localStorage.getItem("freyr.bulkQueue");
      const prev = raw ? JSON.parse(raw) : [];
      localStorage.setItem(
        "freyr.bulkQueue",
        JSON.stringify([...parsed, ...prev].slice(0, 100))
      );
    } catch {}
    toast(`Queued ${n} prospect${n === 1 ? "" : "s"} for research`);
    setBulkText("");
    setShowBulk(false);
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail);
  const linkedinOk = /linkedin\.com\/in\//i.test(form.linkedinUrl);
  const errors: Record<string, string> = {
    companyName: form.companyName ? "" : "Company name is required.",
    contactName: form.contactName ? "" : "Contact name is required.",
    contactEmail: form.contactEmail
      ? emailOk
        ? ""
        : "Enter a valid email address."
      : "Contact email is required.",
    linkedinUrl: form.linkedinUrl
      ? linkedinOk
        ? ""
        : "Use a linkedin.com/in/… profile URL."
      : "LinkedIn URL is required.",
  };
  const isValid = Object.values(errors).every((e) => !e);
  const show = (k: string) => {
    if (!errors[k]) return false;
    if (touched[k] || submitted) return true;
    if (
      (k === "contactEmail" || k === "linkedinUrl") &&
      (form as Record<string, string>)[k]
    )
      return true;
    return false;
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!isValid) return;
    // remember this prospect for next time
    try {
      const entry: Recent = {
        companyName: form.companyName,
        websiteUrl: form.websiteUrl,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        linkedinUrl: form.linkedinUrl,
      };
      const deduped = [
        entry,
        ...recents.filter(
          (r) => r.companyName.toLowerCase() !== entry.companyName.toLowerCase()
        ),
      ].slice(0, 5);
      localStorage.setItem("freyr.recentProspects", JSON.stringify(deduped));
    } catch {}
    sessionStorage.setItem("freyr_intake_payload", JSON.stringify(form));
    router.push("/sessions/new/loading");
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
          <form onSubmit={submit} className="flex flex-col gap-5">
            <Field label="Company Website" hint="Paste a URL — we'll detect the company">
              <Input
                name="websiteUrl"
                placeholder="https://example.com"
                value={form.websiteUrl}
                onChange={(e) => onWebsiteChange(e.target.value)}
              />
            </Field>

            <Field label="Company Name" required>
              <Input
                name="companyName"
                placeholder="Acme Biotech"
                value={form.companyName}
                onChange={(e) => onCompanyChange(e.target.value)}
                onBlur={() => blur("companyName")}
              />
              {autoFlags.companyName && (
                <p className="text-[12px] text-blue-primary mt-1 flex items-center gap-1">
                  <Sparkles size={13} strokeWidth={1.8} />
                  Auto-detected from website — edit to override
                </p>
              )}
              {show("companyName") && (
                <p className="text-[12px] text-error mt-1">{errors.companyName}</p>
              )}
            </Field>

            <Field label="Contact LinkedIn URL" required>
              <Input
                name="linkedinUrl"
                placeholder="https://linkedin.com/in/jane"
                value={form.linkedinUrl}
                onChange={(e) => onLinkedinChange(e.target.value)}
                onBlur={() => blur("linkedinUrl")}
              />
              {show("linkedinUrl") && (
                <p className="text-[12px] text-error mt-1">{errors.linkedinUrl}</p>
              )}
            </Field>

            <Field label="Contact Full Name" required>
              <Input
                name="contactName"
                placeholder="Jane Doe"
                value={form.contactName}
                onChange={(e) => onContactChange(e.target.value)}
                onBlur={() => blur("contactName")}
              />
              {autoFlags.contactName && (
                <p className="text-[12px] text-blue-primary mt-1 flex items-center gap-1">
                  <Sparkles size={13} strokeWidth={1.8} />
                  Auto-detected from LinkedIn — edit to override
                </p>
              )}
              {show("contactName") && (
                <p className="text-[12px] text-error mt-1">{errors.contactName}</p>
              )}
            </Field>

            <Field label="Contact Email" required>
              <Input
                name="contactEmail"
                type="email"
                placeholder="jane@acme.com"
                value={form.contactEmail}
                onChange={(e) => update("contactEmail", e.target.value)}
                onBlur={() => blur("contactEmail")}
              />
              {show("contactEmail") && (
                <p className="text-[12px] text-error mt-1">{errors.contactEmail}</p>
              )}
            </Field>

            <Field label="Additional Context">
              <Textarea
                name="additionalContext"
                placeholder="Anything you already know — where you met, their timeline, priorities…"
                className="min-h-[100px]"
                value={form.additionalContext}
                onChange={(e) => update("additionalContext", e.target.value)}
              />
            </Field>

            {submitted && !isValid && (
              <p className="text-[13px] text-error">
                Please fix the highlighted fields before continuing.
              </p>
            )}

            <div>
              <Button type="submit" disabled={!isValid}>
                Generate Pitch
              </Button>
            </div>
          </form>
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
