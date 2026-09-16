import { RecordingsWorkspace } from "@/components/recordings/RecordingsWorkspace";
import { getDataMode } from "@/lib/dataMode";
export const metadata = { title: "Recordings" };
export default function RecordingsPage() { return <RecordingsWorkspace empty={getDataMode() === "live"} />; }
