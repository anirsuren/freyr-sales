import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Card";

export default function CustomerDetailLoading() {
  return (
    <div>
      <Skeleton className="h-7 w-72 mb-2" />
      <Skeleton className="h-4 w-40 mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <Skeleton className="h-5 w-40 mb-4" />
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </Card>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <Skeleton className="h-5 w-48 mb-2" />
              <Skeleton className="h-3 w-32" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
