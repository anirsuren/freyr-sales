"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Repeat2, ThumbsUp, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import type { FeedPost } from "@/lib/marketIntelFeed";
import type { TrackedPerson } from "@/lib/marketIntelTracking";

/**
 * The People tracked rail (Anir, Aug 11): every row opens a popup with the
 * person's collected posts and their numbers, a LinkedIn glyph on each row
 * jumps straight to the profile, and stopping a follow asks first — an
 * accidental tap deleted a real person once, never again.
 */

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function TrackedPeopleList({
  people,
  personPosts = {},
}: {
  people: TrackedPerson[];
  /** Collected posts by person id; a missing key means no sync yet. */
  personPosts?: Record<string, FeedPost[]>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function stopFollowing(person: TrackedPerson) {
    setBusy(true);
    try {
      const res = await fetch("/api/market-intel/tracking", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "person", id: person.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Could not save.");
      }
      toast(`Stopped following ${person.name}.`);
      setConfirmingId(null);
      setOpenId(null);
      router.refresh();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not save.", "error");
    } finally {
      setBusy(false);
    }
  }

  const open = people.find((p) => p.id === openId) ?? null;
  const openPosts = open ? personPosts[open.id] : undefined;

  return (
    <>
      <ul className="mt-2.5 space-y-1">
        {people.map((person) => {
          const posts = personPosts[person.id];
          const confirming = confirmingId === person.id;
          return (
            <li key={person.id} className="group/person">
              {confirming ? (
                <span className="flex items-center gap-2 rounded-lg bg-surface px-2 py-2 text-[12px] font-medium">
                  <span className="min-w-0 flex-1 truncate text-text-secondary">
                    Stop following {person.name}?
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => stopFollowing(person)}
                    className="cursor-pointer rounded-full bg-[rgba(220,38,38,0.10)] px-2.5 py-1 font-semibold text-[#DC2626] transition-colors hover:bg-[#DC2626] hover:text-white disabled:opacity-50"
                  >
                    {busy ? "Stopping…" : "Stop"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmingId(null)}
                    className="cursor-pointer rounded-full border border-border-light bg-white px-2.5 py-1 font-semibold text-text-secondary transition-colors hover:border-blue-subtle"
                  >
                    Keep
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-surface">
                  <button
                    type="button"
                    onClick={() => setOpenId(person.id)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                  >
                    <Avatar
                      name={person.name}
                      src={person.photoUrl || undefined}
                      className="h-8 w-8 shrink-0 text-[10px]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-text-primary">
                        {person.name}
                      </span>
                      <span className="block truncate text-[11px] text-text-tertiary">
                        {person.role || "Tracked for posts"}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[10.5px] font-semibold text-[color:#0071E3] tnum">
                      {posts === undefined
                        ? "pending"
                        : `${posts.length} ${posts.length === 1 ? "post" : "posts"}`}
                    </span>
                  </button>
                  {person.linkedinUrl && (
                    <a
                      href={person.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={`${person.name} on LinkedIn`}
                      aria-label={`${person.name} on LinkedIn`}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[color:#0071E3] transition-colors hover:bg-[rgba(0,113,227,0.10)]"
                    >
                      <LinkedInIcon size={13} />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmingId(person.id)}
                    className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-tertiary opacity-0 transition-all hover:bg-[rgba(220,38,38,0.10)] hover:text-[#DC2626] group-hover/person:opacity-100"
                    aria-label={`Stop following ${person.name}`}
                    title="Stop following"
                  >
                    <X size={13} strokeWidth={2.4} />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <Modal
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open ? open.name : ""}
        size="wide"
      >
        {open && (
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Avatar
                name={open.name}
                src={open.photoUrl || undefined}
                className="h-14 w-14 shrink-0 text-[16px]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-text-primary">
                  {open.name}
                </p>
                <p className="text-[12.5px] leading-snug text-text-secondary">
                  {open.role || "Tracked for posts"}
                </p>
              </div>
              <span className="rounded-full bg-[rgba(0,113,227,0.08)] px-2.5 py-1 text-[11.5px] font-semibold text-[color:#0071E3] tnum">
                {openPosts === undefined
                  ? "first sync pending"
                  : `${openPosts.length} ${openPosts.length === 1 ? "post" : "posts"} collected`}
              </span>
              {open.linkedinUrl && (
                <a
                  href={open.linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-full bg-[color:#0071E3] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <LinkedInIcon size={12} /> Open LinkedIn
                </a>
              )}
            </div>

            <div className="-mr-2 mt-4 max-h-[52vh] space-y-2.5 overflow-y-auto pr-2">
              {!openPosts || openPosts.length === 0 ? (
                <p className="rounded-lg bg-surface px-4 py-5 text-center text-[12.5px] leading-relaxed text-text-secondary">
                  {openPosts === undefined
                    ? "Their posts arrive with the next refresh. Everything they share publicly lands here."
                    : "Nothing public from them in the current window yet."}
                </p>
              ) : (
                openPosts.map((post) => (
                  <div
                    key={post.url}
                    className="rounded-lg border border-border-light p-3.5"
                  >
                    <p className="text-[11.5px] font-medium text-text-tertiary">
                      {fmtDate(post.date)}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-text-primary">
                      {post.text}
                    </p>
                    <p className="mt-2 flex items-center gap-4 text-[11px] font-medium text-text-tertiary">
                      {post.reactions != null && (
                        <span className="flex items-center gap-1 tnum">
                          <ThumbsUp size={11} strokeWidth={2} /> {post.reactions}
                        </span>
                      )}
                      {post.comments != null && (
                        <span className="flex items-center gap-1 tnum">
                          <MessageSquare size={11} strokeWidth={2} /> {post.comments}
                        </span>
                      )}
                      {post.reposts != null && (
                        <span className="flex items-center gap-1 tnum">
                          <Repeat2 size={12} strokeWidth={2} /> {post.reposts}
                        </span>
                      )}
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto flex items-center gap-1 text-[color:#0071E3] hover:underline"
                      >
                        <LinkedInIcon size={11} /> Open post
                      </a>
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
