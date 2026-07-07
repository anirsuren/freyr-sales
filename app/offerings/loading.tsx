import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Card";

// Mirrors the offerings list (header + stat strip + filter bar + card grid) so
// navigation feels instant, matching the skeletons on Customers/Dashboard.
export default function OfferingsLoading() {
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb-6">
        <div>
          <Skeleton className="h-7 w-40 mb-2" />
          <Skeleton className="h-4 w-[420px] max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-3 w-20 mb-3" />
            <Skeleton className="h-6 w-10" />
          </Card>
        ))}
      </div>

      <div className="rounded-xl border border-border-light bg-surface/50 p-2.5 mb-4 flex flex-wrap items-center gap-2.5">
        <Skeleton className="h-10 flex-1 min-w-[200px]" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-36" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="p-5">
            <div className="flex items-center justify-between mb-3">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-4" />
            </div>
            <Skeleton className="h-5 w-44 mb-5" />
            <Skeleton className="h-px w-full mb-3" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
