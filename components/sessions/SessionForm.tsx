"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Input, Field } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";
import { userScopedStorageKey } from "@/lib/userIdentity";

// THE one New-Sales-Session form. It is rendered in exactly two places — the
// /intake page and the New Session modal on /sessions — so the fields, the
// auto-detection and the required-field rules can never drift apart between
// them (Suren, Jul 27: "if I'm on any page and I press the button, it should
// just be a pop-up… then I can enter all the information, and then boom").
//
// The only thing the two callers decide is what happens once the form is
// valid: the page keeps today's behaviour (hand the payload to the full-screen
// loading route) and the modal runs the same pipeline in place and reports
// back with a toast.

export type RecentProspect = {
  companyName: string;
  websiteUrl: string;
  contactName: string;
  contactEmail: string;
  linkedinUrl: string;
};

export type SessionFormValues = RecentProspect & {
  additionalContext: string;
};

export const EMPTY_SESSION_FORM: SessionFormValues = {
  companyName: "",
  websiteUrl: "",
  contactName: "",
  contactEmail: "",
  linkedinUrl: "",
  additionalContext: "",
};

/** Values pushed into a mounted form (a recent prospect, or a failed run's
 *  answers coming back so nobody re-types them). Bump `token` to re-apply. */
export type SessionFormPrefill = {
  values: Partial<SessionFormValues>;
  token: number;
};

const RECENT_PROSPECTS_KEY = "freyr.recentProspects";
const INTAKE_PAYLOAD_KEY = "freyr_intake_payload";

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

export function SessionForm({
  prefill,
  prefillFromUrl = false,
  recents,
  autoFocus = false,
  onSubmit,
  onCancel,
  error,
  submitLabel = "Generate Pitch",
}: {
  prefill?: SessionFormPrefill | null;
  /** Read ?company=&contact=&website= off the URL (the /intake deep link). */
  prefillFromUrl?: boolean;
  /** Current recent-prospect list, so saving one can dedupe against it. */
  recents?: RecentProspect[];
  autoFocus?: boolean;
  /** Given a valid submission, take it from here. Omitted → the page path:
   *  stash the payload and hand off to the full-screen loading route. */
  onSubmit?: (values: SessionFormValues) => void;
  onCancel?: () => void;
  /** A failure from whoever ran the pipeline, shown above the actions. */
  error?: string;
  submitLabel?: string;
}) {
  const currentUser = useCurrentUser();
  const router = useRouter();
  const recentProspectsKey = userScopedStorageKey(
    RECENT_PROSPECTS_KEY,
    currentUser.id
  );
  const intakePayloadKey = userScopedStorageKey(
    INTAKE_PAYLOAD_KEY,
    currentUser.id
  );

  const [form, setForm] = useState<SessionFormValues>(() => ({
    ...EMPTY_SESSION_FORM,
    ...(prefill?.values || {}),
  }));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // auto-detect (#69)
  const auto = useRef<{ companyName?: boolean; contactName?: boolean }>({});
  const [autoFlags, setAutoFlags] = useState<{
    companyName?: boolean;
    contactName?: boolean;
  }>({});

  // The modal opens straight onto the first question (and a keyboard user is
  // already in the form, so the dialog never has to grab focus itself).
  useEffect(() => {
    if (autoFocus) firstFieldRef.current?.focus();
  }, [autoFocus]);

  // Prefill from the URL when launched from an existing account ("New session"
  // on the customer page deep-links here with the company + primary contact), so
  // a rep can start a pitch in one click instead of re-typing it.
  const seedRef = useRef(prefill?.values);
  seedRef.current = prefill?.values;
  useEffect(() => {
    setForm({ ...EMPTY_SESSION_FORM, ...(seedRef.current || {}) });
    setTouched({});
    setSubmitted(false);
    auto.current = {};
    setAutoFlags({});
    if (!prefillFromUrl) return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const company = sp.get("company");
      const contact = sp.get("contact");
      const website = sp.get("website");
      if (company || contact || website) {
        setForm((f) => ({
          ...f,
          companyName: company || f.companyName,
          contactName: contact || f.contactName,
          websiteUrl: website || f.websiteUrl,
        }));
      }
    } catch {}
  }, [currentUser.id, prefillFromUrl]);

  // Values pushed in after mount (recent prospect clicked, or a failed run
  // handing the answers back).
  const appliedToken = useRef<number | null>(null);
  useEffect(() => {
    const token = prefill?.token;
    if (token === undefined || token === appliedToken.current) return;
    appliedToken.current = token;
    auto.current = {};
    setAutoFlags({});
    setForm((f) => ({ ...f, ...(prefill?.values || {}) }));
  }, [prefill]);

  function update(key: keyof SessionFormValues, value: string) {
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

  // remember this prospect for next time
  function remember() {
    try {
      const entry: RecentProspect = {
        companyName: form.companyName,
        websiteUrl: form.websiteUrl,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        linkedinUrl: form.linkedinUrl,
      };
      const base =
        recents ??
        (JSON.parse(
          localStorage.getItem(recentProspectsKey) || "[]"
        ) as RecentProspect[]);
      const deduped = [
        entry,
        ...base.filter(
          (r) => r.companyName.toLowerCase() !== entry.companyName.toLowerCase()
        ),
      ].slice(0, 5);
      localStorage.setItem(recentProspectsKey, JSON.stringify(deduped));
    } catch {}
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!isValid) return;
    remember();
    if (onSubmit) {
      onSubmit(form);
      return;
    }
    try {
      sessionStorage.setItem(intakePayloadKey, JSON.stringify(form));
    } catch {}
    router.push("/sessions/new/loading");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Field label="Company Website" hint="Paste a URL — we'll detect the company">
        <Input
          ref={firstFieldRef}
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

      {error && (
        <p className="text-[13px] text-error" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!isValid}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
