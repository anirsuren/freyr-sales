import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Card";

// Mirrors the offering detail (back link + header + cards) for a seamless load,
// matching the skeletons on customers/[id] and contacts/[id].
export default function OfferingDetailLoading() {
  return (
    <div className="max-w-[900px]">
      <Skeleton className="h-4 w-28 mb-4" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <Skeleton className="h-6 w-40 mb-2" />
          <Skeleton className="h-8 w-72" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        {[...Array(2)].map((_, i) => (
          <Card key={i}>
            <Skeleton className="h-3 w-40 mb-4" />
            <div className="flex flex-wrap gap-2">
              {[...Array(5)].map((_, j) => (
                <Skeleton key={j} className="h-7 w-16" />
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <Skeleton className="h-3 w-32 mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}
