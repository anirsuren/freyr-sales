"use client";

import { ClipboardPaste, ImagePlus, Keyboard, LoaderCircle, MessageSquarePlus, Mic, Send, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const MAX_SCREENSHOT_DATA_URL = 2_700_000;

type SpeechResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function encodedScreenshot(canvas: HTMLCanvasElement): string {
  let quality = 0.82;
  let result = canvas.toDataURL("image/jpeg", quality);
  while (result.length > MAX_SCREENSHOT_DATA_URL && quality > 0.42) {
    quality -= 0.1;
    result = canvas.toDataURL("image/jpeg", quality);
  }
  if (result.length <= MAX_SCREENSHOT_DATA_URL) return result;

  const ratio = Math.max(
    0.55,
    Math.min(0.9, Math.sqrt(MAX_SCREENSHOT_DATA_URL / result.length) * 0.9)
  );
  const reduced = document.createElement("canvas");
  reduced.width = Math.max(1, Math.round(canvas.width * ratio));
  reduced.height = Math.max(1, Math.round(canvas.height * ratio));
  reduced.getContext("2d")?.drawImage(canvas, 0, 0, reduced.width, reduced.height);
  return reduced.toDataURL("image/jpeg", 0.72);
}

export function FeedbackButton({ dataMode }: { dataMode: DataMode }) {
  const pathname = usePathname() || "/";
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseRef = useRef("");
  const voiceTextRef = useRef("");
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [capturing, setCapturing] = useState(false);
  // True for ~600ms right after the screenshot lands: drives the camera
  // flash + viewfinder snap so the click visibly TAKES the picture.
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    },
    []
  );

  function stopVoice() {
    recognitionRef.current?.stop();
  }

  function chooseTyping() {
    if (listening) stopVoice();
    descriptionRef.current?.focus();
  }

  function startVoice() {
    if (listening) {
      stopVoice();
      return;
    }
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError(
        "Voice input is not available in this browser. You can still type your feedback below."
      );
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    voiceBaseRef.current = description.trim();
    voiceTextRef.current = "";
    setVoiceError("");
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalText += `${result[0].transcript} `;
        else interimText += result[0].transcript;
      }
      const spoken = `${finalText}${interimText}`.trim();
      voiceTextRef.current = spoken;
      setDescription(
        [voiceBaseRef.current, spoken].filter(Boolean).join(
          voiceBaseRef.current && spoken ? "\n\n" : ""
        )
      );
    };
    recognition.onerror = (event) => {
      setVoiceError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was blocked. Allow microphone access, then press Speak your feedback again."
          : "Voice input stopped unexpectedly. Your transcript is still below, and you can continue typing."
      );
      setListening(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      const spoken = voiceTextRef.current.trim();
      if (spoken) {
        setTitle((current) => {
          if (current.trim()) return current;
          return (spoken.split(/[.!?]/)[0] || spoken).trim().slice(0, 160);
        });
      }
    };
    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setVoiceError("Voice input could not start. Please try again or type below.");
    }
  }

  function reset() {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setListening(false);
    setVoiceError("");
    setType("bug");
    setTitle("");
    setDescription("");
    setScreenshot("");
    setCaptureError("");
  }

  function closeFeedback() {
    if (busy) return;
    reset();
    setOpen(false);
  }

  async function captureCurrentPage() {
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(document.documentElement, {
      backgroundColor: "#FFFFFF",
      useCORS: true,
      // The app uses modern CSS colour functions. Browser-native SVG
      // rendering preserves those styles instead of asking html2canvas's
      // legacy colour parser to interpret them.
      foreignObjectRendering: true,
      logging: false,
      scale: Math.min(window.devicePixelRatio || 1, 1.25),
      x: window.scrollX,
      y: window.scrollY,
      width: window.innerWidth,
      height: window.innerHeight,
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      ignoreElements: (element) =>
        element.hasAttribute("data-feedback-trigger") ||
        element.hasAttribute("data-feedback-capture-overlay") ||
        element.getAttribute("role") === "tooltip",
    });
    return encodedScreenshot(canvas);
  }

  async function openFeedback() {
    if (capturing) return;
    reset();
    setCapturing(true);
    try {
      // Let React paint the blocking capture state before html2canvas starts
      // doing synchronous layout work. Without this frame, the click appears
      // dead for several seconds and people naturally press it again.
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve())
      );
      setScreenshot(await captureCurrentPage());
      // The shot is in hand — fire the camera flash, let it read for a
      // beat, then open the form over the fading frame.
      setCapturing(false);
      setFlash(true);
      window.setTimeout(() => setFlash(false), 650);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 280));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown capture error";
      console.error("Automatic feedback screenshot failed:", error);
      setCaptureError(
        process.env.NODE_ENV === "development"
          ? `The page screenshot could not be captured automatically (${detail}). You can still paste or upload one below.`
          : "The page screenshot could not be captured automatically. You can still paste or upload one below."
      );
    } finally {
      setCapturing(false);
      setOpen(true);
    }
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
      if (!response.ok) {
        if (result.saved) {
          setOpen(false);
          reset();
          toast(
            "Feedback saved, but the email alert failed. Contact support if it is urgent.",
            "error"
          );
          return;
        }
        throw new Error(result.error || "Feedback could not be sent. Try again.");
      }
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
        onClick={openFeedback}
        disabled={capturing}
        aria-busy={capturing}
        data-feedback-trigger
        aria-label="Send feedback or report a problem"
        title="Send feedback"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface hover:text-blue-primary disabled:cursor-wait"
      >
        {capturing ? (
          <LoaderCircle size={19} strokeWidth={1.8} className="animate-spin" />
        ) : (
          <MessageSquarePlus size={19} strokeWidth={1.7} />
        )}
      </button>
      {capturing &&
        createPortal(
          <div
            data-feedback-capture-overlay
            className="fixed inset-0 z-[120] flex cursor-wait items-center justify-center bg-slate-950/35 backdrop-blur-sm"
            role="status"
            aria-live="polite"
            aria-label="Preparing feedback form"
          >
            <div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/95 px-5 py-4 shadow-[0_18px_52px_-18px_rgba(15,23,42,0.55)]">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-light text-blue-primary">
                <LoaderCircle size={20} strokeWidth={1.9} className="animate-spin" />
              </span>
              <span>
                <span className="block text-[13px] font-semibold text-text-primary">
                  Preparing feedback
                </span>
                <span className="block text-[11.5px] text-text-secondary">
                  Capturing this page…
                </span>
              </span>
            </div>
          </div>,
          document.body
        )}
      {flash &&
        createPortal(
          <div
            data-feedback-capture-overlay
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-[130]"
          >
            {/* The flash… */}
            <div
              className="absolute inset-0 bg-white"
              style={{ animation: "feedback-flash 600ms ease-out forwards" }}
            />
            {/* …and the viewfinder frame snapping onto the page. */}
            <div
              className="absolute inset-2 rounded-2xl border-4 border-white"
              style={{
                animation: "feedback-frame 600ms ease-out forwards",
                boxShadow: "0 0 34px rgba(255,255,255,0.85)",
              }}
            />
          </div>,
          document.body
        )}
      <Modal open={open} onClose={closeFeedback} title="Send feedback" size="wide">
        <div
          className="space-y-4"
          onPaste={(event) => {
            const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"));
            if (image) takeImage(image);
          }}
        >
          <p className="text-[12.5px] leading-relaxed text-text-secondary">
            A screenshot of the page you were viewing is attached automatically, along with the page, account, data mode, browser, screen size, and timestamp.
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
            <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2">
              <button
                type="button"
                onClick={chooseTyping}
                aria-label="Type your feedback"
                className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border-light bg-white px-3 py-2.5 text-left transition-all hover:border-blue-subtle hover:bg-blue-light/20 focus-visible:border-blue-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/15"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
                  <Keyboard size={16} strokeWidth={1.9} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold text-text-primary">
                    Type your feedback
                  </span>
                  <span className="block text-[10.5px] text-text-secondary">
                    Write it below
                  </span>
                </span>
              </button>
              <span className="self-center text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                or
              </span>
              <button
                type="button"
                onClick={startVoice}
                aria-pressed={listening}
                aria-label={listening ? "Stop voice feedback" : "Speak your feedback"}
                className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 ${
                  listening
                    ? "border-red-300 bg-red-50 text-red-800 focus-visible:ring-red-500/15"
                    : "border-border-light bg-white text-text-primary hover:border-blue-subtle hover:bg-blue-light/20 focus-visible:border-blue-primary focus-visible:ring-blue-primary/15"
                }`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${listening ? "bg-red-600 text-white" : "bg-blue-primary text-white"}`}>
                  {listening ? <Square size={12} fill="currentColor" /> : <Mic size={16} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold">
                    {listening ? "Listening… tap to stop" : "Speak your feedback"}
                  </span>
                  <span className="block text-[10.5px] text-text-secondary">
                    {listening ? "Your words appear below" : "Talk instead of typing"}
                  </span>
                </span>
              </button>
            </div>
            {voiceError && (
              <p role="alert" className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
                {voiceError}
              </p>
            )}
            <textarea ref={descriptionRef} aria-label="Feedback description" placeholder={listening ? "Listening… your words will appear here." : "Type your feedback here."} value={description} onChange={(event) => setDescription(event.target.value)} rows={5} maxLength={5000} className="w-full resize-y rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] leading-relaxed text-text-primary outline-none focus:border-blue-primary focus:shadow-input-focus" />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Screenshot <span className="font-medium normal-case tracking-normal">Captured automatically</span></label>
              <span className="inline-flex items-center gap-1 text-[10.5px] text-text-tertiary"><ClipboardPaste size={12} /> Paste anywhere in this dialog</span>
            </div>
            {captureError && (
              <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
                {captureError}
              </p>
            )}
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
            <Button variant="secondary" onClick={closeFeedback} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy || !title.trim() || !description.trim()} loading={busy}><Send size={14} /> Send feedback</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
