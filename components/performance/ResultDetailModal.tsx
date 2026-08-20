"use client";

import { CircleDollarSign, Briefcase } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { EvidenceLinkRow } from "./EvidenceViewer";
import { EntryTimeline, stamp } from "./EntryCards";
import {
  ENTRY_COLOR,
  ENTRY_INK,
  entryStatus,
  entryStatusLabel,
  fmtAmount,
  type PerfActual,
  type PrimaryGoal,
} from "@/lib/performanceShared";

/**
 * ONE LOGGED RESULT, IN FULL (Anir, Aug 20, clicking a row in the goal drill:
 * "when I click on this, you think it's supposed to show me something?").
 *
 * The rail row can only carry a name, a date and two chips. Everything a
 * person actually asks next — who logged it, against which deal, what the
 * manager said when they sent it back, is there proof attached — was a page
 * away, and the row that invited the click did nothing.
 *
 * Built out of the pieces the other dialogs already use rather than new ones:
 * the app's Modal, the same EntryTimeline the Fix-it flow shows, the same
 * EvidenceLinkRow the sign-off dialog uses, the same status ink. It should be
 * impossible to tell this was written later.
 */
export function ResultDetailModal({
  entry,
  goal,
  dealName,
  dealStatus,
  open,
  onClose,
}: {
  entry: PerfActual | null;
  goal: Pick<PrimaryGoal, "name" | "unit" | "currency"> | null;
  /** The opportunity this came from, when it came from one. */
  dealName?: string;
  dealStatus?: string;
  open: boolean;
  onClose: () => void;
}) {
  if (!entry || !goal) return null;
  const status = entryStatus(entry);
  const when = stamp(entry.addedAt);

  return (
    <Modal open={open} onClose={onClose} title="This result" size="wide">
      {/* THE HEADLINE IS THE MONEY AND WHAT BECAME OF IT — the same two-sided
          shape the sign-off dialog's entry cards use. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-light bg-surface/50 px-3.5 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
          <CircleDollarSign size={17} strokeWidth={2.1} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-bold text-text-primary tnum">
            {fmtAmount(goal.unit, entry.amount, entry.currency)}
          </span>
          <span className="block truncate text-[12.5px] text-text-secondary">
            {goal.name}
          </span>
        </span>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold"
          style={{
            background: `color-mix(in srgb, ${ENTRY_COLOR[status]} 12%, transparent)`,
            color: ENTRY_INK[status],
          }}
        >
          {entryStatusLabel(entry)}
        </span>
      </div>

      <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
        <Fact label="Logged by">
          <span className="flex items-center gap-1.5">
            <Avatar name={entry.person} className="h-5 w-5 shrink-0 text-[8px]" />
            <span className="truncate">{entry.person}</span>
          </span>
        </Fact>
        <Fact label="Result date">
          <span className="tnum">{entry.date}</span>
          {when.day && (
            <span className="text-text-tertiary">
              {" "}· entered {when.day}
              {when.time ? ` · ${when.time}` : ""}
            </span>
          )}
        </Fact>
        {entry.customer && (
          <Fact label="Customer">
            <span className="flex items-center gap-1.5">
              <CompanyLogo
                name={entry.customer}
                className="h-5 w-5 shrink-0 text-[7px]"
              />
              <span className="truncate">{entry.customer}</span>
            </span>
          </Fact>
        )}
        {dealName && (
          <Fact label="From the deal">
            <span className="flex min-w-0 items-center gap-1.5">
              <Briefcase
                size={13}
                strokeWidth={2.1}
                aria-hidden="true"
                className="shrink-0 text-text-tertiary"
              />
              <span className="truncate">{dealName}</span>
              {dealStatus && (
                <span className="shrink-0 rounded-full bg-surface px-1.5 py-0.5 text-[10.5px] font-semibold text-text-secondary">
                  {dealStatus}
                </span>
              )}
            </span>
          </Fact>
        )}
      </div>

      {entry.note && (
        <p className="mt-3.5 rounded-lg bg-surface/60 px-3 py-2 text-[12.5px] italic text-text-secondary">
          &ldquo;{entry.note}&rdquo;
        </p>
      )}

      {/* PROOF AS A LINK, NEVER AN EMBEDDED VIEWER (Anir, Aug 20: "Don't put
          the file here. It's so ugly. Just have a nice link to open it"). */}
      <div className="mt-3.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
          Proof
        </p>
        <div className="mt-1.5 space-y-1.5">
          {(entry.evidence ?? []).length === 0 ? (
            <p className="text-[12.5px] text-[color:var(--warning)]">
              Nothing attached. There is no proof to read for this one.
            </p>
          ) : (
            (entry.evidence ?? []).map((f) => (
              <EvidenceLinkRow key={f.url} file={f} />
            ))
          )}
        </div>
      </div>

      {/* EntryTimeline carries its own "Timeline" heading — adding one above
          it printed two headings for one list, the same duplication the deal
          form had. */}
      <div className="mt-4 border-t border-border-light pt-3.5">
        <EntryTimeline entry={entry} person={entry.person} />
      </div>
    </Modal>
  );
}

/** One labelled fact. Same label treatment the deal form's fields use. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
        {label}
      </p>
      <div className="mt-1 min-w-0 text-[13px] text-text-primary">{children}</div>
    </div>
  );
}
