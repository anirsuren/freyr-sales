"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

/**
 * Follow one more person at a tracked company, or stop following one the team
 * added. Lives beside the "People tracked" rail on every company briefing.
 */

const FIELD =
  "w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] text-text-primary outline-none transition-colors focus:border-blue-primary";
const LABEL = "mb-1 block text-[12px] font-semibold text-text-primary";

export function TrackPersonButton({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");

  async function save() {
    if (!name.trim()) {
      setError("The person needs a name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/market-intel/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "person", companyId, name, role, linkedinUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      toast(`Now following ${name.trim()} at ${companyName}.`);
      setOpen(false);
      setName("");
      setRole("");
      setLinkedinUrl("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-auto flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[rgba(0,113,227,0.08)] text-blue-primary transition-colors hover:bg-blue-primary hover:text-white"
        aria-label={`Follow someone at ${companyName}`}
        title="Follow someone here"
      >
        <Plus size={14} strokeWidth={2.4} />
      </button>

      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={`Follow someone at ${companyName}`}
      >
        <div className="space-y-3">
          <div>
            <label className={LABEL} htmlFor="mi-person-name">
              Full name
            </label>
            <input
              id="mi-person-name"
              className={FIELD}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Their full name"
              autoFocus
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="mi-person-role">
              Job title
            </label>
            <input
              id="mi-person-role"
              className={FIELD}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="VP, Regulatory Affairs"
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="mi-person-li">
              LinkedIn profile
            </label>
            <input
              id="mi-person-li"
              className={FIELD}
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="linkedin.com/in/their-name"
            />
            <p className="mt-1 text-[11px] leading-snug text-text-tertiary">
              Their public posts are collected from here, starting with the
              next refresh.
            </p>
          </div>
          {error && (
            <p className="text-[12.5px] font-medium text-[#DC2626]">{error}</p>
          )}
          <div className="flex justify-end pt-1">
            <Button onClick={save} loading={busy} className="!px-5 !py-2 text-[13px]">
              Follow their posts
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** The small hover X on a person the team added. Sample people have no X. */
export function UntrackPersonButton({
  personId,
  personName,
}: {
  personId: string;
  personName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/market-intel/tracking", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "person", id: personId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Could not save.");
      }
      toast(`Stopped following ${personName}.`);
      router.refresh();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not save.", "error");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-tertiary opacity-0 transition-all hover:bg-[rgba(220,38,38,0.10)] hover:text-[#DC2626] group-hover/person:opacity-100 disabled:opacity-40"
      aria-label={`Stop following ${personName}`}
      title="Stop following"
    >
      <X size={12} strokeWidth={2.4} />
    </button>
  );
}
