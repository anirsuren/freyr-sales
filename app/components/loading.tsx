import { Skeleton } from "@/components/ui/Skeleton";

// A route-level boundary lets Next open this page before catalogue reads finish.
export default function ComponentsLoading() {
  return (
    <div aria-busy="true" aria-label="FDL Components">
      <h1 className="text-2xl font-semibold mb-2">FDL Components</h1>
      <Skeleton className="mb-6 h-4 w-96 max-w-full" />
      <Skeleton className="mb-5 h-14 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="rounded-xl border border-border-light p-5">
            <Skeleton className="mb-4 h-6 w-40" />
            <Skeleton className="mb-6 h-5 w-28" />
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
