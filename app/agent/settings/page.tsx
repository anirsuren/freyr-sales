import { PageHeader } from "@/components/layout/PageHeader";
import { AgentPreferences } from "@/components/agent/AgentPreferences";
import { SnippetLibrary } from "@/components/agent/SnippetLibrary";

export const metadata = { title: "Agent Settings" };
export const dynamic = "force-dynamic";

// Agent settings — the agent's standing config, off the main console so the home
// stays focused on directing the agent and seeing its work.
export default function AgentSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent settings"
        subtitle="How the agent works for you — its focus, voice, autopilot rules, and saved snippets."
      />
      <AgentPreferences />
      <SnippetLibrary />
    </div>
  );
}
