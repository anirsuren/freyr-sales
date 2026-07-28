import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Card";

// Settings is force-dynamic and reads the workspace book on every visit, so
// without a loading boundary a click on "Settings" (top-right account menu,
// sidebar) left the rep staring at the page they were already on until the
// server render came back — the same "it takes a while for it to actually take
// me there" complaint the notification links were fixed for. The boundary hands
// the navigation back immediately and the real page streams in behind it.
export default function SettingsLoading() {
  return (
    <div>
      <Skeleton className="mb-2 h-7 w-40" />
      <Skeleton className="mb-6 h-4 w-[420px]" />
      <div className="grid max-w-[1280px] grid-cols-[220px_minmax(0,1fr)] gap-7">
        <aside className="border-r border-border-light pr-5">
          <Skeleton className="mb-3 h-3 w-32" />
          <div className="space-y-2">
            {[...Array(6)].map((_, index) => (
              <Skeleton key={index} className="h-11 w-full" />
            ))}
          </div>
        </aside>
        <section className="min-w-0">
          <div className="mb-5 border-b border-border-light pb-4">
            <Skeleton className="mb-2 h-5 w-36" />
            <Skeleton className="h-3.5 w-52" />
          </div>
          <div className="mb-5 grid grid-cols-3 gap-3">
            {[...Array(3)].map((_, index) => (
              <Card key={index} className="flex items-center gap-3 px-4 py-3.5">
                <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-2.5 w-20" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </Card>
            ))}
          </div>
          <div className="space-y-5">
            {[...Array(3)].map((_, index) => (
              <Card key={index} className="px-5 py-4">
                <Skeleton className="mb-2.5 h-4 w-44" />
                <Skeleton className="h-3.5 w-full max-w-[520px]" />
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
