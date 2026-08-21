import Link from "next/link";
import { Layers, Package, Users } from "lucide-react";

/**
 * THE GLOSSARY BAR — one slim line where five stat cards used to be.
 *
 * From Saras, on the rep feedback (Aug 21, relayed by Anir): four or five
 * reps said this page reads as busy and over-coloured, and asked for
 * something more minimal. Her proposal, taken as-is: "can we actually remove
 * all of these five boxes... using 31 offerings here, that's already visible.
 * For these three, instead of this box saying Manage, we can maybe have a
 * small bar here just saying Glossary... it will show Offering types (7),
 * Categories (7), Customer types (15). The numbers are clickable."
 *
 * The offerings count went because the list under it already says "Showing 31
 * of 31 offerings" — the tile was the same fact, in a bigger box, one line
 * higher. What is left is the part that was never a statistic at all: three
 * master lists people need to reach, with the size of each so the link is
 * worth reading. It replaces the Manage menu, so the lists are one click
 * closer than they were, not further.
 */
const ENTRIES = [
  {
    href: "/offerings/offering-types",
    label: "Offering types",
    icon: Package,
    color: "#0071E3",
  },
  {
    href: "/offerings/offering-categories",
    label: "Categories",
    icon: Layers,
    color: "#7C3AED",
  },
  {
    href: "/offerings/customer-types",
    label: "Customer types",
    icon: Users,
    color: "#0891B2",
  },
] as const;

export function OfferingsGlossaryBar({
  offeringTypes,
  offeringCategories,
  customerTypes,
}: {
  offeringTypes: number;
  offeringCategories: number;
  customerTypes: number;
}) {
  const counts = [offeringTypes, offeringCategories, customerTypes];
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-1 gap-y-2 rounded-xl border border-border-light bg-white px-3 py-2">
      <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
        Glossary
      </span>
      {ENTRIES.map((entry, i) => {
        const Icon = entry.icon;
        return (
          <Link
            key={entry.href}
            href={entry.href}
            className="group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
          >
            {/* The icon carries the colour, so the row keeps one identity per
                list without the page turning into a wall of tinted boxes —
                which is the complaint this bar answers. */}
            <Icon
              size={13}
              strokeWidth={2.2}
              aria-hidden="true"
              style={{ color: entry.color }}
            />
            {entry.label}
            <b className="font-semibold text-text-primary tnum group-hover:text-blue-primary">
              {counts[i]}
            </b>
          </Link>
        );
      })}
    </div>
  );
}
