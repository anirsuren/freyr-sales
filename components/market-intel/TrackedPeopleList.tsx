"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, MapPin, MessageSquare, Repeat2, ThumbsUp, X } from "lucide-react";
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
        size="workflow"
      >
        {open && (
          <div>
            {/* Everything scraped from their profile, in one organized card:
                photo, full headline, when we started following, and the
                engagement their collected posts have earned. */}
            <div className="rounded-xl border border-border-light bg-[var(--surface)] p-4">
              <div className="flex flex-wrap items-start gap-4">
                <Avatar
                  name={open.name}
                  src={open.photoUrl || undefined}
                  className="h-20 w-20 shrink-0 text-[22px]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[18px] font-bold tracking-[-0.01em] text-text-primary">
                    {open.name}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-snug text-text-secondary">
                    {open.headline || open.role || "Tracked for posts"}
                  </p>
                  {open.location && (
                    <p className="mt-1 flex items-center gap-1 text-[12px] text-text-tertiary">
                      <MapPin size={12} strokeWidth={2.2} className="shrink-0 text-blue-primary" />
                      {open.location}
                    </p>
                  )}
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#0071E3]">
                      Followed since{" "}
                      {new Date(open.addedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="rounded-full bg-[rgba(109,40,217,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#6D28D9] tnum">
                      {openPosts === undefined
                        ? "first sync pending"
                        : `${openPosts.length} ${openPosts.length === 1 ? "post" : "posts"} collected`}
                    </span>
                    {open.followerCount != null && (
                      <span className="rounded-full bg-[rgba(15,118,110,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#0F766E] tnum">
                        {open.followerCount.toLocaleString("en-US")} followers
                      </span>
                    )}
                  </p>
                  {open.about && (
                    <p className="mt-2 overflow-hidden text-[12px] leading-relaxed text-text-secondary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
                      {open.about}
                    </p>
                  )}
                </div>
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
              {openPosts && openPosts.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border-light pt-3">
                  <span className="text-center">
                    <span className="block text-[16px] font-bold text-text-primary tnum">
                      {openPosts.reduce((a, p) => a + (p.reactions ?? 0), 0)}
                    </span>
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                      Reactions
                    </span>
                  </span>
                  <span className="text-center">
                    <span className="block text-[16px] font-bold text-text-primary tnum">
                      {openPosts.reduce((a, p) => a + (p.comments ?? 0), 0)}
                    </span>
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                      Comments
                    </span>
                  </span>
                  <span className="text-center">
                    <span className="block text-[16px] font-bold text-text-primary tnum">
                      {openPosts.reduce((a, p) => a + (p.reposts ?? 0), 0)}
                    </span>
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                      Reposts
                    </span>
                  </span>
                </div>
              )}
            </div>

            <div className="-mr-2 mt-4 h-[56vh] space-y-4 overflow-y-auto pr-2">
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
                    className="rounded-xl border border-border-light bg-white p-4 shadow-card"
                  >
                    <p className="flex items-center text-[11.5px] font-medium text-text-tertiary">
                      <span className="rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[color:#0071E3]">
                        {fmtDate(post.date)}
                      </span>
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open on LinkedIn"
                        title="Open on LinkedIn"
                        className="ml-auto flex items-center gap-1 text-[color:#0071E3] transition-opacity hover:opacity-70"
                      >
                        <LinkedInIcon size={12} />
                        <ExternalLink size={11} strokeWidth={2.2} />
                      </a>
                    </p>
                    <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-text-primary">
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
