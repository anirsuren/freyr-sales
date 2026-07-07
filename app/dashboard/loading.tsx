import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Card";

export default function DashboardLoading() {
  return (
    <div>
      <Skeleton className="h-7 w-64 mb-2" />
      <Skeleton className="h-4 w-80 mb-8" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-10">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <Skeleton className="h-3 w-24 mb-3" />
            <Skeleton className="h-7 w-16" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Skeleton className="h-5 w-40 mb-4" />
          <Card className="p-0">
            <div className="p-5 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          </Card>
        </div>
        <div>
          <Skeleton className="h-5 w-40 mb-4" />
          <Card className="p-0">
            <div className="p-5 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
