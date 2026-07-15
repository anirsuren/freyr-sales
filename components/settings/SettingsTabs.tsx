"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  UserPlus,
  Check,
  ShieldCheck,
  Lock,
  Mail,
  CalendarDays,
  MessageSquare,
  Building2,
  Link2,
  MousePointer2,
  Settings2,
  UserRound,
  UsersRound,
  Bell,
  PlugZap,
  KeyRound,
  UserCheck,
  UserX,
  Clock3,
  Database,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeSetting } from "@/components/settings/ThemeSetting";
import { CrmSyncCard } from "@/components/settings/CrmSyncCard";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import {
  DEFAULT_HOVER_DELAY_MS,
  MAX_HOVER_DELAY_MS,
  formatHoverDelay,
  saveHoverPreference,
  useHoverPreference,
} from "@/lib/hoverPreferences";

const TABS = [
  { key: "workspace", label: "Workspace", description: "Data and behavior", icon: Settings2 },
  { key: "profile", label: "Profile", description: "Identity and preferences", icon: UserRound },
  { key: "team", label: "Team", description: "Members and invitations", icon: UsersRound },
  { key: "notifications", label: "Notifications", description: "Alerts and digests", icon: Bell },
  { key: "integrations", label: "Integrations", description: "Connected systems", icon: PlugZap },
  { key: "access", label: "Access", description: "Approvals and roles", icon: KeyRound },
] as const;

// Client-facing connectors — tools a rep's org already uses (Anir, Jul 8:
// "integrations shouldn't be client-facing keys — put what THEY would connect").
// Internal service keys (Anthropic/Apify/Telegram) live in .env, not here.
const CONNECTORS = [
  { key: "email", name: "Email", icon: Mail, desc: "Send pitches and sequences from your own inbox — Gmail or Outlook." },
  { key: "calendar", name: "Calendar", icon: CalendarDays, desc: "Booked meetings land straight on your Google or Outlook calendar." },
  { key: "crm", name: "CRM", icon: Building2, desc: "Two-way sync of accounts, contacts and deals with Salesforce or HubSpot." },
  { key: "chat", name: "Slack / Teams", icon: MessageSquare, desc: "Deal alerts and your daily digest, right in your team channel." },
  { key: "linkedin", name: "LinkedIn", icon: Link2, desc: "Enrich contacts and send connection notes without leaving Freyr." },
] as const;

const ROLES = ["Admin", "Manager", "Rep"];
const SSO_PROVIDERS = ["Okta", "Google Workspace", "Azure AD", "SAML 2.0"];
const PERMISSIONS: { cap: string; admin: boolean; manager: boolean; rep: boolean }[] = [
  { cap: "View pipeline & accounts", admin: true, manager: true, rep: true },
  { cap: "Generate & send pitches", admin: true, manager: true, rep: true },
  { cap: "Approve pitches for send", admin: true, manager: true, rep: false },
  { cap: "Edit offerings & sales materials", admin: true, manager: true, rep: false },
  { cap: "Invite or approve teammates", admin: true, manager: false, rep: false },
  { cap: "Configure SSO & security", admin: true, manager: false, rep: false },
];

const SERVICE_LABELS: Record<string, string> = {
  anthropic: "Anthropic — AI analysis & pitch generation",
  supabase: "Supabase — database",
  firecrawl: "Firecrawl — web crawl & scrape",
  apify: "Apify — LinkedIn enrichment",
  telegram: "Telegram — bot notifications",
  email: "Email — Resend / SMTP send channel",
};

type Member = { name: string; email: string; role: string; you?: boolean };
type AccessRole = "admin" | "editor" | "sales";
type AccessDirectory = {
  members: { id: string; name: string; email: string | null; role: AccessRole; active: boolean; lastSeenAt: string | null }[];
  requests: { id: string; name: string; email: string | null; requestedRole: AccessRole; requestedAt: string }[];
  invitations: { id: string; email: string; role: AccessRole; expiresAt: string }[];
};
// The real sales team — mirrors REPS in lib/pipeline.ts (the reps who own deals
// across Forecast/Analytics). Was accidentally seeded with customer CONTACTS
// (Dana Whitfield @ NovaGene, Owen Bradley @ Northwind), which read as if our
// prospects were on staff.
const DEFAULT_TEAM: Member[] = [
  { name: "Suren Dheen", email: "suren.dheen@freyrsolutions.com", role: "Admin", you: true },
  { name: "Mark Miller", email: "mark.miller@freyrsolutions.com", role: "Manager" },
  { name: "Priya Nair", email: "priya.nair@freyrsolutions.com", role: "Rep" },
  { name: "Diego Alvarez", email: "diego.alvarez@freyrsolutions.com", role: "Rep" },
];

const MOCK_ACCESS: AccessDirectory = {
  members: DEFAULT_TEAM.map((member, index) => ({
    id: `member-${index + 1}`,
    name: member.name,
    email: member.email,
    role: member.role === "Admin" ? "admin" : member.role === "Manager" ? "editor" : "sales",
    active: true,
    lastSeenAt: new Date(Date.now() - index * 7200000).toISOString(),
  })),
  requests: [
    {
      id: "request-1",
      name: "Hannah Schmidt",
      email: "hannah.schmidt@freyrsolutions.com",
      requestedRole: "sales",
      requestedAt: new Date(Date.now() - 55 * 60000).toISOString(),
    },
  ],
  invitations: [],
};

const NOTIFS = [
  { key: "newSession", label: "New session created", desc: "When a teammate generates a pitch session." },
  { key: "outcomeLogged", label: "Outcome logged", desc: "When an interaction outcome is recorded." },
  { key: "rottingDeal", label: "Rotting deal alert", desc: "When a deal has no activity for 14+ days." },
  { key: "weeklyDigest", label: "Weekly pipeline digest", desc: "Monday-morning summary email." },
];

function Toggle({
  on,
  onClick,
  label = "Toggle setting",
}: {
  on: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={cn(
        "w-10 h-6 rounded-full transition-colors relative shrink-0",
        on ? "bg-blue-primary" : "bg-border"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
          on ? "left-[18px]" : "left-0.5"
        )}
      />
    </button>
  );
}

export function SettingsTabs({
  services,
  crmCounts,
  initialDataMode,
  authConfig,
}: {
  services: Record<string, boolean>;
  crmCounts: { companies: number; contacts: number; deals: number };
  initialDataMode: "mock" | "live";
  authConfig: { authMode: string; approvalEnabled: boolean };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const requestedTab = searchParams.get("tab");
  const [tab, setTab] = useState(
    requestedTab && TABS.some((item) => item.key === requestedTab) ? requestedTab : "workspace"
  );
  const [dataMode, setDataMode] = useState<"mock" | "live">(initialDataMode);
  const [modeBusy, setModeBusy] = useState(false);
  const hoverPreference = useHoverPreference();

  async function changeDataMode(mode: "mock" | "live") {
    if (mode === dataMode || modeBusy) return;
    setModeBusy(true);
    try {
      const response = await fetch("/api/settings/data-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!response.ok) throw new Error("Mode update failed");
      setDataMode(mode);
      toast(mode === "mock" ? "Mock mode enabled" : "Clean workspace enabled");
      router.refresh();
    } catch {
      toast("Couldn't change workspace mode", "error");
    } finally {
      setModeBusy(false);
    }
  }

  const [profile, setProfile] = useState({
    name: initialDataMode === "mock" ? "Suren Dheen" : "",
    title: initialDataMode === "mock" ? "Senior Sales Rep" : "",
    email: initialDataMode === "mock" ? "suren.dheen@freyrsolutions.com" : "",
    signature: initialDataMode === "mock" ? "Suren Dheen\nFreyr Solutions" : "",
  });
  const [invite, setInvite] = useState({ name: "", email: "", role: "Rep" });
  const [notifs, setNotifs] = useState<Record<string, boolean>>({
    newSession: true,
    outcomeLogged: true,
    rottingDeal: true,
    weeklyDigest: false,
  });
  const [role, setRole] = useState("Admin");
  const [sso, setSso] = useState({
    provider: "Azure AD",
    connected: authConfig.approvalEnabled,
    enforce: authConfig.approvalEnabled,
    twoFactor: true,
  });
  const [connectors, setConnectors] = useState<Record<string, boolean>>({});
  const [accessDirectory, setAccessDirectory] = useState<AccessDirectory>(MOCK_ACCESS);
  const [accessBusy, setAccessBusy] = useState<string | null>(null);

  const activeTab = TABS.find((item) => item.key === tab) || TABS[0];

  async function refreshAccessDirectory() {
    if (!authConfig.approvalEnabled) return;
    try {
      const response = await fetch("/api/settings/access", { cache: "no-store" });
      if (!response.ok) throw new Error("Access directory unavailable");
      setAccessDirectory(await response.json());
    } catch {
      toast("Couldn't load workspace access", "error");
    }
  }

  function toggleConnector(key: string, name: string) {
    const next = { ...connectors, [key]: !connectors[key] };
    setConnectors(next);
    try {
      localStorage.setItem("freyr_connectors", JSON.stringify(next));
    } catch {}
    toast(next[key] ? `Connected ${name}` : `Disconnected ${name}`);
  }

  // hydrate from localStorage
  useEffect(() => {
    try {
      const p = localStorage.getItem("freyr_profile");
      if (p && initialDataMode === "mock") setProfile((s) => ({ ...s, ...JSON.parse(p) }));
      const n = localStorage.getItem("freyr_notifs");
      if (n) setNotifs((s) => ({ ...s, ...JSON.parse(n) }));
      const r = localStorage.getItem("freyr_role");
      if (r && initialDataMode === "mock") setRole(r);
      const s = localStorage.getItem("freyr_sso");
      if (s && initialDataMode === "mock") setSso((v) => ({ ...v, ...JSON.parse(s) }));
      const cn = localStorage.getItem("freyr_connectors");
      if (cn) setConnectors(JSON.parse(cn));
    } catch {}
  }, [initialDataMode]);

  useEffect(() => {
    refreshAccessDirectory();
    // The production directory is refreshed when the approval gate becomes active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authConfig.approvalEnabled]);

  const canInvite = role === "Admin";
  const canSecurity = role === "Admin";

  function selectRole(r: string) {
    setRole(r);
    try {
      localStorage.setItem("freyr_role", r);
    } catch {}
    toast(`You're now acting as ${r}`);
  }
  function updateSso(patch: Partial<typeof sso>) {
    const next = { ...sso, ...patch };
    setSso(next);
    try {
      localStorage.setItem("freyr_sso", JSON.stringify(next));
    } catch {}
  }

  function saveProfile() {
    try {
      localStorage.setItem("freyr_profile", JSON.stringify(profile));
    } catch {}
    toast("Profile saved");
  }
  async function addMember() {
    if (!canInvite) {
      toast("Reps can't invite teammates — ask an admin or manager", "error");
      return;
    }
    if (!invite.email) {
      toast("Email is required", "error");
      return;
    }
    const accessRole: AccessRole = invite.role === "Admin" ? "admin" : invite.role === "Manager" ? "editor" : "sales";
    setAccessBusy("invite");
    try {
      if (authConfig.approvalEnabled) {
        const response = await fetch("/api/settings/access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "invite", email: invite.email, role: accessRole }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Invite failed");
        setAccessDirectory(data.directory);
      } else {
        setAccessDirectory((directory) => ({
          ...directory,
          invitations: [
            { id: `invite-${Date.now()}`, email: invite.email.toLowerCase(), role: accessRole, expiresAt: new Date(Date.now() + 14 * 86400000).toISOString() },
            ...directory.invitations,
          ],
        }));
      }
      setInvite({ name: "", email: "", role: "Rep" });
      toast(`Invitation created for ${invite.email}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Invite failed", "error");
    } finally {
      setAccessBusy(null);
    }
  }

  async function reviewRequest(requestId: string, decision: "approve" | "reject", accessRole: AccessRole) {
    setAccessBusy(requestId);
    try {
      if (authConfig.approvalEnabled) {
        const response = await fetch("/api/settings/access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: decision, requestId, role: accessRole }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Request update failed");
        setAccessDirectory(data.directory);
      } else {
        setAccessDirectory((directory) => {
          const request = directory.requests.find((item) => item.id === requestId);
          return {
            ...directory,
            requests: directory.requests.filter((item) => item.id !== requestId),
            members:
              decision === "approve" && request
                ? [
                    ...directory.members,
                    { id: `member-${Date.now()}`, name: request.name, email: request.email, role: accessRole, active: true, lastSeenAt: null },
                  ]
                : directory.members,
          };
        });
      }
      toast(decision === "approve" ? "Access approved" : "Access request rejected");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Request update failed", "error");
    } finally {
      setAccessBusy(null);
    }
  }
  function toggleNotif(key: string) {
    const next = { ...notifs, [key]: !notifs[key] };
    setNotifs(next);
    try {
      localStorage.setItem("freyr_notifs", JSON.stringify(next));
    } catch {}
  }

  return (
    <div className="grid max-w-[1280px] grid-cols-[220px_minmax(0,1fr)] gap-7">
      <aside className="border-r border-border-light pr-5">
        <div className="sticky top-0">
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
            Workspace settings
          </p>
          <nav role="tablist" aria-label="Settings sections" className="space-y-1">
            {TABS.map((item) => {
              const Icon = item.icon;
              const selected = tab === item.key;
              return (
                <button
                  key={item.key}
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(item.key)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                    selected
                      ? "bg-blue-light text-blue-primary"
                      : "text-text-secondary hover:bg-surface hover:text-text-primary"
                  )}
                >
                  <Icon size={16} strokeWidth={1.8} className="shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold">{item.label}</span>
                    <span className={cn("block text-[10.5px]", selected ? "text-blue-primary/70" : "text-text-tertiary")}>{item.description}</span>
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="mt-6 border-t border-border-light px-2 pt-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-success">
              <ShieldCheck size={14} /> Server-side data access
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-text-tertiary">
              Browser access to workspace tables is blocked by default.
            </p>
          </div>
        </div>
      </aside>

      <section className="min-w-0">
        <div className="mb-5 border-b border-border-light pb-4">
          <h2 className="text-[18px] font-semibold text-text-primary">{activeTab.label}</h2>
          <p className="mt-0.5 text-[12.5px] text-text-secondary">{activeTab.description}</p>
        </div>

      {tab === "workspace" && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Workspace data",
                value: dataMode === "mock" ? "Mock dataset" : "Real workspace",
                detail: dataMode === "mock" ? "Safe sample records" : "Connected business records",
                icon: Database,
                color: "text-blue-primary bg-blue-light",
              },
              {
                label: "Access policy",
                value: authConfig.approvalEnabled ? "Invite only" : "Demo access",
                detail: authConfig.approvalEnabled ? "Owner approval required" : "Enable for production",
                icon: Lock,
                color: authConfig.approvalEnabled ? "text-success bg-success/10" : "text-warning bg-warning/10",
              },
              {
                label: "Identity provider",
                value: authConfig.authMode === "entra" ? "Microsoft Entra" : authConfig.authMode === "aws-alb" ? "AWS OIDC" : "Local demo",
                detail: authConfig.authMode === "local" ? "No production identity" : "Single sign-on configured",
                icon: ShieldCheck,
                color: "text-violet-600 bg-violet-50",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.label} className="flex items-center gap-3 px-4 py-3.5">
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", item.color)}>
                    <Icon size={16} strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[13px] font-semibold text-text-primary">{item.value}</span>
                    <span className="block truncate text-[10.5px] text-text-tertiary">{item.detail}</span>
                  </span>
                </Card>
              );
            })}
          </div>
          <Card className="px-5 py-4">
            <div className="flex items-center justify-between gap-6">
              <h2 className="text-[15px] font-semibold text-text-primary">Workspace data</h2>
              <div className="flex items-center gap-3" aria-label="Workspace data mode">
                <span
                  className={cn(
                    "text-[13px]",
                    dataMode === "live"
                      ? "font-semibold text-text-primary"
                      : "text-text-tertiary"
                  )}
                >
                  Real mode
                </span>
                <Toggle
                  on={dataMode === "mock"}
                  onClick={() => changeDataMode(dataMode === "mock" ? "live" : "mock")}
                  label="Switch between real mode and mock mode"
                />
                <span
                  className={cn(
                    "text-[13px]",
                    dataMode === "mock"
                      ? "font-semibold text-text-primary"
                      : "text-text-tertiary"
                  )}
                >
                  Mock mode
                </span>
              </div>
            </div>
          </Card>

          <Card className="px-5 py-4">
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-start gap-3 min-w-0">
                <span className="w-9 h-9 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
                  <MousePointer2 size={17} strokeWidth={1.8} />
                </span>
                <div>
                  <h2 className="text-[15px] font-semibold text-text-primary">
                    Context previews
                  </h2>
                  <p className="mt-0.5 text-[12.5px] text-text-secondary">
                    Set the delay for people, company, and detail previews. Chart data always appears instantly.
                  </p>
                </div>
              </div>
              <Toggle
                on={hoverPreference.enabled}
                onClick={() =>
                  saveHoverPreference({
                    ...hoverPreference,
                    enabled: !hoverPreference.enabled,
                  })
                }
                label="Enable contextual hover previews"
              />
            </div>

            {hoverPreference.enabled ? (
              <div className="mt-4 pl-12">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <label htmlFor="hover-delay" className="text-[12px] font-medium text-text-primary">
                    Preview delay
                  </label>
                  <div className="flex items-center gap-2">
                    {hoverPreference.delayMs === DEFAULT_HOVER_DELAY_MS && (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-success">
                        Recommended
                      </span>
                    )}
                    <output
                      htmlFor="hover-delay"
                      className="min-w-[74px] text-right text-[12px] font-semibold text-blue-primary tnum"
                    >
                      {formatHoverDelay(hoverPreference.delayMs)}
                    </output>
                  </div>
                </div>
                <input
                  id="hover-delay"
                  aria-label="Context preview delay"
                  type="range"
                  min={0}
                  max={MAX_HOVER_DELAY_MS}
                  step={100}
                  value={hoverPreference.delayMs}
                  onChange={(event) =>
                    saveHoverPreference({
                      enabled: true,
                      delayMs: Number(event.target.value),
                    })
                  }
                  className="w-full h-1.5 accent-blue-primary cursor-pointer"
                />
                <div className="mt-1 flex justify-between text-[10.5px] text-text-tertiary tnum">
                  <span>Instant</span>
                  <span>2 seconds</span>
                </div>
              </div>
            ) : (
              <p className="mt-3 pl-12 text-[12px] text-warning">
                Context previews are off. Chart inspection remains available instantly.
              </p>
            )}
          </Card>

          <Card>
            <h2 className="text-[15px] font-semibold text-text-primary">Recommended onboarding</h2>
            <ol className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                ["1", "Review offerings", "Confirm the services, owners, availability, and supporting materials."],
                ["2", "Add your first account", "Create a customer and contact, or start a new intelligence session."],
                ["3", "Connect systems", "Ask an admin to connect the database, email, CRM, and enrichment services."],
              ].map(([number, title, description]) => (
                <li key={number} className="rounded-xl border border-border-light p-4">
                  <span className="w-6 h-6 rounded-full bg-blue-primary text-white text-[11px] font-bold inline-flex items-center justify-center">{number}</span>
                  <p className="mt-2 text-[13px] font-semibold text-text-primary">{title}</p>
                  <p className="mt-1 text-[12px] text-text-secondary leading-relaxed">{description}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}

      {tab === "profile" && (
        <Card>
          <div className="flex items-center gap-4 mb-5">
            <Avatar name={profile.name} className="w-14 h-14 text-[18px]" />
            <div>
              <p className="text-[15px] font-semibold text-text-primary">{profile.name}</p>
              <p className="text-[13px] text-text-secondary">{profile.title}</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-[13px] font-medium text-text-primary mb-1.5">Full name</span>
                <Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-[13px] font-medium text-text-primary mb-1.5">Title</span>
                <Input value={profile.title} onChange={(e) => setProfile({ ...profile, title: e.target.value })} />
              </label>
            </div>
            <label className="block">
              <span className="block text-[13px] font-medium text-text-primary mb-1.5">Email</span>
              <Input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
            </label>
            <label className="block">
              <span className="block text-[13px] font-medium text-text-primary mb-1.5">Email signature</span>
              <Textarea className="min-h-[90px]" value={profile.signature} onChange={(e) => setProfile({ ...profile, signature: e.target.value })} />
            </label>
            <Button onClick={saveProfile}>Save profile</Button>
            <div className="pt-4 mt-1 border-t border-border-light">
              <ThemeSetting />
            </div>
          </div>
        </Card>
      )}

      {tab === "team" && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Active members", value: accessDirectory.members.filter((member) => member.active).length, icon: UsersRound, color: "text-blue-primary bg-blue-light" },
              { label: "Awaiting approval", value: accessDirectory.requests.length, icon: Clock3, color: "text-warning bg-warning/10" },
              { label: "Open invitations", value: accessDirectory.invitations.length, icon: Mail, color: "text-success bg-success/10" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="flex items-center gap-3 px-4 py-3.5">
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-md", color)}>
                  <Icon size={16} />
                </span>
                <span>
                  <span className="block text-[22px] font-bold leading-none text-text-primary tnum">{value}</span>
                  <span className="mt-1 block text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">{label}</span>
                </span>
              </Card>
            ))}
          </div>

          <Card className="px-5 py-4">
            <div className="flex items-start justify-between gap-5">
              <div>
                <h2 className="flex items-center gap-2 text-[14px] font-semibold text-text-primary">
                  <UserPlus size={16} className="text-blue-primary" /> Invite a teammate
                </h2>
                <p className="mt-1 text-[11.5px] text-text-secondary">Only workspace owners can create invitations. An invite expires after 14 days.</p>
              </div>
              <span className="rounded-md bg-success/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-success">Invite only</span>
            </div>
            <div className="mt-4 grid grid-cols-[minmax(260px,1fr)_180px_auto] items-end gap-3">
              <label>
                <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Work email</span>
                <Input type="email" placeholder="name@freyrsolutions.com" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
              </label>
              <label>
                <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Starting role</span>
                <select
                  value={invite.role}
                  onChange={(e) => setInvite({ ...invite, role: e.target.value })}
                  className="h-[42px] w-full rounded-md border border-border bg-surface px-3 text-[13px] outline-none focus:border-blue-primary"
                >
                  <option>Rep</option>
                  <option>Manager</option>
                  <option>Admin</option>
                </select>
              </label>
              <Button onClick={addMember} disabled={!canInvite || accessBusy === "invite"} className="h-[42px]">
                {accessBusy === "invite" ? "Creating…" : "Create invite"}
              </Button>
            </div>
            {!canInvite && <p className="mt-2 text-[11.5px] text-warning">Only an admin can invite or approve members.</p>}
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-border-light px-5 py-3.5">
              <div>
                <h2 className="text-[14px] font-semibold text-text-primary">Member directory</h2>
                <p className="text-[11px] text-text-tertiary">Active identity, role, and recent access.</p>
              </div>
              <span className="text-[11px] font-medium text-text-tertiary">{accessDirectory.members.length} people</span>
            </div>
            <div className="grid grid-cols-[minmax(240px,1fr)_150px_120px_120px] border-b border-border-light bg-surface px-5 py-2 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              <span>Member</span><span>Role</span><span>Status</span><span>Last seen</span>
            </div>
            <ul className="divide-y divide-border-light">
              {accessDirectory.members.map((member) => (
                <li key={member.id} className="grid grid-cols-[minmax(240px,1fr)_150px_120px_120px] items-center px-5 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={member.name} className="h-9 w-9 shrink-0 text-[12px]" />
                    <span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-text-primary">{member.name}</span><span className="block truncate text-[11px] text-text-tertiary">{member.email}</span></span>
                  </div>
                  <span className="text-[12px] font-medium capitalize text-text-secondary">{member.role === "editor" ? "Catalog editor" : member.role === "sales" ? "Sales rep" : "Admin"}</span>
                  <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-[10.5px] font-semibold", member.active ? "bg-success/10 text-success" : "bg-surface text-text-tertiary")}><span className={cn("h-1.5 w-1.5 rounded-full", member.active ? "bg-success" : "bg-text-tertiary")} />{member.active ? "Active" : "Suspended"}</span>
                  <span className="text-[11px] text-text-tertiary">{member.lastSeenAt ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-Math.max(1, Math.round((Date.now() - new Date(member.lastSeenAt).getTime()) / 3600000)), "hour") : "Not yet"}</span>
                </li>
              ))}
            </ul>
          </Card>

          {accessDirectory.invitations.length > 0 && (
            <Card className="overflow-hidden p-0">
              <div className="border-b border-border-light px-5 py-3.5"><h2 className="text-[14px] font-semibold text-text-primary">Pending invitations</h2></div>
              <ul className="divide-y divide-border-light">
                {accessDirectory.invitations.map((invitation) => (
                  <li key={invitation.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <span><span className="block text-[12.5px] font-medium text-text-primary">{invitation.email}</span><span className="text-[10.5px] text-text-tertiary">Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span></span>
                    <span className="rounded-md bg-warning/10 px-2 py-1 text-[10.5px] font-semibold capitalize text-warning">{invitation.role}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {tab === "notifications" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card className="flex items-center justify-between px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-light text-blue-primary"><Mail size={16} /></span><span><span className="block text-[13px] font-semibold text-text-primary">Email delivery</span><span className="text-[11px] text-text-tertiary">Immediate alerts and digests</span></span></div><span className="rounded-md bg-success/10 px-2 py-1 text-[10.5px] font-semibold text-success">Primary</span></Card>
            <Card className="flex items-center justify-between px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-violet-50 text-violet-600"><MessageSquare size={16} /></span><span><span className="block text-[13px] font-semibold text-text-primary">Slack / Teams</span><span className="text-[11px] text-text-tertiary">Connected channel alerts</span></span></div><span className="rounded-md bg-surface px-2 py-1 text-[10.5px] font-semibold text-text-tertiary">Optional</span></Card>
          </div>
          <Card className="overflow-hidden p-0">
            <div className="border-b border-border-light px-5 py-3.5"><h2 className="text-[14px] font-semibold text-text-primary">Notification rules</h2><p className="text-[11px] text-text-tertiary">Choose which events deserve your attention.</p></div>
            <ul className="divide-y divide-border-light">
              {NOTIFS.map((n) => (
                <li key={n.key} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div><p className="text-[13px] font-medium text-text-primary">{n.label}</p><p className="text-[11.5px] text-text-secondary">{n.desc}</p></div>
                  <Toggle on={!!notifs[n.key]} onClick={() => toggleNotif(n.key)} label={`Toggle ${n.label}`} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === "access" && (
        <div className="space-y-5">
          <div className="grid grid-cols-[1.15fr_0.85fr] gap-4">
            <Card className="px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-success/10 text-success"><Lock size={18} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3"><h2 className="text-[14px] font-semibold text-text-primary">Invite-only workspace</h2><span className={cn("rounded-md px-2 py-1 text-[10px] font-semibold", authConfig.approvalEnabled ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>{authConfig.approvalEnabled ? "Enforced" : "Ready to enable"}</span></div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-text-secondary">Authentication verifies identity. Workspace approval independently controls whether that identity can see any Freyr data.</p>
                  <div className="mt-3 flex items-center gap-4 text-[10.5px] font-medium text-text-tertiary"><span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-success" /> SSO required</span><span className="inline-flex items-center gap-1.5"><UserCheck size={13} className="text-success" /> Owner approval</span><span className="inline-flex items-center gap-1.5"><Database size={13} className="text-success" /> Server-only database</span></div>
                </div>
              </div>
            </Card>
            <Card className="px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Authentication path</p>
              <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-text-primary"><span className="rounded-md bg-blue-light px-2 py-1 text-blue-primary">Identity</span><span className="text-text-tertiary">→</span><span className="rounded-md bg-warning/10 px-2 py-1 text-warning">Approval</span><span className="text-text-tertiary">→</span><span className="rounded-md bg-success/10 px-2 py-1 text-success">Role</span></div>
              <p className="mt-3 text-[11px] text-text-secondary">Unapproved identities stop at a pending screen before the application shell loads.</p>
            </Card>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-border-light px-5 py-3.5">
              <div><h2 className="text-[14px] font-semibold text-text-primary">Access requests</h2><p className="text-[11px] text-text-tertiary">Every uninvited identity waits here for an owner decision.</p></div>
              <span className={cn("rounded-md px-2 py-1 text-[10.5px] font-semibold", accessDirectory.requests.length ? "bg-warning/10 text-warning" : "bg-success/10 text-success")}>{accessDirectory.requests.length ? `${accessDirectory.requests.length} pending` : "Queue clear"}</span>
            </div>
            {accessDirectory.requests.length ? (
              <ul className="divide-y divide-border-light">
                {accessDirectory.requests.map((request) => (
                  <li key={request.id} className="flex items-center justify-between gap-5 px-5 py-3.5">
                    <div className="flex min-w-0 items-center gap-3"><Avatar name={request.name} className="h-9 w-9 shrink-0 text-[12px]" /><span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-text-primary">{request.name}</span><span className="block truncate text-[11px] text-text-tertiary">{request.email || "Email not asserted by identity provider"}</span></span></div>
                    <div className="flex items-center gap-2">
                      <span className="mr-2 text-[10.5px] text-text-tertiary">Requested {new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-Math.max(1, Math.round((Date.now() - new Date(request.requestedAt).getTime()) / 60000)), "minute")}</span>
                      <button disabled={accessBusy === request.id} onClick={() => reviewRequest(request.id, "reject", request.requestedRole)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[11.5px] font-semibold text-text-secondary hover:bg-surface disabled:opacity-50"><UserX size={13} /> Reject</button>
                      <button disabled={accessBusy === request.id} onClick={() => reviewRequest(request.id, "approve", request.requestedRole)} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-primary px-3 text-[11.5px] font-semibold text-white hover:bg-blue-hover disabled:opacity-50"><UserCheck size={13} /> Approve</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 px-5 py-5 text-[12px] text-text-secondary"><Check size={15} className="text-success" /> No one is waiting for access.</div>
            )}
          </Card>

          {!authConfig.approvalEnabled && <Card>
            <h2 className="text-[15px] font-semibold text-text-primary mb-1 flex items-center gap-2">
              <ShieldCheck size={18} strokeWidth={1.75} className="text-blue-primary" />
              Your role
            </h2>
            <p className="text-[13px] text-text-secondary mb-3">
              Determines what you can do across the workspace.
            </p>
            <div className="flex gap-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => selectRole(r)}
                  aria-pressed={role === r}
                  className={cn(
                    "text-[13px] font-medium px-3.5 py-2 rounded-md border transition-colors",
                    role === r
                      ? "border-blue-primary bg-blue-light text-blue-primary"
                      : "border-border text-text-secondary hover:bg-surface"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </Card>}

          <Card className="p-0 overflow-hidden">
            <h2 className="text-[15px] font-semibold text-text-primary px-5 pt-4 pb-2.5">
              Role permissions
            </h2>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface border-b border-border-light">
                  <th className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
                    Capability
                  </th>
                  {ROLES.map((r) => (
                    <th
                      key={r}
                      className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary text-center"
                    >
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {PERMISSIONS.map((p) => (
                  <tr key={p.cap}>
                    <td className="px-5 py-3 text-[13px] text-text-primary">{p.cap}</td>
                    {(["admin", "manager", "rep"] as const).map((k) => (
                      <td key={k} className="px-3 py-3 text-center">
                        {p[k] ? (
                          <Check size={15} strokeWidth={2.5} className="text-success inline" />
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <h2 className="text-[15px] font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Lock size={18} strokeWidth={1.75} className="text-blue-primary" />
              SSO &amp; security
            </h2>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <select
                aria-label="SSO provider"
                value={sso.provider}
                onChange={(e) => updateSso({ provider: e.target.value })}
                disabled={!canSecurity}
                className="bg-surface border border-border rounded-md px-3 py-2 text-[14px] outline-none focus:border-blue-primary disabled:opacity-50"
              >
                {SSO_PROVIDERS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <Button
                variant={sso.connected ? "secondary" : "primary"}
                disabled={!canSecurity || authConfig.approvalEnabled}
                onClick={() => {
                  updateSso({ connected: !sso.connected });
                  toast(
                    sso.connected
                      ? `Disconnected ${sso.provider}`
                      : `Connected ${sso.provider} SSO`
                  );
                }}
                className="px-4 py-2 text-[13px]"
              >
                {authConfig.approvalEnabled ? "Managed by deployment" : sso.connected ? "Disconnect" : "Connect"}
              </Button>
              {sso.connected && (
                <span
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium"
                  style={{ color: "#1A7A35" }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#34C759" }} />
                  Connected
                </span>
              )}
            </div>
            <ul className="divide-y divide-border-light border-t border-border-light">
              <li className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-[14px] font-medium text-text-primary">Enforce SSO for all members</p>
                  <p className="text-[13px] text-text-secondary">Members must sign in through your identity provider.</p>
                </div>
                <Toggle
                  on={authConfig.approvalEnabled || sso.enforce}
                  onClick={() =>
                    authConfig.approvalEnabled
                      ? toast("SSO enforcement is managed by deployment")
                      : canSecurity
                      ? updateSso({ enforce: !sso.enforce })
                      : toast("Only admins can configure security", "error")
                  }
                />
              </li>
              <li className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-[14px] font-medium text-text-primary">Require two-factor authentication</p>
                  <p className="text-[13px] text-text-secondary">Adds a second factor for non-SSO sign-ins.</p>
                </div>
                <Toggle
                  on={sso.twoFactor}
                  onClick={() =>
                    authConfig.approvalEnabled
                      ? toast("Two-factor policy is managed by your identity provider")
                      : canSecurity
                      ? updateSso({ twoFactor: !sso.twoFactor })
                      : toast("Only admins can configure security", "error")
                  }
                />
              </li>
            </ul>
            {!canSecurity && (
              <p className="text-[12px] text-text-tertiary mt-3">
                Only admins can configure SSO &amp; security. Switch your role above.
              </p>
            )}
          </Card>
        </div>
      )}

      {tab === "integrations" && (
        <div className="space-y-4">
          <p className="text-[13px] text-text-secondary max-w-[640px]">
            Connect the tools your team already uses. Freyr works alongside them —
            you stay in control of what syncs, and nothing goes out without your
            approval.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {CONNECTORS.map((c) => {
              const on = !!connectors[c.key];
              const Icon = c.icon;
              return (
                <Card key={c.key} className="flex items-start gap-3.5">
                  <span className="w-11 h-11 rounded-xl bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
                    <Icon size={19} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-semibold text-text-primary">{c.name}</p>
                      {on && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
                          <Check size={12} strokeWidth={2.6} /> Connected
                        </span>
                      )}
                    </div>
                    <p className="text-[12.5px] text-text-secondary leading-snug mt-0.5">
                      {c.desc}
                    </p>
                    <button
                      onClick={() => toggleConnector(c.key, c.name)}
                      className={cn(
                        "mt-3 text-[13px] font-semibold px-3.5 py-2 rounded-md border transition-colors",
                        on
                          ? "border-border text-text-secondary hover:bg-surface"
                          : "border-blue-primary bg-blue-primary text-white hover:bg-blue-hover"
                      )}
                    >
                      {on ? "Disconnect" : `Connect ${c.name}`}
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Two-way CRM mirror — real counts from the app's own book */}
          <CrmSyncCard counts={crmCounts} />

          {/* System services — the engines Freyr runs on. View-only status;
              keys are managed by your admin via secure environment config. */}
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={18} strokeWidth={1.75} className="text-blue-primary" />
              <h2 className="text-[15px] font-semibold text-text-primary">System services</h2>
            </div>
            <p className="text-[12.5px] text-text-secondary mb-4 max-w-[640px]">
              The engines Freyr runs on. These are configured with secure keys by
              your admin — nothing to connect here, just what&apos;s live.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {Object.entries(SERVICE_LABELS).map(([key, label]) => {
                const on = !!services[key];
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 bg-surface rounded-lg px-3.5 py-2.5"
                  >
                    <span className="text-[13px] text-text-primary min-w-0 truncate">{label}</span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-[11.5px] font-semibold shrink-0 px-2 py-0.5 rounded-full",
                        on ? "text-success bg-success/10" : "text-text-tertiary bg-black/5"
                      )}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: on ? "#34C759" : "#C7C7CC" }}
                      />
                      {on ? "Live" : "Not configured"}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      </section>
    </div>
  );
}
