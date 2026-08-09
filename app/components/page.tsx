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
    <div className="px-6 py-6">
      <FdlComponentsBrowser
        components={components}
        usedIn={usedIn}
        canEdit={canEdit}
      />
    </div>
  );
}
