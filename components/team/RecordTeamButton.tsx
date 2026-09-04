"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserCog } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Input";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { MultiPicker } from "@/components/ui/MultiPicker";
import { useToast } from "@/components/ui/Toast";
import type { RecordTeam, TeamedRecord } from "@/lib/recordTeams";

/**
 * SAY WHO IS ON THIS RECORD.
 *
 * Suren, Aug 28: "some people will have an owner privilege on this customer,
 * or team" — one owner, and a team beside them.
 *
 * The owner is a single pick and the team is a multi, because that is the
 * shape of the fact: a record has one person answerable for it and any number
 * of people working it. Somebody chosen as owner drops out of the team picker
 * rather than appearing twice, which is also how it is stored.
 *
 * Clearing both is allowed and means "nobody is assigned" — which the page
 * reads differently from an empty team, and falls back to showing who is
 * demonstrably doing the work instead.
 */
export function RecordTeamButton({
  type,
  id,
  label,
  team,
  members,
}: {
  type: TeamedRecord;
  id: string;
  /** What the thing is called, for the dialog's title. */
  label: string;
  team: RecordTeam | null;
  /** Everyone who could be picked — real workspace people. */
  members: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [owner, setOwner] = useState(team?.owner ?? "");
  const [picked, setPicked] = useState<string[]>(team?.members ?? []);

  const roster = [...new Set([...(team?.members ?? []), ...members])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/record-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, owner: owner || undefined, members: picked }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast(data?.error || "That didn't save.", "error");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      toast("That didn't save.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOwner(team?.owner ?? "");
          setPicked(team?.members ?? []);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-3 py-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:text-blue-primary"
      >
        <UserCog size={14} strokeWidth={2.2} />
        {/* "Edit", like everything else (Anir, Sep 4: "I don't know why you
            have to say 'set the team'. Just have an edit button"). The tab
            already says Team; the button only needs to say what kind of
            control it is. */}
        Edit the team
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Who is on ${label}?`}
        size="wide"
      >
        <div>
          <Field label="Owner">
            <ColorSelect
              value={owner}
              ariaLabel="Owner"
              collapsible={false}
              dense
              searchable
              className="w-full"
              onChange={(v) => {
                setOwner(v);
                /* One person, one place: the owner never also sits in the
                   team list. */
                setPicked((cur) => cur.filter((m) => m !== v));
              }}
              /* "Nobody yet" IS ALWAYS ON THE LIST. It was only offered while
                 the field was empty, which is exactly backwards: an unset
                 owner does not need an option to stay unset, and a SET one had
                 no way back — once you named somebody the account owner you
                 could never unname them (found in the browser, Aug 28,
                 reverting a test assignment). Taking somebody off a record is
                 as ordinary as putting them on it. */
              options={[
                { value: "", label: "Nobody yet", color: "#64748B" },
                ...roster.map((n) => ({ value: n, label: n, avatarName: n })),
              ]}
            />
          </Field>

          <div className="mt-3">
            <Field label="Team">
              <MultiPicker
                variant="dropdown"
                ariaLabel="Team on this record"
                placeholder="Nobody else yet"
                emptyLabel="No people on this workspace."
                selected={picked}
                onToggle={(n) =>
                  setPicked((cur) =>
                    cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]
                  )
                }
                options={roster
                  .filter((n) => n !== owner)
                  .map((n) => ({ id: n, label: n, avatarName: n }))}
              />
            </Field>
          </div>

          {/* WHAT THIS ACTUALLY DOES, SAID TRUTHFULLY.
              It used to read "This records who is on it. It does not change what
              anybody can open," which was true when the store was written on
              Aug 28 and stopped being true on Sep 1, when lib/recordScope
              started reading these teams to answer whether a record is
              editable. Putting somebody on a record now hands them the pen, and
              a dialog that promises the opposite is the worst place to learn
              that. */}
          <p className="mt-3 text-[11.5px] text-text-tertiary">
            The people here can change this record. Everybody else can see it and
            cannot change it.
          </p>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-lg bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
