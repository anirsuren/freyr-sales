"use client";

import { useMemo, useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
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
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText());
        } catch {
          /* clipboard may be blocked in some contexts */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-[13px] font-medium text-blue-primary hover:text-blue-hover px-3 py-1 rounded-md hover:bg-blue-light transition-colors"
    >
      {copied ? "Copied ✓" : "Copy"}
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
      <div className="flex items-center justify-between gap-4">
        <Tabs tabs={TABS} active={active} onChange={setActive} />
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
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] text-text-tertiary">
              Subject lines — click to select
            </span>
            <CopyButton
              getText={() =>
                `Subject: ${selectedSubject}\n\n${emailBody}`
              }
            />
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {email.subject_lines?.map((s, i) => (
              <button
                key={i}
                onClick={() => setSelectedSubject(s)}
                className={cn(
                  "text-[13px] px-3 py-1.5 rounded-md border transition-colors text-left",
                  selectedSubject === s
                    ? "border-blue-primary bg-blue-light text-blue-primary"
                    : "border-border text-text-secondary hover:bg-surface"
                )}
              >
                {s}
              </button>
            ))}
          </div>
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
