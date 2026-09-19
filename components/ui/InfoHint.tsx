import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";

/** Turn the app's plain-text help copy into something a rep can scan.
 *
 * Help text is intentionally still authored as a string so labels stay cheap
 * to add. The renderer supplies the hierarchy every question-mark popup needs:
 * newline-separated ideas become separate rows, short `Label: explanation`
 * prefixes become bold headings, and dense prose is split at sentence
 * boundaries instead of becoming one grey wall of text. */
function HintCopy({ text }: { text: string }) {
  const sourceLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const lines = sourceLines.flatMap((line) => {
    if (sourceLines.length > 1 || line.length < 150) return [line];
    return line.split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/).filter(Boolean);
  });

  return (
    <span className="block min-w-[220px] max-w-[280px] space-y-2">
      {lines.map((line, index) => {
        const colon = line.indexOf(":");
        const heading = colon > 0 ? line.slice(0, colon).trim() : "";
        const hasHeading =
          colon > 0 && colon <= 34 && heading.split(/\s+/).length <= 5;
        return (
          <span key={`${index}-${line}`} className="block">
            {hasHeading ? (
              <>
                <span className="block font-semibold leading-4 text-text-primary">
                  {heading}
                </span>
                <span className="mt-0.5 block leading-[1.4] text-text-secondary">
                  {line.slice(colon + 1).trim()}
                </span>
              </>
            ) : (
              <span className="block leading-[1.4] text-text-secondary">
                {line}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

// A small "?" with a plain-English explanation on hover/focus. Tooltip owns
// viewport-aware placement so hints remain fully visible beside every edge.
export function InfoHint({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip label={<HintCopy text={text} />} className={className}>
      <button
        type="button"
        aria-label={text}
        className={cn(
          "inline-flex h-4 w-4 items-center justify-center rounded text-text-tertiary outline-none cursor-pointer",
          "hover:text-blue-primary focus-visible:text-blue-primary focus-visible:ring-2 focus-visible:ring-blue-primary/25"
        )}
      >
        <HelpCircle size={13} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
