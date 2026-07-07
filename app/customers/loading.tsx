import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Card";

export default function CustomersLoading() {
  return (
    <div>
      <Skeleton className="h-7 w-40 mb-2" />
      <Skeleton className="h-4 w-72 mb-6" />
      <div className="flex gap-3 mb-6">
        <Skeleton className="h-10 w-[320px]" />
        <Skeleton className="h-10 w-48" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <div className="flex items-center justify-between mb-3">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-5 w-12" />
            </div>
            <Skeleton className="h-3 w-28 mb-5" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
