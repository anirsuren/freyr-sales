import { RecordingsWorkspace } from "@/components/recordings/RecordingsWorkspace";
import { EmptyState } from "@/components/ui/EmptyState";
import { Headphones } from "lucide-react";
import { getDataMode } from "@/lib/dataMode";

export const metadata = { title: "Recordings" };
export const dynamic = "force-dynamic";

export default function RecordingsPage() {
  if (getDataMode() === "live") {
    return <EmptyState icon={Headphones} title="No recordings yet" description="Connect your dialer or upload the first call recording to start coaching." />;
  }
  return <RecordingsWorkspace />;
}
