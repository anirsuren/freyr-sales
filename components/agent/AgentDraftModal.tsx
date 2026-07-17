"use client";

import Link from "next/link";
import {
  FileText,
  Copy,
  ArrowRight,
  ClipboardList,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { copyText } from "@/lib/clipboard";

export type AgentDraft = { title: string; body: string; runId?: string };

// The actual draft the agent produced (email/plan) — real, readable output the
// rep can copy/edit, with a clear note that it's saved and added to Tasks.
// Shared by every "Draft it for me" surface so pressing the button always shows
// the same thing (Suren: "it should show me the draft… full enterprise platform").
export function AgentDraftModal({
  draft,
  onClose,
}: {
  draft: AgentDraft | null;
  onClose: () => void;
}) {
  const { toast } = useToast();

  async function copy() {
    if (!draft) return;
    if (await copyText(draft.body)) {
      toast("Draft copied to your clipboard");
      return;
    }
    toast("Couldn't copy — select and copy manually", "error");
  }

  return (
    <Modal
      open={!!draft}
      onClose={onClose}
      title="Agent draft — ready for your review"
      size="wide"
    >
      {draft && (
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
              <FileText size={18} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-text-primary leading-snug">
                {draft.title}
              </p>
              <p className="text-[12.5px] text-text-secondary mt-0.5">
                First draft from this account&apos;s live data — edit before you
                send. Nothing goes out automatically.
              </p>
            </div>
          </div>

          <pre className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text-primary bg-surface border border-border-light rounded-xl p-4 max-h-[46vh] overflow-y-auto font-sans">
            {draft.body}
          </pre>

          <div className="flex items-center gap-2 text-[12px] text-text-secondary bg-success/[0.06] border border-success/20 rounded-lg px-3 py-2">
            <ClipboardList
              size={14}
              strokeWidth={1.9}
              className="text-success shrink-0"
            />
            Saved to the account timeline and added to{" "}
            <strong className="font-semibold">Tasks</strong> for review.
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              {draft.runId && (
                <Link
                  href={`/agent/runs/${draft.runId}`}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-primary px-3 py-2 rounded-md border border-border-light hover:bg-surface transition-colors"
                >
                  Open full run
                  <ArrowRight size={13} strokeWidth={1.8} />
                </Link>
              )}
              <Link
                href="/tasks"
                className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-text-secondary px-3 py-2 rounded-md border border-border-light hover:bg-surface transition-colors"
              >
                <ClipboardList size={13} strokeWidth={1.8} />
                View in Tasks
              </Link>
            </div>
            <button
              onClick={copy}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors active:scale-[0.97]"
            >
              <Copy size={13} strokeWidth={1.9} />
              Copy draft
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
