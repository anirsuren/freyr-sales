"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";

/**
 * "Track a company" — the one flow that already works for real on this page.
 * The fields mirror what the live feeds will actually need (Anir, Aug 11:
 * "whatever they need to add should be there"): the LinkedIn page and people
 * to follow for posts, keywords for the news scrape, competitors for signals.
 */

const FIELD =
  "w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] text-text-primary outline-none transition-colors focus:border-blue-primary";
const LABEL = "mb-1 block text-[12px] font-semibold text-text-primary";
const HINT = "mt-1 text-[11px] leading-snug text-text-tertiary";

type PersonRow = { name: string; role: string; linkedinUrl: string };

const EMPTY_PERSON: PersonRow = { name: "", role: "", linkedinUrl: "" };

export function TrackCompanyButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [hq, setHq] = useState("");
  const [website, setWebsite] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [keywords, setKeywords] = useState("");
  const [note, setNote] = useState("");
  const [people, setPeople] = useState<PersonRow[]>([{ ...EMPTY_PERSON }]);

  function reset() {
    setName("");
    setIndustry("");
    setHq("");
    setWebsite("");
    setLinkedinUrl("");
    setCompetitors("");
    setKeywords("");
    setNote("");
    setPeople([{ ...EMPTY_PERSON }]);
    setError("");
  }

  function setPerson(index: number, patch: Partial<PersonRow>) {
    setPeople((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  async function save() {
    if (!name.trim()) {
      setError("The company needs a name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/market-intel/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "company",
          name,
          industry,
          hq,
          website,
          linkedinUrl,
          competitors,
          keywords,
          note,
          people: people.filter((p) => p.name.trim()),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      toast(`Now tracking ${data.company?.name ?? name.trim()}.`);
      setOpen(false);
      reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="!px-4 !py-2 text-[13px]"
      >
        <Plus size={15} strokeWidth={2.4} /> Track a company
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Track a company"
        size="wide"
      >
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
              <Building2 size={13} strokeWidth={2.2} /> The company
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={LABEL} htmlFor="mi-company-name">
                  Company name
                </label>
                <input
                  id="mi-company-name"
                  className={FIELD}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Pfizer"
                  autoFocus
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="mi-company-industry">
                  Industry
                </label>
                <input
                  id="mi-company-industry"
                  className={FIELD}
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="Global biopharma"
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="mi-company-hq">
                  Headquarters
                </label>
                <input
                  id="mi-company-hq"
                  className={FIELD}
                  value={hq}
                  onChange={(e) => setHq(e.target.value)}
                  placeholder="New York, United States"
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="mi-company-site">
                  Website
                </label>
                <input
                  id="mi-company-site"
                  className={FIELD}
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="pfizer.com"
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="mi-company-li">
                  LinkedIn company page
                </label>
                <input
                  id="mi-company-li"
                  className={FIELD}
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="linkedin.com/company/pfizer"
                />
                <p className={HINT}>Company posts are collected from here.</p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
              What to watch for
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="mi-company-competitors">
                  Competitors to flag
                </label>
                <input
                  id="mi-company-competitors"
                  className={FIELD}
                  value={competitors}
                  onChange={(e) => setCompetitors(e.target.value)}
                  placeholder="Parexel, IQVIA, Certara"
                />
                <p className={HINT}>
                  Separate with commas. Mentions become competitive signals.
                </p>
              </div>
              <div>
                <label className={LABEL} htmlFor="mi-company-keywords">
                  News search terms
                </label>
                <input
                  id="mi-company-keywords"
                  className={FIELD}
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder={
                    name.trim()
                      ? `${name.trim()}, ${name.trim()} regulatory`
                      : "Company name, regulatory, submissions"
                  }
                />
                <p className={HINT}>
                  Separate with commas. The company name is always included.
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL} htmlFor="mi-company-note">
                  Why this company matters to us
                </label>
                <textarea
                  id="mi-company-note"
                  className={`${FIELD} resize-none`}
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Active Freya.Register conversation. Watch for regulatory platform decisions."
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
              <LinkedInIcon size={12} /> People to follow
            </h3>
            <div className="space-y-2">
              {people.map((person, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-[1.1fr_1fr_1.3fr_auto]"
                >
                  <input
                    className={FIELD}
                    value={person.name}
                    onChange={(e) => setPerson(index, { name: e.target.value })}
                    placeholder="Full name"
                    aria-label={`Person ${index + 1} name`}
                  />
                  <input
                    className={FIELD}
                    value={person.role}
                    onChange={(e) => setPerson(index, { role: e.target.value })}
                    placeholder="Job title"
                    aria-label={`Person ${index + 1} job title`}
                  />
                  <input
                    className={FIELD}
                    value={person.linkedinUrl}
                    onChange={(e) =>
                      setPerson(index, { linkedinUrl: e.target.value })
                    }
                    placeholder="linkedin.com/in/their-name"
                    aria-label={`Person ${index + 1} LinkedIn profile`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPeople((rows) =>
                        rows.length === 1
                          ? [{ ...EMPTY_PERSON }]
                          : rows.filter((_, i) => i !== index)
                      )
                    }
                    className="flex h-9 w-9 cursor-pointer items-center justify-center self-center rounded-lg border border-border-light text-text-tertiary transition-colors hover:border-[#DC2626] hover:text-[#DC2626]"
                    aria-label={`Remove person ${index + 1}`}
                    title="Remove"
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPeople((rows) => [...rows, { ...EMPTY_PERSON }])}
              className="mt-2 flex cursor-pointer items-center gap-1 text-[12.5px] font-semibold text-blue-primary hover:underline"
            >
              <Plus size={13} strokeWidth={2.4} /> Add another person
            </button>
            <p className={HINT}>
              Senior people post the useful signals. You can add more any time
              from the company page.
            </p>
          </section>

          {error && (
            <p className="text-[12.5px] font-medium text-[#DC2626]">{error}</p>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border-light pt-4">
            <p className="text-[11.5px] leading-snug text-text-tertiary">
              Tracking starts on the next refresh. Only the name is required.
            </p>
            <Button onClick={save} loading={busy} className="!px-5 !py-2 text-[13px]">
              Start tracking
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
