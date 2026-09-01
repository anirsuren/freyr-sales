import Link from "next/link";
import { Compass, LayoutDashboard, Package } from "lucide-react";
import { getDataMode } from "@/lib/dataMode";
import { getHomePath, isOfferingsOnly } from "@/lib/release";

export const metadata = { title: "Page not found" };

// Branded 404 — a stale offering link, a removed record, or a typo'd URL all
// land here. Plain-English, with a way back, instead of Next's bare default.
export default function NotFound() {
  /* THE WAY BACK HAS TO GO SOMEWHERE. In Real mode /dashboard is not released,
     so the primary button bounced through the gate and landed on Offerings —
     the same place as the button beside it, while promising a page the reader
     never got. getHomePath is the one answer to "where does home live in this
     mode", the same one the logo in the rail uses. */
  const dataMode = getDataMode();
  const home = getHomePath(dataMode);
  const homeIsOfferings = isOfferingsOnly(dataMode);
  return (
    <div className="flex flex-col items-center justify-center text-center min-h-[70vh] px-6">
      <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-light text-blue-primary mb-5">
        <Compass size={26} strokeWidth={1.6} />
      </span>
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
        Error 404
      </p>
      <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-text-primary mt-1.5">
        We couldn&apos;t find that page
      </h1>
      <p className="text-[14px] text-text-secondary mt-2 max-w-[420px] leading-relaxed">
        The link may be out of date, or the record was moved or removed. Let&apos;s
        get you back on track.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
        <Link
          href={home}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-md px-4 py-2.5 bg-blue-primary text-white hover:bg-blue-hover transition-colors"
        >
          {homeIsOfferings ? (
            <>
              <Package size={15} strokeWidth={1.8} /> Back to offerings
            </>
          ) : (
            <>
              <LayoutDashboard size={15} strokeWidth={1.9} /> Back to dashboard
            </>
          )}
        </Link>
        {/* Two buttons to the same page is one button wearing a disguise, so
            the second one only appears when it is somewhere else to go. */}
        {!homeIsOfferings && (
          <Link
            href="/offerings"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-md px-4 py-2.5 bg-white border border-border text-text-primary hover:bg-surface transition-colors"
          >
            <Package size={15} strokeWidth={1.8} /> Browse offerings
          </Link>
        )}
      </div>
    </div>
  );
}
