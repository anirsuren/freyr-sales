import { Skeleton } from "@/components/ui/Skeleton";

// Commit navigation immediately while the server resolves access. Keep the
// chat's pane geometry so the tour can follow it without a blank route gap.
export default function AgentLoading() {
  return (
    <div className="flex h-full min-h-[60vh]" aria-busy="true" aria-label="Agent">
      <div className="hidden w-64 shrink-0 border-r border-border-light p-4 md:block">
        <Skeleton className="mb-6 h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 p-6">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <Skeleton className="h-7 w-80 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
    </div>
  );
}
