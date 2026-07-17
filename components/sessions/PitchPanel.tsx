"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { SubjectLineCarousel } from "@/components/sessions/SubjectLineCarousel";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import type { PitchEmail, PitchCallScript } from "@/lib/types";

const TABS = [
  { key: "5min", label: "5-Min Script" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone Script" },
];

function asEmail(v: PitchEmail | string | null): PitchEmail {
  if (!v) return { subject_lines: [], body: "" };
  if (typeof v === "object") return v;
  try {
    const parsed = JSON.parse(v);
    if (parsed && typeof parsed === "object" && "body" in parsed) return parsed;
  } catch {
    /* not JSON */
  }
  return { subject_lines: [], body: v };
}

function asCall(v: PitchCallScript | string | null): PitchCallScript {
  const empty: PitchCallScript = {
    opener: "",
    value_prop: "",
    permission_question: "",
    if_bad_time_voicemail: "",
    if_good_time_continue: "",
    qualifying_questions: [],
  };
  if (!v) return empty;
  if (typeof v === "object") return v;
  try {
    return { ...empty, ...JSON.parse(v) };
  } catch {
    return { ...empty, opener: v };
  }
}

function callToText(c: PitchCallScript): string {
  return [
    `OPENER\n${c.opener}`,
    `\nVALUE PROP\n${c.value_prop}`,
    `\nPERMISSION QUESTION\n${c.permission_question}`,
    `\nIF BAD TIME (VOICEMAIL)\n${c.if_bad_time_voicemail}`,
    `\nIF GOOD TIME (CONTINUE)\n${c.if_good_time_continue}`,
    `\nQUALIFYING QUESTIONS\n${(c.qualifying_questions || [])
      .map((q, i) => `${i + 1}. ${q}`)
      .join("\n")}`,
  ].join("\n");
}

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
      title={copied ? "Copied" : "Copy to clipboard"}
      onClick={async () => {
        if (await copyText(getText())) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg border transition-[color,background-color,border-color,transform] active:scale-95",
        copied
          ? "border-success/20 bg-success/10 text-success"
          : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:bg-blue-light hover:text-blue-primary"
      )}
    >
      {copied ? (
        <Check size={15} strokeWidth={2.2} />
      ) : (
        <Copy size={15} strokeWidth={1.8} />
      )}
    </button>
  );
}

export function PitchPanel({
  pitch5min,
  pitchEmail,
  pitchCall,
}: {
  pitch5min: string;
  pitchEmail: PitchEmail | string;
  pitchCall: PitchCallScript | string;
}) {
  const email = useMemo(() => asEmail(pitchEmail), [pitchEmail]);
  const call = useMemo(() => asCall(pitchCall), [pitchCall]);

  const [active, setActive] = useState("5min");
  const [script, setScript] = useState(pitch5min || "");
  const [emailBody, setEmailBody] = useState(email.body || "");
  const [phoneText, setPhoneText] = useState(callToText(call));
  const [selectedSubject, setSelectedSubject] = useState(
    email.subject_lines?.[0] || ""
  );

  const textareaClass =
    "min-h-[400px] w-full bg-surface rounded-md p-4 text-[15px] leading-relaxed text-text-primary border border-transparent outline-none focus:border-blue-primary focus:shadow-focus resize-y";

  return (
    <div>
      <div
        role="tablist"
        aria-label="Pitch formats"
        className="inline-flex items-center gap-1 rounded-xl bg-surface p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            onClick={() => setActive(t.key)}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-[13px] transition-all whitespace-nowrap",
              active === t.key
                ? "bg-white text-blue-primary font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                : "text-text-secondary hover:text-text-primary font-medium"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 5-min script */}
      {active === "5min" && (
        <div className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] text-text-tertiary">
              5-Minute Pitch Script
            </span>
            <CopyButton getText={() => script} />
          </div>
          <textarea
            className={textareaClass}
            value={script}
            onChange={(e) => setScript(e.target.value)}
          />
        </div>
      )}

      {/* Email */}
      {active === "email" && (
        <div className="pt-4">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              Subject line
              <span className="ml-1.5 font-normal normal-case tracking-normal">
                — pick the one to send
              </span>
            </span>
            <CopyButton
              getText={() =>
                `Subject: ${selectedSubject}\n\n${emailBody}`
              }
            />
          </div>
          {email.subject_lines && email.subject_lines.length > 0 && (
            <SubjectLineCarousel
              subjects={email.subject_lines}
              selected={selectedSubject}
              onSelect={setSelectedSubject}
            />
          )}
          <textarea
            className={textareaClass}
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
          />
        </div>
      )}

      {/* Phone */}
      {active === "phone" && (
        <div className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] text-text-tertiary">
              Cold Call Script
            </span>
            <CopyButton getText={() => phoneText} />
          </div>
          <textarea
            className={textareaClass}
            value={phoneText}
            onChange={(e) => setPhoneText(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
