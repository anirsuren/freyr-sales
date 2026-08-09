import { BookOpen, Sparkle, Target, UserRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { InfoHint } from "@/components/ui/InfoHint";
import { Tooltip } from "@/components/ui/Tooltip";
import { OfferingIcon, offeringMark } from "@/components/ui/OfferingIcon";
import type { RecommendedService } from "@/lib/types";

/* ---------------------------------------------------------------------------
   RECOMMENDED SERVICES.

   These were three flat rows, a title, a percentage, an identical blue bar and
   a sentence. Every offering looked like every other offering, and a 70% fit
   was drawn in exactly the same blue as a 50% fit, so the bars carried no
   information you couldn't already read in the number.

   Each offering now wears its OWN mark: the glyph and hue `offeringMark()`
   hands it everywhere else in the app (the forecast donut, the pipeline tags),
   so the same service is the same colour on every screen. The fit bar is drawn
   in that offering's colour on a 12% wash of itself, which means two bars of
   different lengths are also two different colours, the chart reads before the
   number does.
--------------------------------------------------------------------------- */

export function DealServices({
  services,
  kbVersion,
  dealName,
}: {
  services: RecommendedService[];
  kbVersion: number;
  /** The offering this deal is actually named after, so the list can say which
   *  row IS the deal rather than leaving the reader to match strings. */
  dealName: string;
}) {
  return (
    <div>
      {/* This header block is load-bearing for the page's rhythm AND for the
          suite: "Recommended Services" is asserted verbatim. */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">
            Recommended Services
          </h2>
          <p className="mt-0.5 text-[11px] text-text-tertiary">
            What to sell this account, and how strong the fit is
          </p>
        </div>
        {/* The KB badge lives here, next to the recommendations it produced. */}
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-blue-light px-2 py-1 text-[11px] font-semibold text-blue-primary">
          <BookOpen size={12} strokeWidth={1.9} /> KB v{kbVersion}
          <InfoHint text="Which version of the Freyr service list this pitch was built from." />
        </span>
      </div>

      <div className="space-y-3">
        {services.map((s, i) => {
          const name = s.service_name || "Untitled service";
          const pct = Math.max(
            0,
            Math.min(100, Math.round((s.relevance_score || 0) * 10))
          );
          const { color } = offeringMark(name);
          const isThisDeal = name.trim() === dealName.trim();
          const reasons = [
            s.why_this_customer
              ? { Icon: Target, label: "Why this account", text: s.why_this_customer }
              : null,
            s.why_this_contact
              ? { Icon: UserRound, label: "Why this person", text: s.why_this_contact }
              : null,
          ].filter(Boolean) as {
            Icon: typeof Target;
            label: string;
            text: string;
          }[];
          const phrases = (s.freyr_language_to_use || []).slice(0, 4);

          return (
            <Card key={`${name}-${i}`} className="p-4">
              <div className="flex items-start gap-3">
                {/* Every offering carries its mark — no exceptions. */}
                <OfferingIcon name={name} className="h-10 w-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    {/* Wraps to a second line rather than truncating — an
                        offering's name is never "NDA/MAA CMC Writ…". */}
                    <span className="min-w-0 break-normal text-[14px] font-semibold leading-snug text-text-primary">
                      {name}
                    </span>
                    <span
                      className="shrink-0 text-[13px] font-bold leading-snug tnum"
                      style={{ color }}
                    >
                      {pct}%
                    </span>
                  </div>
                  {isThisDeal && (
                    <span
                      className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: `${color}1A`, color }}
                    >
                      <Sparkle size={10} strokeWidth={2.4} />
                      This deal
                    </span>
                  )}
                </div>
              </div>

              {/* The fit bar, in the offering's own colour on a wash of itself.
                  Units at rest: the % is printed above, the label under it. */}
              <Tooltip
                label={`${name} scored ${pct}% against this account's profile: a ${
                  pct >= 80 ? "strong" : pct >= 60 ? "solid" : "partial"
                } fit.`}
                side="top"
                className="mt-3 block w-full cursor-pointer"
              >
                <span className="block w-full">
                  <span
                    className="block h-2 w-full overflow-hidden rounded-full"
                    style={{ background: `${color}1F` }}
                  >
                    <span
                      className="chart-grow-x block h-full rounded-full"
                      style={{ width: `${Math.max(pct, 3)}%`, background: color }}
                    />
                  </span>
                  <span className="mt-1 block text-[10px] font-medium text-text-tertiary">
                    Fit against this account
                  </span>
                </span>
              </Tooltip>

              {s.pitch_angle && (
                <p className="mt-2.5 text-[13px] leading-relaxed text-text-secondary">
                  {s.pitch_angle}
                </p>
              )}

              {reasons.length > 0 && (
                <div className="mt-2.5 space-y-1.5 border-t border-border-light pt-2.5">
                  {reasons.map((r) => (
                    <p
                      key={r.label}
                      className="flex gap-2 text-[12px] leading-relaxed text-text-secondary"
                    >
                      <span
                        className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded"
                        style={{ background: `${color}1A`, color }}
                      >
                        <r.Icon size={10} strokeWidth={2.3} />
                      </span>
                      <span className="min-w-0">
                        <span className="font-semibold text-text-primary">
                          {r.label}:
                        </span>{" "}
                        {r.text}
                      </span>
                    </p>
                  ))}
                </div>
              )}

              {phrases.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {phrases.map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium"
                      style={{ background: `${color}14`, color }}
                    >
                      {p}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
