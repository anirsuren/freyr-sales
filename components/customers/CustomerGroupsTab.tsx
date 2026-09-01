"use client";

import { TabActions } from "./TabActions";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Layers,
  Pencil,
  Plus,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { MultiPicker } from "@/components/ui/MultiPicker";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/pipeline";
import { GROUP_COLORS, type CustomerGroup } from "@/lib/customerGroups";

/**
 * CUSTOMER GROUPS.
 *
 * Suren, Aug 28: "somebody can take a customer and create multiple groups.
 * They can call something strategic accounts, focused accounts, AMR account,
 * EU account... and then take these and add some customers to that group. In
 * this group, for every group, you can actually put these statistics if you
 * want."
 *
 * So the unit on screen is the GROUP, not the customer: a card per group with
 * what those accounts add up to on its face, and the accounts themselves
 * underneath. The statistics are the entire reason to draw the circle — a
 * group that only listed names would be a folder, and he already has a
 * customer list.
 *
 * Nothing here edits a customer. A group is a way of reading the book, which
 * is why an account can sit in as many as make sense and why deleting a group
 * says out loud that the accounts stay.
 */

export type GroupCustomer = {
  id: string;
  name: string;
  /** Open pipeline on this account, already summed by the server. */
  openValue: number;
  openCount: number;
  meetings: number;
};

export function CustomerGroupsTab({
  groups: initial,
  customers,
  canEdit,
  canCreate,
}: {
  groups: CustomerGroup[];
  customers: GroupCustomer[];
  canEdit: boolean;
  /** Starting a NEW group is a create, which the route asks for separately —
   *  a BD Member holds edit and would be refused (Anir, Sep 1: "It looks like
   *  I can create a new group. Is that right as a BD member?"). It was not. */
  canCreate: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [groups, setGroups] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CustomerGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CustomerGroup | null>(null);

  const byId = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers]
  );

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch("/api/customer-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast(data?.error || "That didn't save.", "error");
        return false;
      }
      if (data.state?.groups) setGroups(data.state.groups);
      router.refresh();
      return true;
    } catch {
      toast("That didn't save.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* NO DESCRIPTION EITHER (Anir, Aug 30, having just said it about
          Customers: "same thing for groups"). The tab strip above names the
          tab; a sentence explaining what a group is belongs on the empty
          state, where it already is, and not over a list of groups somebody
          has already made. */}
      <TabActions>
        {canCreate && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Plus size={15} strokeWidth={2.4} /> New group
          </button>
        )}
      </TabActions>

      {groups.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No groups yet"
          description="A group is a named set of accounts — Strategic accounts, EU filings, renewals due. Each one shows what those accounts add up to."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {groups.map((g) => {
            const members = g.customerIds
              .map((id) => byId.get(id))
              .filter((c): c is GroupCustomer => !!c);
            /* THE NUMBERS ARE THE POINT OF THE CIRCLE. Summed here rather
               than stored, so they can never disagree with the deal that
               was edited a minute ago. */
            const pipeline = members.reduce((s, c) => s + c.openValue, 0);
            const deals = members.reduce((s, c) => s + c.openCount, 0);
            const meetings = members.reduce((s, c) => s + c.meetings, 0);
            /* An id in the group whose customer is gone from this workspace:
               counted honestly rather than silently dropped. */
            const missing = g.customerIds.length - members.length;

            return (
              <section
                key={g.id}
                className="overflow-hidden rounded-xl border border-border-light bg-white shadow-card"
                style={{ borderTopColor: g.color, borderTopWidth: 3 }}
              >
                <header className="flex items-start justify-between gap-3 px-4 pt-3.5">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
                      <span
                        aria-hidden="true"
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
                        style={{ background: `${g.color}1A`, color: g.color }}
                      >
                        <Layers size={13} strokeWidth={2.4} />
                      </span>
                      <span className="truncate">{g.name}</span>
                    </h3>
                    {g.description && (
                      <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
                        {g.description}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(g)}
                        aria-label={`Edit ${g.name}`}
                        className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                      >
                        <Pencil size={14} strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(g)}
                        aria-label={`Delete ${g.name}`}
                        className="rounded-md p-1.5 text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
                      >
                        <Trash2 size={14} strokeWidth={2} />
                      </button>
                    </div>
                  )}
                </header>

                {/* The statistics he asked for, on the face of the group. */}
                <dl className="mt-3 grid grid-cols-3 divide-x divide-border-light border-y border-border-light bg-surface/40">
                  <Stat icon={Building2} label="Accounts" value={String(members.length)} />
                  <Stat icon={Wallet} label="Open pipeline" value={formatMoney(pipeline)} />
                  <Stat
                    icon={Users}
                    label="Meetings"
                    value={String(meetings)}
                    sub={`${deals} open ${deals === 1 ? "deal" : "deals"}`}
                  />
                </dl>

                <div className="px-4 py-3">
                  {members.length === 0 ? (
                    <p className="py-3 text-center text-[12.5px] text-text-tertiary">
                      No accounts in this group yet.
                    </p>
                  ) : (
                    <ul className="flex flex-wrap gap-x-3 gap-y-2">
                      {members.map((c) => (
                        <li key={c.id}>
                          <Link
                            href={`/customers/${c.id}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border-light bg-white px-2 py-1 text-[12.5px] text-text-primary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                          >
                            <CompanyLogo name={c.name} className="h-[18px] w-[18px] text-[7px]" />
                            {c.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  {missing > 0 && (
                    <p className="mt-2 text-[11.5px] text-text-tertiary">
                      {missing} account{missing === 1 ? "" : "s"} in this group
                      {missing === 1 ? " is" : " are"} not in this workspace.
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <GroupDialog
          group={editing}
          customers={customers}
          busy={busy}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={async (input) => {
            const ok = await post(
              editing
                ? { op: "update", id: editing.id, patch: input }
                : { op: "create", ...input }
            );
            if (ok) {
              setCreating(false);
              setEditing(null);
            }
            return ok;
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Delete "${confirmDelete?.name ?? "this group"}"?`}
        /* The one thing somebody deleting a group needs to be sure of. */
        body={`The group goes; the ${
          confirmDelete?.customerIds.length ?? 0
        } account${
          (confirmDelete?.customerIds.length ?? 0) === 1 ? "" : "s"
        } inside it stay exactly as they are.`}
        confirmLabel="Delete the group"
        tone="destructive"
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          const g = confirmDelete;
          setConfirmDelete(null);
          if (g) await post({ op: "delete", id: g.id });
        }}
      />
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="px-4 py-2.5">
      <dt className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
        <Icon size={12} strokeWidth={2.2} className="text-blue-primary" />
        {label}
      </dt>
      <dd className="mt-0.5 text-[16px] font-semibold tnum text-text-primary">
        {value}
        {sub && (
          <span className="ml-1.5 text-[11.5px] font-normal text-text-secondary">
            {sub}
          </span>
        )}
      </dd>
    </div>
  );
}

function GroupDialog({
  group,
  customers,
  busy,
  onClose,
  onSave,
}: {
  group: CustomerGroup | null;
  customers: GroupCustomer[];
  busy: boolean;
  onClose: () => void;
  onSave: (input: {
    name: string;
    description?: string;
    color: string;
    customerIds: string[];
  }) => Promise<boolean>;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [color, setColor] = useState(group?.color ?? GROUP_COLORS[0]);
  const [customerIds, setCustomerIds] = useState<string[]>(
    group?.customerIds ?? []
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={group ? "Edit group" : "New customer group"}
      size="wide"
    >
      <div>
        <Field label="What is this group called">
          <Input
            value={name}
            /* lib/customerGroups trims the name to 80 and the reason to 240,
               so a longer one went in whole and came back short with nothing
               said. Declared here so typing stops where the server cuts. */
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="Strategic accounts"
          />
        </Field>

        <div className="mt-3">
          <Field label="Why it exists — optional">
            <Textarea
              rows={2}
              value={description}
              maxLength={240}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDescription(e.target.value)
              }
              placeholder="The handful we plan around every quarter."
            />
          </Field>
        </div>

        {/* Colour + icon on every category, the standing chip rule. */}
        <div className="mt-3">
          <span className="mb-1.5 block text-[12px] font-semibold text-text-primary">
            Colour
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {GROUP_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use this colour`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cn(
                  "h-7 w-7 rounded-full transition-transform",
                  color === c
                    ? "ring-2 ring-offset-2 ring-[color:var(--blue-primary)] scale-110"
                    : "hover:scale-105"
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <div className="mt-3">
          <Field label="Which accounts are in it">
            <MultiPicker
              variant="dropdown"
              ariaLabel="Accounts in this group"
              placeholder="Pick the accounts…"
              emptyLabel="No customers on this workspace yet."
              selected={customerIds}
              onToggle={(id) =>
                setCustomerIds((cur) =>
                  cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
                )
              }
              options={customers.map((c) => ({
                id: c.id,
                label: c.name,
                logoName: c.name,
                sub:
                  c.openCount > 0
                    ? `${c.openCount} open ${c.openCount === 1 ? "deal" : "deals"}`
                    : undefined,
              }))}
            />
          </Field>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() =>
              onSave({
                name: name.trim(),
                description: description.trim() || undefined,
                color,
                customerIds,
              })
            }
            className="rounded-lg bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : group ? "Save changes" : "Create group"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
