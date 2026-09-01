import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getRole } from "@/lib/role";
import { viewerAccessMap } from "@/lib/viewerAccess";
import { moduleForPath, PRIVILEGE_MODULES, type Access } from "@/lib/privileges";
import { canAccessModule } from "@/lib/moduleAccess";
import { canManageOfferings } from "@/lib/role";

export const dynamic = "force-dynamic";

/**
 * WHAT AM I ALLOWED TO DO ON THIS PAGE?
 *
 * Anir, Aug 31: "if I'm at the top of a page, I want to see on this page what
 * my edit access is... like a question mark, not actually a question mark. When
 * I hover over it I can see what my permissions are on this page. I want that
 * on every single page, depending on my account."
 *
 * The app has always known the answer and never said it out loud: a control was
 * simply there or simply missing, and a person refused a save had no way to
 * learn whether that was their account or a bug. One endpoint, asked by the top
 * bar on every route, so the answer comes from the SAME resolver the guards use
 * rather than a second opinion that can drift from the first.
 *
 * It reports and never decides. Nothing here grants anything.
 */

/** The lower of two levels, so a cap can never hand somebody MORE than they had. */
function weaker(a: Access, b: Access): Access {
  const order: Access[] = ["none", "view", "edit", "create"];
  return order.indexOf(a) <= order.indexOf(b) ? a : b;
}

/** Plain English, in the person's own case. No jargon, no privilege ids. */
function explain(level: Access, moduleLabel: string): {
  headline: string;
  detail: string;
} {
  switch (level) {
    case "create":
      return {
        headline: "You can add, change and remove",
        detail: `You have full use of ${moduleLabel}: make new records, edit any of them, and delete them.`,
      };
    case "edit":
      return {
        headline: "You can change, but not add or remove",
        detail: `You can edit records in ${moduleLabel}. Making a new one and deleting one are an owner's to do.`,
      };
    case "view":
      return {
        headline: "You can look, but not change",
        detail: `${moduleLabel} is read-only for you. Nothing you do here can alter a record.`,
      };
    default:
      return {
        headline: "Not available on this account",
        detail: `${moduleLabel} is not open to you. If you need it, an admin can grant it in Admin.`,
      };
  }
}

export async function GET(req: NextRequest) {
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path) return NextResponse.json({ known: false });

  const [me, role, access] = await Promise.all([
    getCurrentUser(),
    getRole(),
    viewerAccessMap(),
  ]);

  const key = moduleForPath(path);
  if (!key) {
    /* Settings, notifications, the tour, sign-in: not modules, never gated, and
       a badge claiming otherwise would be a lie on a page that has no rule. */
    return NextResponse.json({ known: false });
  }

  const moduleLabel =
    PRIVILEGE_MODULES.find((m) => m.key === key)?.label ?? "This module";

  /**
   * THE TABLE FIRST, THE ROLE RULES ONLY IF IT CANNOT BE READ — exactly the
   * order every guard uses (viewerAccess returns null only when the store is
   * unreachable). Reading it any other way here would let the badge disagree
   * with the buttons around it, which is worse than no badge.
   */
  const fromTable: Access = access
    ? (access[key] ?? "none")
    : canAccessModule(path, role)
      ? "edit"
      : "none";

  /**
   * EVERY GATE THE SAVE PASSES THROUGH, NOT JUST THE FIRST ONE.
   *
   * Offerings and FDL Components carry a SECOND gate the privilege table knows
   * nothing about: canManageOfferings(), which asks the ROLE and admits only an
   * admin or a BD Owner. Every write endpoint for both modules sits behind it,
   * and app/offerings/page.tsx already asks both before drawing its create
   * button, "so the control is on screen exactly when it works".
   *
   * This badge was asking only the table, so a BD Member holding the BO Owner
   * privilege — whose row says Create, and whose whole job this is — was told
   * "You can add, change and remove" on a page with no create button, and got
   * 403 "View only: admin access required" from the API if they found another
   * way to ask. Proven all four ways on Sep 1, signing in as each.
   *
   * Whether that person SHOULD be able to create an offering is Anir's call and
   * nothing here decides it: capping the badge changes nobody's access, it only
   * stops the badge promising what the server refuses. If the answer is that
   * they should, the fix is in canManageOfferings and this cap then does
   * nothing, because the two gates will agree.
   */
  const ROLE_GATED_MODULES: ReadonlySet<string> = new Set([
    "offerings",
    "digital_components",
  ]);
  const level: Access =
    ROLE_GATED_MODULES.has(key) && !(await canManageOfferings())
      ? weaker(fromTable, "view")
      : fromTable;

  const { headline, detail } = explain(level, moduleLabel);

  return NextResponse.json({
    known: true,
    module: moduleLabel,
    level,
    headline,
    detail,
    role,
    person: me.name,
    /* True when the answer came from the role rules because the privilege
       table could not be read — worth saying, so a temporary blip is not
       mistaken for somebody's settings. */
    fallback: !access,
  });
}
