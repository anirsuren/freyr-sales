"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BarChart3, FileText, Headphones, Mic, ShieldCheck, Sunrise, type LucideIcon } from "lucide-react";

/**
 * THE AGENT ON A PHONE, PLAYING THROUGH WHAT IT DOES (Anir, Oct 1: "an entire
 * thread of all the features, like the most complicated scenarios... show the
 * number at the top, the Freyr logo... make it look completely real").
 *
 * A WhatsApp chat as an iPhone shows it: Freyr's logo and number in the
 * header, "typing…" while the agent writes, a voice note recorded in the
 * composer, a PDF answered with its pages, a chart, two changes approved with
 * YES, and a forwarded call. Every reply follows the real agent's WhatsApp
 * format (the morning brief is reminderMessage's own wording). It loops, and
 * holds still for anyone who asks the system for reduced motion.
 */

type From = "agent" | "me";
type Msg =
  | { kind: "text"; from: From; time: string; text: string }
  | { kind: "voice"; from: From; time: string; seconds: number; transcript: string }
  | { kind: "doc"; from: From; time: string; name: string; meta: string; caption?: string }
  | { kind: "audio"; from: From; time: string; name: string; meta: string; caption?: string; forwarded?: boolean }
  | { kind: "chart"; from: From; time: string; caption: string };

type Step =
  | { do: "say"; msg: Msg; typing: number; scene?: number }
  | { do: "send"; msg: Msg; how: "type" | "record" | "attach"; scene?: number }
  | { do: "wait"; ms: number };

export const DEMO_SCENES: { icon: LucideIcon; label: string }[] = [
  { icon: Sunrise, label: "A morning brief before your day starts" },
  { icon: Mic, label: "Voice notes in, answers out" },
  { icon: FileText, label: "Reads PDFs and scans, cites the page" },
  { icon: BarChart3, label: "Charts whenever you ask" },
  { icon: ShieldCheck, label: "Changes happen only after your YES" },
  { icon: Headphones, label: "Forward a call, get what mattered" },
];

function script(firstName: string): Step[] {
  return [
    {
      do: "say",
      scene: 0,
      typing: 0,
      msg: {
        kind: "text",
        from: "agent",
        time: "8:00",
        text: `Good morning ${firstName}. Here is what needs you today:\n\n• 10:00 Kestrel Therapeutics, account review\n• Send the Northbridge SOW, due today\n• Vellum Labs renewal closes Friday, $240,000\n\nReply here if you want me to move a date, log an outcome or draft something.`,
      },
    },
    { do: "wait", ms: 3800 },
    {
      do: "send",
      scene: 1,
      how: "record",
      msg: { kind: "voice", from: "me", time: "8:03", seconds: 11, transcript: "Brief me for Kestrel, and send me the labeling deck for the meeting." },
    },
    {
      do: "say",
      typing: 2000,
      msg: {
        kind: "text",
        from: "agent",
        time: "8:03",
        text: "*Kestrel Therapeutics, 10:00 review*\n• Open deal: Labeling pilot, *$96,000*, Proposal\n• Last call: they sign if we hold the price and start 3 Nov\n• You promised the SOW by *Friday*\n• Watch for: their CFO wants a 60-day exit clause",
      },
    },
    { do: "say", typing: 900, msg: { kind: "doc", from: "agent", time: "8:03", name: "Freyr Labeling Services.pdf", meta: "12 pages · 3.4 MB" } },
    { do: "wait", ms: 3400 },
    {
      do: "send",
      scene: 2,
      how: "attach",
      msg: { kind: "doc", from: "me", time: "8:05", name: "Kestrel MSA draft.pdf", meta: "18 pages · 2.1 MB", caption: "Does this give them the 60-day exit?" },
    },
    {
      do: "say",
      typing: 1900,
      msg: {
        kind: "text",
        from: "agent",
        time: "8:05",
        text: "Yes. *Clause 14.2* (page 11) lets either side end it with *60 days' written notice*. The term is 24 months (page 2).\n\nOne catch: a termination fee applies in year one (page 12).",
      },
    },
    { do: "wait", ms: 3400 },
    { do: "send", scene: 3, how: "type", msg: { kind: "text", from: "me", time: "8:06", text: "Show my pipeline by stage" } },
    { do: "say", typing: 1600, msg: { kind: "chart", from: "agent", time: "8:06", caption: "*$1.97M across 5 deals.* Renewal is the biggest stage: Halvorsen at $1.4M." } },
    { do: "wait", ms: 3800 },
    {
      do: "send",
      scene: 4,
      how: "type",
      msg: { kind: "text", from: "me", time: "10:42", text: "Log today's Kestrel call: they agreed to $96k and a 3 Nov start. Remind me tomorrow at 9 to send the SOW" },
    },
    {
      do: "say",
      typing: 1800,
      msg: {
        kind: "text",
        from: "agent",
        time: "10:42",
        text: "Here's what I'll do:\n1. Log a call on *Kestrel Therapeutics*: agreed $96,000, start 3 Nov\n2. Remind you *tomorrow, 9:00*: Send the Kestrel SOW\n\nReply *YES* to go ahead or *NO* to cancel.",
      },
    },
    { do: "wait", ms: 2600 },
    { do: "send", how: "type", msg: { kind: "text", from: "me", time: "10:43", text: "YES" } },
    { do: "say", typing: 1000, msg: { kind: "text", from: "agent", time: "10:43", text: "Done.\n✓ Call logged on Kestrel Therapeutics\n✓ Reminder set for tomorrow, 9:00" } },
    { do: "wait", ms: 3200 },
    {
      do: "send",
      scene: 5,
      how: "attach",
      msg: { kind: "audio", from: "me", time: "11:15", forwarded: true, name: "Halvorsen QBR.m4a", meta: "30:17 · 10.4 MB", caption: "What risks did they flag?" },
    },
    {
      do: "say",
      typing: 2200,
      msg: {
        kind: "text",
        from: "agent",
        time: "11:16",
        text: "Two risks:\n1. *Tomas Ekberg*, their CMC lead, leaves in December [12:34]\n2. They want a revised rate card by 2 Nov [25:54]\n\nWant me to add the rate card as a follow-up?",
      },
    },
    { do: "wait", ms: 6500 },
  ];
}

/** A US number as the phone writes it (+1 555-178-7823); anything else grouped by threes. */
export function prettyPhone(number: string): string {
  const digits = number.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("1")) return `+1 ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  return `+${digits.slice(0, 2)} ${digits.slice(2).replace(/(\d{3})(?=\d)/g, "$1 ")}`;
}

/** WhatsApp's own markup: *bold*, kept to one line each. */
function richLine(line: string): ReactNode[] {
  return line.split(/(\*[^*\n]+\*)/g).map((part, i) =>
    /^\*[^*]+\*$/.test(part) ? <strong key={i} className="font-semibold">{part.slice(1, -1)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

/* Lines stay inline (joined by breaks) so the time can float onto the last
   line when it fits, as WhatsApp sets it. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {richLine(line)}
        </Fragment>
      ))}
    </>
  );
}

function Ticks({ read }: { read: boolean }) {
  return (
    <svg width="15" height="10" viewBox="0 0 16 11" aria-hidden="true" className="shrink-0">
      <path d="M1 5.6 4.1 8.7 10.4 2" fill="none" stroke={read ? "#53BDEB" : "#8696A0"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.6 8.7 7 9.1 13.3 2.4" fill="none" stroke={read ? "#53BDEB" : "#8696A0"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Meta({ time, mine, read }: { time: string; mine: boolean; read: boolean }) {
  return (
    <span className="float-right ml-2.5 mt-[6px] flex items-center gap-[3px] text-[9.5px] leading-none text-[#667781]">
      {time}
      {mine && <Ticks read={read} />}
    </span>
  );
}

/** WhatsApp draws its tail on the first bubble of a run, at the top corner. */
function Tail({ mine }: { mine: boolean }) {
  return (
    <svg
      width="8"
      height="13"
      viewBox="0 0 8 13"
      aria-hidden="true"
      className={`absolute top-0 ${mine ? "-right-[7px]" : "-left-[7px] -scale-x-100"}`}
    >
      <path d="M0 0h6.2c1.6 0 2.3 1.9 1.1 2.9L0 9.8z" fill={mine ? "#D9FDD3" : "#FFFFFF"} />
    </svg>
  );
}

function Waveform({ played }: { played: number }) {
  const bars = [4, 9, 6, 13, 8, 15, 11, 6, 14, 9, 16, 12, 7, 13, 10, 5, 11, 15, 8, 12, 6, 10, 14, 7, 9, 5];
  return (
    <span className="flex h-[22px] flex-1 items-center gap-[2px]" aria-hidden="true">
      {bars.map((h, i) => (
        <span key={i} style={{ height: h }} className={`w-[2.5px] rounded-full ${i / bars.length < played ? "bg-[#4FB6EC]" : "bg-[#A9B9AF]"}`} />
      ))}
    </span>
  );
}

function DocIcon() {
  return (
    <span className="relative grid h-[34px] w-[27px] shrink-0 place-items-end rounded-[3px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">
      <span className="absolute right-0 top-0 h-[8px] w-[8px] rounded-bl-[2px] bg-[#E3E8EC]" />
      <span className="mb-[4px] mr-auto ml-[3px] rounded-[2px] bg-[#3B6FD9] px-[3px] text-[6.5px] font-bold leading-[10px] text-white">PDF</span>
    </span>
  );
}

function PipelineChart() {
  const bars = [
    { label: "Qualify", value: 55, shown: "$55K", color: "#14B8A6" },
    { label: "Discovery", value: 180, shown: "$180K", color: "#5E5CE6" },
    { label: "Proposal", value: 336, shown: "$336K", color: "#AF52DE" },
    { label: "Renewal", value: 1400, shown: "$1.4M", color: "#0071E3" },
  ];
  const top = 1400;
  return (
    <svg viewBox="0 0 220 132" className="block w-full rounded-[6px] bg-white" role="img" aria-label="Pipeline by stage chart">
      <text x="12" y="17" fontSize="9.5" fontWeight="600" fill="#1D1D1F">Pipeline by stage</text>
      <text x="208" y="17" fontSize="8" textAnchor="end" fill="#6E6E73">$1.97M</text>
      <line x1="12" x2="208" y1="108" y2="108" stroke="#E5E5EA" strokeWidth="1" />
      {bars.map((b, i) => {
        const h = Math.max(3, (b.value / top) * 74);
        const x = 22 + i * 48;
        return (
          <g key={b.label}>
            <rect x={x} y={108 - h} width="28" height={h} rx="3" fill={b.color} />
            <text x={x + 14} y={104 - h} fontSize="7.5" fontWeight="600" textAnchor="middle" fill="#1D1D1F">{b.shown}</text>
            <text x={x + 14} y="120" fontSize="7.5" textAnchor="middle" fill="#6E6E73">{b.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Bubble({ msg, first, read }: { msg: Msg; first: boolean; read: boolean }) {
  const mine = msg.from === "me";
  const shell = `relative max-w-[84%] rounded-[8px] px-[7px] pb-[5px] pt-[5px] text-[11.5px] leading-[15.5px] text-[#111B21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] ${
    mine ? `ml-auto bg-[#D9FDD3] ${first ? "rounded-tr-none" : ""}` : `mr-auto bg-white ${first ? "rounded-tl-none" : ""}`
  }`;
  return (
    <div className={`wa-msg-in ${shell}`}>
      {first && <Tail mine={mine} />}
      {msg.kind === "text" && (
        <div className="flow-root break-words">
          <RichText text={msg.text} />
          <Meta time={msg.time} mine={mine} read={read} />
        </div>
      )}
      {msg.kind === "voice" && (
        <div className="w-[196px]">
          <div className="flex items-center gap-2 pr-1">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#F0F2F5]" aria-hidden="true">
              <svg width="10" height="12" viewBox="0 0 10 12"><path d="M1 1.2v9.6c0 .6.7 1 1.2.7l7.3-4.8a.8.8 0 0 0 0-1.4L2.2.5C1.7.2 1 .6 1 1.2z" fill="#54656F" /></svg>
            </span>
            <Waveform played={read ? 1 : 0} />
          </div>
          <div className="mt-[3px] flex items-center justify-between pl-9 text-[9.5px] text-[#667781]">
            <span>0:{String(msg.seconds).padStart(2, "0")}</span>
            <span className="flex items-center gap-[3px]">{msg.time}<Ticks read={read} /></span>
          </div>
          <p className="mt-1.5 border-t border-black/[0.06] pt-1.5 text-[10.5px] leading-[14px] text-[#3B4A54]">{msg.transcript}</p>
        </div>
      )}
      {msg.kind === "doc" && (
        <div className="w-[200px]">
          <div className={`flex items-center gap-2 rounded-[6px] px-2 py-2 ${mine ? "bg-[#C8F2BF]/70" : "bg-[#F5F6F6]"}`}>
            <DocIcon />
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-medium text-[#111B21]">{msg.name}</span>
              <span className="block text-[9.5px] text-[#667781]">{msg.meta} · PDF</span>
            </span>
          </div>
          {msg.caption ? (
            <div className="mt-1 flow-root px-0.5">
              {msg.caption}
              <Meta time={msg.time} mine={mine} read={read} />
            </div>
          ) : (
            <div className="mt-1 flex justify-end"><Meta time={msg.time} mine={mine} read={read} /></div>
          )}
        </div>
      )}
      {msg.kind === "audio" && (
        <div className="w-[200px]">
          {msg.forwarded && (
            <p className="mb-1 flex items-center gap-1 text-[9.5px] italic text-[#667781]">
              <svg width="11" height="9" viewBox="0 0 12 10" aria-hidden="true"><path d="M7 1l4 4-4 4M11 5H5C2.8 5 1 6.8 1 9" fill="none" stroke="#667781" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Forwarded
            </p>
          )}
          <div className="flex items-center gap-2 rounded-[6px] bg-[#C8F2BF]/70 px-2 py-2">
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-[#5E5CE6] text-white" aria-hidden="true">
              <Headphones size={15} strokeWidth={2.2} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-medium text-[#111B21]">{msg.name}</span>
              <span className="block text-[9.5px] text-[#667781]">{msg.meta} · Audio</span>
            </span>
          </div>
          {msg.caption && (
            <div className="mt-1 flow-root px-0.5">
              {msg.caption}
              <Meta time={msg.time} mine={mine} read={read} />
            </div>
          )}
        </div>
      )}
      {msg.kind === "chart" && (
        <div className="w-[208px]">
          <div className="overflow-hidden rounded-[6px] border border-black/[0.05]">
            <PipelineChart />
          </div>
          <div className="mt-1 flow-root px-0.5">
            <RichText text={msg.caption} />
            <Meta time={msg.time} mine={mine} read={read} />
          </div>
        </div>
      )}
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="wa-msg-in relative mr-auto w-fit rounded-[8px] rounded-tl-none bg-white px-3 py-[9px] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
      <Tail mine={false} />
      <span className="flex items-center gap-[3px]" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="wa-dot h-[5px] w-[5px] rounded-full bg-[#8696A0]" style={{ animationDelay: `${i * 0.16}s` }} />
        ))}
      </span>
    </div>
  );
}

const WALLPAPER =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='84' height='84' viewBox='0 0 84 84'%3E%3Cg fill='none' stroke='%23000' stroke-opacity='.05' stroke-width='1.1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 14c3-5 10-5 13 0s-2 10-7 10'/%3E%3Ccircle cx='60' cy='15' r='5'/%3E%3Cpath d='M38 42l4 6 7-11'/%3E%3Cpath d='M8 60h10m-5-5v10'/%3E%3Crect x='55' y='55' width='13' height='10' rx='2'/%3E%3Cpath d='M30 75c2-3 7-3 9 0'/%3E%3Cpath d='M72 34l3 3m0-3l-3 3'/%3E%3C/g%3E%3C/svg%3E\")";

function StatusBar({ time }: { time: string }) {
  return (
    <div className="relative flex h-[38px] items-end justify-between px-[22px] pb-[7px] text-[11.5px] font-semibold text-[#111B21]">
      <span className="w-12 tabular-nums">{time}</span>
      <span className="absolute left-1/2 top-[9px] h-[22px] w-[76px] -translate-x-1/2 rounded-full bg-black" aria-hidden="true" />
      <span className="flex items-center gap-[5px]" aria-hidden="true">
        <svg width="15" height="10" viewBox="0 0 17 11"><rect x="0" y="7" width="3" height="4" rx=".8" fill="#111B21" /><rect x="4.5" y="5" width="3" height="6" rx=".8" fill="#111B21" /><rect x="9" y="2.5" width="3" height="8.5" rx=".8" fill="#111B21" /><rect x="13.5" y="0" width="3" height="11" rx=".8" fill="#111B21" /></svg>
        <svg width="14" height="10" viewBox="0 0 15 11"><path d="M7.5 2.3c2.3 0 4.4.9 5.9 2.4l1.1-1.1A9.9 9.9 0 0 0 7.5.7 9.9 9.9 0 0 0 .5 3.6l1.1 1.1a8.3 8.3 0 0 1 5.9-2.4zm0 3.2c1.4 0 2.7.5 3.6 1.4l1.1-1.1a6.7 6.7 0 0 0-9.4 0l1.1 1.1c.9-.9 2.2-1.4 3.6-1.4zm0 3.1c.5 0 1 .2 1.3.5L7.5 10.4 6.2 9.1c.3-.3.8-.5 1.3-.5z" fill="#111B21" /></svg>
        <svg width="23" height="11" viewBox="0 0 25 12"><rect x=".5" y=".5" width="21" height="11" rx="3.2" fill="none" stroke="#111B21" strokeOpacity=".4" /><rect x="2" y="2" width="16" height="8" rx="2" fill="#111B21" /><path d="M23 4v4c.8-.3 1.3-1.1 1.3-2S23.8 4.3 23 4z" fill="#111B21" fillOpacity=".4" /></svg>
      </span>
    </div>
  );
}

export function WhatsAppDemoPhone({
  businessNumber,
  firstName,
  onScene,
}: {
  businessNumber: string;
  firstName: string;
  onScene?: (scene: number) => void;
}) {
  const steps = useMemo(() => script(firstName || "there"), [firstName]);
  const allMessages = useMemo(
    () => steps.flatMap((s) => (s.do === "wait" ? [] : [s.msg])),
    [steps],
  );
  const [reduced, setReduced] = useState(false);
  const [shown, setShown] = useState<Msg[]>([]);
  const [readUpTo, setReadUpTo] = useState(-1);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState<number | null>(null);
  const [fading, setFading] = useState(false);
  const chat = useRef<HTMLDivElement>(null);
  const sceneRef = useRef(onScene);
  sceneRef.current = onScene;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduced) {
      setShown(allMessages);
      setReadUpTo(allMessages.length);
      setTyping(false);
      setDraft("");
      setRecording(null);
      return;
    }
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          timers.delete(t);
          resolve();
        }, ms);
        timers.add(t);
      });
    (async () => {
      while (!cancelled) {
        setShown([]);
        setReadUpTo(-1);
        setTyping(false);
        setDraft("");
        setRecording(null);
        setFading(false);
        let count = 0;
        await sleep(700);
        for (const step of steps) {
          if (cancelled) return;
          if (step.do === "wait") {
            await sleep(step.ms);
            continue;
          }
          if (step.scene !== undefined) sceneRef.current?.(step.scene);
          if (step.do === "say") {
            // The person's last messages turn blue the moment the agent starts on them.
            setReadUpTo(count);
            if (step.typing) {
              setTyping(true);
              await sleep(step.typing);
              if (cancelled) return;
              setTyping(false);
            } else {
              await sleep(400);
            }
            setShown((prev) => [...prev, step.msg]);
            count++;
            await sleep(450);
            continue;
          }
          if (step.how === "type" && step.msg.kind === "text") {
            const text = step.msg.text;
            const chunk = text.length > 40 ? 3 : 1;
            for (let i = chunk; i < text.length + chunk; i += chunk) {
              if (cancelled) return;
              setDraft(text.slice(0, i));
              await sleep(text.length > 40 ? 45 : 70);
            }
            await sleep(350);
            setDraft("");
          } else if (step.how === "record" && step.msg.kind === "voice") {
            const total = step.msg.seconds;
            for (let s = 0; s <= total; s++) {
              if (cancelled) return;
              setRecording(s);
              await sleep(150);
            }
            await sleep(250);
            setRecording(null);
          } else {
            await sleep(600);
          }
          if (cancelled) return;
          setShown((prev) => [...prev, step.msg]);
          count++;
          await sleep(500);
        }
        if (cancelled) return;
        setFading(true);
        await sleep(600);
      }
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [reduced, steps, allMessages]);

  // The newest message stays in view, as it does in the app.
  useEffect(() => {
    const el = chat.current;
    if (!el || reduced) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [shown.length, typing, reduced]);

  const lastTime = shown.length ? shown[shown.length - 1].time : "8:00";
  const subtitle = typing ? "typing…" : prettyPhone(businessNumber) || "online";

  return (
    <div
      className="relative h-full max-h-[600px] w-auto"
      style={{ aspectRatio: "296 / 600" }}
      role="img"
      aria-label="The Freyr agent on WhatsApp: a morning brief, a voice note, a PDF, a chart, an approved change and a forwarded call"
    >
      <style>{`
        @keyframes waMsgIn { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: none; } }
        .wa-msg-in { animation: waMsgIn .26s cubic-bezier(.22,1,.36,1) both; transform-origin: bottom; }
        @keyframes waDot { 0%, 60%, 100% { opacity: .35; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2.5px); } }
        .wa-dot { animation: waDot 1.1s ease-in-out infinite; }
        @keyframes waRec { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }
        .wa-rec { animation: waRec 1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .wa-msg-in, .wa-dot, .wa-rec { animation: none; } }
      `}</style>
      {/* Side buttons, then the titanium frame. */}
      <span className="absolute -left-[3px] top-[18%] h-[7%] w-[3px] rounded-l-full bg-[#2c2c2e]" aria-hidden="true" />
      <span className="absolute -left-[3px] top-[28%] h-[11%] w-[3px] rounded-l-full bg-[#2c2c2e]" aria-hidden="true" />
      <span className="absolute -right-[3px] top-[26%] h-[15%] w-[3px] rounded-r-full bg-[#2c2c2e]" aria-hidden="true" />
      <div className="flex h-full w-full flex-col rounded-[50px] bg-[#1C1C1E] p-[9px] shadow-[0_0_0_1.5px_#3A3A3C,0_30px_60px_-18px_rgba(15,40,90,0.45),0_12px_24px_-12px_rgba(15,40,90,0.3)]">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[41px] bg-[#F6F6F6] font-sans">
          <StatusBar time={lastTime} />
          {/* Chat header: back, Freyr's logo and number, call buttons. */}
          <div className="flex items-center gap-2 border-b border-black/[0.08] bg-[#F6F6F6] px-3 pb-2 pt-1">
            <svg width="10" height="17" viewBox="0 0 10 17" aria-hidden="true" className="shrink-0"><path d="M8.5 1.5 1.5 8.5l7 7" fill="none" stroke="#111B21" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/freyr-mark.png" alt="" width={30} height={30} className="h-[30px] w-[30px] shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[12.5px] font-semibold text-[#111B21]">Freyr</p>
              <p className="h-[13px] truncate text-[10px] text-[#667781]">{subtitle}</p>
            </div>
            <svg width="19" height="13" viewBox="0 0 20 14" aria-hidden="true" className="shrink-0"><rect x="1" y="1.5" width="12" height="11" rx="2.6" fill="none" stroke="#111B21" strokeWidth="1.6" /><path d="M13 5.6l5.1-3v8.8L13 8.4z" fill="none" stroke="#111B21" strokeWidth="1.6" strokeLinejoin="round" /></svg>
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" className="ml-2.5 shrink-0"><path d="M4.2 1.5 6 5.3c.2.4.1.9-.2 1.2l-1 1c.9 1.8 2.3 3.2 4.1 4.1l1-1c.3-.3.8-.4 1.2-.2l3.8 1.8c.4.2.6.6.5 1l-.4 1.8c-.1.5-.5.8-1 .8C7 15.8.2 9 .2 1.1c0-.5.3-.9.8-1L2.8 0c.4-.1.9.1 1.1.5z" fill="none" stroke="#111B21" strokeWidth="1.4" strokeLinejoin="round" /></svg>
          </div>
          {/* The thread, on WhatsApp's wallpaper. */}
          <div
            ref={chat}
            className={`min-h-0 flex-1 bg-[#EFEAE2] px-[9px] pb-2 transition-opacity duration-500 ${reduced ? "overflow-y-auto" : "overflow-hidden"} ${fading ? "opacity-0" : "opacity-100"}`}
            style={{ backgroundImage: WALLPAPER }}
          >
            <p className="mx-auto mb-2 mt-2.5 w-fit rounded-[7px] bg-white/90 px-2 py-[3px] text-[9.5px] font-medium text-[#54656F] shadow-[0_1px_0.5px_rgba(11,20,26,0.08)]">Today</p>
            <div className="flex flex-col">
              {shown.map((msg, i) => {
                const first = i === 0 || shown[i - 1].from !== msg.from;
                return (
                  <div key={i} className={first && i > 0 ? "mt-[7px]" : i > 0 ? "mt-[2px]" : ""}>
                    <Bubble msg={msg} first={first} read={msg.from === "me" && i < readUpTo} />
                  </div>
                );
              })}
              {typing && (
                <div className={shown.length && shown[shown.length - 1].from === "agent" ? "mt-[2px]" : "mt-[7px]"}>
                  <TypingBubble />
                </div>
              )}
            </div>
          </div>
          {/* Composer: what the person is typing or recording right now. */}
          <div className="flex items-center gap-2 bg-[#F6F6F6] px-2.5 pb-[18px] pt-[7px]">
            {recording !== null ? (
              <>
                <span className="wa-rec h-[9px] w-[9px] shrink-0 rounded-full bg-[#FF3B30]" aria-hidden="true" />
                <span className="w-8 text-[11.5px] tabular-nums text-[#111B21]">0:{String(recording).padStart(2, "0")}</span>
                <span className="flex-1 text-center text-[10.5px] text-[#8696A0]">‹ Slide to cancel</span>
                <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[#1DAA61] text-white" aria-hidden="true">
                  <Mic size={15} strokeWidth={2.3} />
                </span>
              </>
            ) : (
              <>
                <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0"><path d="M9 2v14M2 9h14" stroke="#111B21" strokeWidth="1.7" strokeLinecap="round" /></svg>
                <span className="flex min-h-[28px] min-w-0 flex-1 items-center rounded-[16px] border border-black/[0.1] bg-white px-2.5 py-1 text-[11px] leading-[14px] text-[#111B21]">
                  <span className="min-w-0 break-words">{draft}</span>
                  {draft && <span className="ml-[1px] inline-block h-[13px] w-[1.5px] shrink-0 animate-pulse bg-[#1DAA61]" aria-hidden="true" />}
                </span>
                {draft ? (
                  <span className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-full bg-[#1DAA61]" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 14 14"><path d="M7 12V2M2.5 6.5 7 2l4.5 4.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                ) : (
                  <>
                    <svg width="18" height="15" viewBox="0 0 20 16" aria-hidden="true" className="shrink-0"><path d="M2 4.5c0-.8.7-1.5 1.5-1.5h2.3L7 1h6l1.2 2h2.3c.8 0 1.5.7 1.5 1.5v8.5c0 .8-.7 1.5-1.5 1.5h-13C2.7 14.5 2 13.8 2 13z" fill="none" stroke="#111B21" strokeWidth="1.5" strokeLinejoin="round" /><circle cx="10" cy="8.5" r="3" fill="none" stroke="#111B21" strokeWidth="1.5" /></svg>
                    <Mic size={17} strokeWidth={1.8} className="shrink-0 text-[#111B21]" aria-hidden="true" />
                  </>
                )}
              </>
            )}
          </div>
          <span className="pointer-events-none absolute bottom-[6px] left-1/2 h-[4px] w-[34%] -translate-x-1/2 rounded-full bg-black" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
