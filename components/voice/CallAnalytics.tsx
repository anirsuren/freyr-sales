"use client";

import {
  Activity,
  MessageSquareText,
  ShieldAlert,
  Milestone,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { AreaChart, DonutChart, DonutLegend } from "@/components/charts/Charts";
import { ChartInspector } from "@/components/charts/ChartInspector";
import { Tooltip } from "@/components/ui/Tooltip";

type Turn = { role: "agent" | "user"; message: string; time?: number };

const formatOffset = (seconds?: number) =>
  typeof seconds === "number"
    ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds) % 60).padStart(2, "0")}`
    : "";

// Everything a rep would want from the AI's read of a call, derived from the
// transcript (Suren: sentiment analysis, a sentiment heat-map/line, objections,
// a timeline, graphs of how the call went — below the transcript). Deterministic
// so the same call always reads the same way.
const POS = [
  "great", "yes", "interested", "sounds good", "helpful", "thanks", "thank",
  "sure", "definitely", "perfect", "love", "makes sense", "absolutely", "good",
  "appreciate", "works", "let's", "happy to", "look forward",
];
const NEG = [
  "no ", "not ", "n't", "expensive", "busy", "already", "concern", "problem",
  "unfortunately", "can't", "won't", "too much", "budget", "later", "incumbent",
  "hesitant", "not sure", "don't", "hold off", "pass",
];
const OBJECTION_HINTS = [
  "expensive", "cost", "budget", "price", "already", "incumbent", "existing",
  "busy", "time", "later", "not sure", "concern", "risk", "hesitant", "think about",
  "who else", "competitor", "contract",
];

function scoreTurn(text: string): number {
  const t = text.toLowerCase();
  let s = 0;
  for (const p of POS) if (t.includes(p)) s += 1;
  for (const n of NEG) if (t.includes(n)) s -= 1;
  // Map to 0..100 with 50 = neutral.
  return Math.max(0, Math.min(100, 50 + s * 16));
}

export function CallAnalytics({
  turns,
  outcome,
  agentLabel,
  contactFirst,
  personaColor = "#0071E3",
}: {
  turns: Turn[];
  outcome: string | null;
  agentLabel: string;
  contactFirst: string;
  personaColor?: string;
}) {
  if (turns.length === 0) return null;

  // Per-turn sentiment (0..100). Blend the keyword score with a gentle drift
  // toward the final outcome so the arc reads believably.
  const drift =
    outcome === "interested" || outcome === "meeting_booked"
      ? 1
      : outcome === "not_interested" || outcome === "declined"
      ? -1
      : 0;
  const sentiment = turns.map((t, i) => {
    const base = scoreTurn(t.message);
    const arc = drift * (i / Math.max(1, turns.length - 1)) * 18;
    return Math.max(4, Math.min(100, Math.round(base + arc)));
  });
  // Each sentiment point is a turn — name who spoke and quote what they said.
  const sentimentTips = turns.map((t) => [
    {
      name: t.role === "agent" ? agentLabel : contactFirst,
      sub: t.message.slice(0, 80),
      value: formatOffset(t.time) || undefined,
    },
  ]);
  const overall = Math.round(sentiment.reduce((s, v) => s + v, 0) / sentiment.length);
  const overallBand =
    overall >= 62 ? "Positive" : overall >= 45 ? "Neutral" : "Negative";
  const overallColor =
    overall >= 62 ? "#1A7A35" : overall >= 45 ? "#B45309" : "#B02020";

  // Talk ratio (words spoken).
  const words = (arr: Turn[]) =>
    arr.reduce((s, t) => s + t.message.trim().split(/\s+/).filter(Boolean).length, 0);
  const agentWords = words(turns.filter((t) => t.role === "agent"));
  const contactWords = words(turns.filter((t) => t.role === "user"));
  const talkRatio = [
    {
      label: agentLabel,
      value: agentWords,
      color: personaColor,
      tip: [{
        name: `${agentLabel} · AI agent`,
        sub: `${agentWords} words spoken`,
        value: `${Math.round((agentWords / Math.max(1, agentWords + contactWords)) * 100)}%`,
      }],
    },
    {
      label: contactFirst,
      value: contactWords,
      color: "#8B5CF6",
      tip: [{
        name: contactFirst,
        sub: `${contactWords} words spoken`,
        value: `${Math.round((contactWords / Math.max(1, agentWords + contactWords)) * 100)}%`,
      }],
    },
  ].filter((s) => s.value > 0);

  // Objections raised by the contact.
  const objections = turns
    .filter((t) => t.role === "user")
    .filter((t) => OBJECTION_HINTS.some((h) => t.message.toLowerCase().includes(h)))
    .map((t) => t.message.trim())
    .slice(0, 5);

  // Key moments — first opening, discovery, first objection, and the close.
  const moments: { label: string; turn: number; color: string }[] = [];
  moments.push({ label: "Opening", turn: 1, color: personaColor });
  const firstUser = turns.findIndex((t) => t.role === "user");
  if (firstUser >= 0) moments.push({ label: "Discovery", turn: firstUser + 1, color: "#8B5CF6" });
  const firstObj = turns.findIndex(
    (t) => t.role === "user" && OBJECTION_HINTS.some((h) => t.message.toLowerCase().includes(h))
  );
  if (firstObj >= 0) moments.push({ label: "Objection", turn: firstObj + 1, color: "#F97316" });
  moments.push({
    label: outcome === "interested" || outcome === "meeting_booked" ? "Next step agreed" : "Wrap-up",
    turn: turns.length,
    color: drift > 0 ? "#1A7A35" : "#64748B",
  });

  const TrendIcon = overall >= 62 ? TrendingUp : overall >= 45 ? Minus : TrendingDown;
  const turnRecords = turns.map((turn, index) => ({
    id: `turn-${index}`,
    label: turn.role === "agent" ? agentLabel : contactFirst,
    meta: turn.message,
    value: formatOffset(turn.time) || `Turn ${index + 1}`,
    avatar: turn.role === "agent" ? agentLabel : contactFirst,
  }));

  const stats = [
    { icon: Activity, label: "Overall sentiment", value: overallBand, color: overallColor },
    {
      icon: MessageSquareText,
      label: "Talk ratio",
      value: `${Math.round((agentWords / Math.max(1, agentWords + contactWords)) * 100)}% agent`,
    },
    { icon: ShieldAlert, label: "Objections", value: String(objections.length) },
    { icon: Milestone, label: "Turns", value: String(turns.length) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-[17px] font-semibold text-text-primary">Call analysis</h2>
        <span
          className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-full"
          style={{ color: overallColor, background: `${overallColor}18` }}
        >
          <TrendIcon size={13} strokeWidth={2.2} />
          {overallBand}
        </span>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="h-[104px] flex flex-col justify-between">
              <span
                className="w-8 h-8 rounded-md flex items-center justify-center"
                style={{ color: s.color || "#0071E3", background: `${s.color || "#0071E3"}14` }}
              >
                <Icon size={16} strokeWidth={1.9} />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  {s.label}
                </p>
                <p
                  className="text-[20px] font-bold tnum leading-none mt-1"
                  style={s.color ? { color: s.color } : undefined}
                >
                  {s.value}
                </p>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6 items-stretch">
        {/* Sentiment over the call — a line + a per-turn heat-map strip. */}
        <ChartInspector
          title="Sentiment through the call"
          description="How the mood moved, turn by turn — higher is warmer."
          records={turnRecords}
          searchPlaceholder="Search transcript..."
          expandedChildren={
            <AreaChart
              data={sentiment}
              height={390}
              color={overallColor}
              format="number"
              unit="score"
              yMax={100}
              xLabels={turns.map((turn, i) => formatOffset(turn.time) || `Turn ${i + 1}`)}
              pointTips={sentimentTips}
              className="w-full"
            />
          }
        >
          <AreaChart
            data={sentiment}
            height={190}
            color={overallColor}
            format="number"
            unit="score"
            yMax={100}
            xLabels={turns.map((turn, i) => formatOffset(turn.time) || `Turn ${i + 1}`)}
            pointTips={sentimentTips}
            className="w-full"
          />
          <div className="mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
              Turn-by-turn heat map
            </p>
            <div className="flex gap-0.5">
              {sentiment.map((v, i) => {
                const turn = turns[i];
                const band = v >= 62 ? "Positive" : v >= 45 ? "Neutral" : "Negative";
                return (
                  <Tooltip
                    key={i}
                    delayMs={0}
                    label={
                      <span className="block min-w-[220px]">
                        <span className="flex items-center justify-between gap-3">
                          <span className="font-semibold">
                            {turn.role === "agent" ? agentLabel : contactFirst}
                          </span>
                          <span className="tnum">{formatOffset(turn.time) || `Turn ${i + 1}`}</span>
                        </span>
                        <span className="mt-1 flex items-center justify-between gap-3 text-white/75">
                          <span>{band} sentiment</span>
                          <span className="font-semibold text-white tnum">{v}/100</span>
                        </span>
                        <span className="mt-2 block border-t border-white/15 pt-2 text-white/85">
                          {turn.message}
                        </span>
                      </span>
                    }
                    className="flex-1"
                  >
                    <span
                      className="block h-5 min-w-[3px] rounded-[3px] transition-transform hover:scale-y-125"
                      style={{
                        background:
                          v >= 62 ? "#34C759" : v >= 45 ? "#FFCC00" : "#FF453A",
                        opacity: 0.35 + (Math.abs(v - 50) / 50) * 0.65,
                      }}
                    />
                  </Tooltip>
                );
              })}
            </div>
          </div>
        </ChartInspector>

        {/* Talk ratio donut. */}
        <ChartInspector
          title="Who did the talking"
          description="Share of words spoken."
          expandedChildren={
            <div className="flex items-center justify-center gap-10 py-5">
              <DonutChart
                segments={talkRatio}
                size={280}
                thickness={28}
                centerLabel={`${Math.round((agentWords / Math.max(1, agentWords + contactWords)) * 100)}%`}
                centerSub="agent"
              />
              <DonutLegend items={talkRatio} className="max-w-[320px]" />
            </div>
          }
        >
          {talkRatio.length > 0 ? (
            <div className="flex-1 flex items-center gap-4">
              <DonutChart
                segments={talkRatio}
                size={150}
                thickness={16}
                centerLabel={`${Math.round((agentWords / Math.max(1, agentWords + contactWords)) * 100)}%`}
                centerSub="agent"
              />
              <DonutLegend items={talkRatio} />
            </div>
          ) : (
            <p className="flex-1 flex items-center text-[13px] text-text-tertiary">
              Not enough dialogue to measure.
            </p>
          )}
        </ChartInspector>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Objections. */}
        <Card className="flex flex-col">
          <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-text-primary mb-1">
            <ShieldAlert size={16} strokeWidth={1.9} className="text-warning" />
            Objections raised
          </h3>
          <p className="text-[12px] text-text-tertiary mb-3">
            What {contactFirst} pushed back on — handle these next time.
          </p>
          {objections.length > 0 ? (
            <ul className="space-y-2">
              {objections.map((o, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-[13px] text-text-secondary bg-surface rounded-lg px-3 py-2 leading-snug"
                >
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
                  <span>&ldquo;{o}&rdquo;</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex-1 flex items-center text-[13px] text-text-tertiary">
              No clear objections — a smooth conversation.
            </p>
          )}
        </Card>

        {/* Key-moments timeline. */}
        <Card className="flex flex-col">
          <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-text-primary mb-1">
            <Milestone size={16} strokeWidth={1.9} className="text-blue-primary" />
            Call timeline
          </h3>
          <p className="text-[12px] text-text-tertiary mb-4">The shape of the conversation.</p>
          <ol className="relative border-l border-border-light ml-1.5 space-y-4">
            {moments.map((m, i) => (
              <li key={i} className="pl-4 relative">
                <span
                  className="absolute -left-[7px] top-0.5 w-3 h-3 rounded-full ring-2 ring-white"
                  style={{ background: m.color }}
                />
                <p className="text-[13px] font-semibold text-text-primary leading-none">
                  {m.label}
                </p>
                <p className="text-[11.5px] text-text-tertiary mt-1">
                  {formatOffset(turns[m.turn - 1]?.time) || `Turn ${m.turn}`}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
