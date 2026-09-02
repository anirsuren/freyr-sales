import { Avatar } from "@/components/ui/Avatar";
import { stampedAt } from "@/lib/performanceShared";

/**
 * WHO PUT THIS HERE, AND WHEN — ONE LINE, ONE COMPONENT, EVERY PAGE.
 *
 * Anir, Aug 23: "I need to see who created these FDL components, including the
 * time. Same thing for: Offering, Opportunities, Customers, Team." Five pages
 * asked the same question, so five pages get the same sentence rather than five
 * slightly different ones.
 *
 * NEVER INVENTS AN AUTHOR. Every one of those records predates the field that
 * stores it, so most rows know when they appeared and not who added them. This
 * renders whichever halves exist — "Added by Eswar S. on 23 August 2026 at
 * 6:16 PM", or just "Added 23 August 2026" — and renders nothing at all when
 * neither is recorded. A placeholder name would put a real person against work
 * they may not have done, which is worse than a missing line.
 */
export function CreatedStamp({
  by,
  at,
  verb = "Added",
  className,
}: {
  by?: string | null;
  at?: string | null;
  /** "Added" for things somebody files; "Joined" for a person. */
  verb?: string;
  className?: string;
}) {
  const when = stampedAt(at);
  const who = (by ?? "").trim();
  if (!who && !when) return null;
  return (
    <p
      className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 ${
        className ?? "text-[11.5px] text-text-tertiary"
      }`}
    >
      <span>{verb}</span>
      {who ? (
        <>
          <span>by</span>
          <Avatar name={who} className="h-5 w-5 shrink-0 text-[9px]" />
          <span className="font-semibold text-text-secondary">{who}</span>
        </>
      ) : null}
      {when ? <span>{`${who ? "on " : ""}${when}`}</span> : null}
    </p>
  );
}
