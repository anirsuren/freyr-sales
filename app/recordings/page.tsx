import { RecordingsWorkspace } from "@/components/recordings/RecordingsWorkspace";

export const metadata = { title: "Recordings" };
export const dynamic = "force-dynamic";

export default function RecordingsPage() {
  return <RecordingsWorkspace />;
}
