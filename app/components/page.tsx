import {
  initializeLiveOfferings,
  listFdlComponents,
  listOfferings,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";
import { FdlComponentsBrowser } from "@/components/fdl/FdlComponentsBrowser";

export const dynamic = "force-dynamic";

/**
 * FDL COMPONENTS — Freya Digital components, the module Suren asked for
 * (Aug 8, via Anir): offerings are packages; the software inside them lives
 * here, each component with its own versions and features.
 */
export default async function FdlComponentsPage() {
  await initializeLiveOfferings().catch(() => undefined);
  const components = listFdlComponents();
  const offerings = listOfferings();
  const usedIn: Record<string, string[]> = {};
  for (const offering of offerings) {
    for (const id of offering.component_ids ?? []) {
      (usedIn[id] ??= []).push(offering.offering_name);
    }
  }
  const canEdit = await canManageOfferings();
  return (
    <div>
      {/* No page-level padding: the app shell already wraps every page in p-8,
          so adding px-6 py-6 here stacked a second inset and pushed this
          page's header below every other page's (Anir, Aug 9: "there's so much
          space at the top... whatever you have on the offerings page is good,
          that's how every other page should be mimicked"). */}
      <FdlComponentsBrowser
        components={components}
        usedIn={usedIn}
        canEdit={canEdit}
      />
    </div>
  );
}
