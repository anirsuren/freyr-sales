"use client";

import { ClipboardPaste, ImagePlus, MessageSquarePlus, Send, X } from "lucide-react";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { DataMode } from "@/lib/dataMode";

const TYPES = [
  { value: "bug", label: "Bug", color: "#B02020" },
  { value: "product_feedback", label: "Product feedback", color: "#0071E3" },
  { value: "feature_request", label: "Feature request", color: "#7C3AED" },
  { value: "question", label: "Question", color: "#0F766E" },
];

export function FeedbackButton({ dataMode }: { dataMode: DataMode }) {
  const pathname = usePathname() || "/";
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setType("bug");
    setTitle("");
    setDescription("");
    setScreenshot("");
  }

  function takeImage(file?: File) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024) {
      toast("Use a PNG, JPEG, or WebP screenshot under 2MB.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setScreenshot(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  async function submit() {
    if (!title.trim() || !description.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title,
          description,
          screenshot,
          pageUrl: window.location.href,
          route: pathname,
          dataMode,
          screen: { width: window.screen.width, height: window.screen.height },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Feedback could not be sent.");
      toast("Feedback sent. Thank you.", "success");
      setOpen(false);
      reset();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Feedback could not be sent.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback or report a problem"
        title="Send feedback"
        className="fixed bottom-4 left-[84px] z-40 inline-flex h-9 items-center gap-2 rounded-full border border-border-light bg-white px-3 text-[12px] font-semibold text-text-secondary shadow-card transition-all hover:-translate-y-0.5 hover:border-blue-subtle hover:text-blue-primary lg:left-[252px]"
      >
        <MessageSquarePlus size={14} strokeWidth={2} /> Feedback
      </button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Send feedback" size="wide">
        <div
          className="space-y-4"
          onPaste={(event) => {
            const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"));
            if (image) takeImage(image);
          }}
        >
          <p className="text-[12.5px] leading-relaxed text-text-secondary">
            The current page, account, data mode, browser, screen size, and timestamp are captured automatically.
          </p>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Type</label>
            <ColorSelect value={type} options={TYPES} onChange={setType} ariaLabel="Feedback type" minWidth={0} collapsible={false} className="w-full" />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Title <span className="text-error">*</span></label>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} className="h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] text-text-primary outline-none focus:border-blue-primary focus:shadow-input-focus" />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Description <span className="text-error">*</span></label>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} maxLength={5000} className="w-full resize-y rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] leading-relaxed text-text-primary outline-none focus:border-blue-primary focus:shadow-input-focus" />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Screenshot <span className="font-medium normal-case tracking-normal">Optional</span></label>
              <span className="inline-flex items-center gap-1 text-[10.5px] text-text-tertiary"><ClipboardPaste size={12} /> Paste anywhere in this dialog</span>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => takeImage(event.target.files?.[0])} />
            {screenshot ? (
              <div className="relative overflow-hidden rounded-xl border border-border-light bg-surface p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={screenshot} alt="Feedback screenshot preview" className="max-h-48 w-full rounded-lg object-contain" />
                <button type="button" onClick={() => setScreenshot("")} aria-label="Remove screenshot" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white"><X size={14} /></button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-light px-4 py-5 text-[12.5px] font-semibold text-text-secondary hover:border-blue-subtle hover:bg-blue-light/20 hover:text-blue-primary"><ImagePlus size={16} /> Upload or paste a screenshot</button>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy || !title.trim() || !description.trim()} loading={busy}><Send size={14} /> Send feedback</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
