import Link from "next/link";
import { CheckCircle2, Circle, Rocket, ShieldCheck } from "lucide-react";
import { getDb } from "@/lib/db";
import { getDataMode } from "@/lib/dataMode";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { listOfferings } from "@/lib/offerings";

export const metadata = { title: "Get started" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const db = getDb();
  const [customers, contacts, sessions, offerings] = await Promise.all([db.customers.list(), db.contacts.list(), db.pitchSessions.list(), Promise.resolve(listOfferings())]);
  const clean = getDataMode() === "live";
  const steps = [
    { title: "Choose your workspace", description: clean ? "Clean workspace is active." : "Mock mode is active. Explore it, then switch to Clean mode before loading real data.", href: "/settings", done: clean, action: "Open workspace settings" },
    { title: "Confirm your profile", description: "Add your name, title, email signature, and notification preferences.", href: "/settings?tab=profile", done: false, action: "Complete profile" },
    { title: "Build the offerings repository", description: "Import the approved workbook or add offerings manually so AI matching uses Freyr’s actual services.", href: "/import", done: offerings.length > 0 && clean, action: offerings.length ? "Review offerings" : "Import offerings" },
    { title: "Import accounts and contacts", description: "Load the approved CRM export or add the first account manually.", href: "/import", done: customers.length > 0 && contacts.length > 0 && clean, action: "Import customer data" },
    { title: "Generate and review the first pitch", description: "Research a prospect, match services, generate outreach, and approve it before sending.", href: "/intake", done: sessions.length > 0 && clean, action: "Start a sales session" },
    { title: "Invite the team and validate access", description: "Freyr IT assigns Microsoft Entra groups; verify a rep, manager, and admin account before launch.", href: "/settings?tab=team", done: false, action: "Review access" },
  ];
  const completed = steps.filter((step) => step.done).length;
  return (
    <div className="max-w-[1000px]">
      <PageHeader title="Welcome to Freyr" subtitle="Set up a secure sales-intelligence workspace your team can trust." />
      <Card className="mb-5 bg-gradient-to-br from-blue-light to-white">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <span className="w-12 h-12 rounded-xl bg-blue-primary text-white flex items-center justify-center"><Rocket size={22} /></span>
          <div className="flex-1"><h2 className="text-[17px] font-semibold">Launch readiness</h2><p className="text-[13px] text-text-secondary mt-1">{completed} of {steps.length} setup milestones complete</p><div className="h-2 bg-white rounded-full mt-3 overflow-hidden"><div className="h-full bg-blue-primary rounded-full" style={{ width: `${Math.round(completed / steps.length * 100)}%` }} /></div></div>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-primary"><ShieldCheck size={16} /> Human approval required to send</span>
        </div>
      </Card>
      <div className="space-y-3">
        {steps.map((step, index) => <Card key={step.title} className="flex items-start gap-4">
          {step.done ? <CheckCircle2 size={22} className="text-success shrink-0 mt-0.5" /> : <Circle size={22} className="text-text-tertiary shrink-0 mt-0.5" />}
          <div className="flex-1"><p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wide">Step {index + 1}</p><h2 className="text-[15px] font-semibold mt-0.5">{step.title}</h2><p className="text-[13px] text-text-secondary mt-1 leading-relaxed">{step.description}</p></div>
          <Link href={step.href} className="shrink-0 text-[13px] font-semibold text-blue-primary hover:underline">{step.action} →</Link>
        </Card>)}
      </div>
    </div>
  );
}
