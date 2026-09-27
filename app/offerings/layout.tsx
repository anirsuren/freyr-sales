import type { ReactNode } from "react";

/**
 * THE FONT TRIAL LIVES HERE FIRST (Anir, Sep 26: "just on one page, for
 * example, let's say the offering page"). Everything under /offerings
 * renders in the person's chosen font preset; the rest of the app stays on
 * the system font until the choice is judged. Widening the trial is moving
 * this one class to the app shell.
 */
export default function OfferingsLayout({ children }: { children: ReactNode }) {
  return <div className="font-preset-scope">{children}</div>;
}
