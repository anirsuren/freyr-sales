import { initializeLiveOfferings, listFdlComponents } from "@/lib/offerings";
import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { FdlReleaseCalendar } from "@/components/fdl/FdlReleaseCalendar";

export const metadata = { title: "Release calendar" };
export const dynamic = "force-dynamic";

/** One calendar for every component's releases (Suren, Aug 12: "all the
 *  components together, one report" — months across, components down). */
export default async function FdlReleaseCalendarPage() {
  await requireModuleAccess("/components");
  await initializeLiveOfferings().catch(() => undefined);
  return <FdlReleaseCalendar components={listFdlComponents()} />;
}
