"use client";

import { useEffect, useState } from "react";
import { UserPlus, Check, ShieldCheck, Lock, Mail, CalendarDays, MessageSquare, Building2, Link2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeSetting } from "@/components/settings/ThemeSetting";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "profile", label: "Profile" },
  { key: "team", label: "Team" },
  { key: "notifications", label: "Notifications" },
  { key: "integrations", label: "Integrations" },
  { key: "access", label: "Access" },
];

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
  { cap: "Invite teammates", admin: true, manager: true, rep: false },
  { cap: "Configure SSO & security", admin: true, manager: false, rep: false },
];

const PLANS = [
  { key: "Starter", price: "$0", per: "/mo", blurb: "1 seat · 25 sessions/mo" },
  { key: "Growth", price: "$49", per: "/seat/mo", blurb: "Up to 10 seats · 250 sessions/mo" },
  { key: "Enterprise", price: "Custom", per: "", blurb: "Unlimited · SSO · dedicated support" },
];

const USAGE = [
  { label: "Pitch sessions", used: 128, total: 250 },
  { label: "Enrichment credits", used: 340, total: 1000 },
  { label: "Team seats", used: 4, total: 10 },
];

const INVOICES = [
  { id: "INV-2026-06", date: "Jun 1, 2026", amount: "$196.00" },
  { id: "INV-2026-05", date: "May 1, 2026", amount: "$196.00" },
  { id: "INV-2026-04", date: "Apr 1, 2026", amount: "$147.00" },
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

const NOTIFS = [
  { key: "newSession", label: "New session created", desc: "When a teammate generates a pitch session." },
  { key: "outcomeLogged", label: "Outcome logged", desc: "When an interaction outcome is recorded." },
  { key: "rottingDeal", label: "Rotting deal alert", desc: "When a deal has no activity for 14+ days." },
  { key: "weeklyDigest", label: "Weekly pipeline digest", desc: "Monday-morning summary email." },
];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
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
}: {
  services: Record<string, boolean>;
  crmCounts: { companies: number; contacts: number; deals: number };
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState("profile");

  const [profile, setProfile] = useState({
    name: "Suren Dheen",
    title: "Senior Sales Rep",
    email: "suren.dheen@freyrsolutions.com",
    signature: "Suren Dheen\nFreyr Solutions",
  });
  const [team, setTeam] = useState<Member[]>(DEFAULT_TEAM);
  const [invite, setInvite] = useState({ name: "", email: "", role: "Rep" });
  const [notifs, setNotifs] = useState<Record<string, boolean>>({
    newSession: true,
    outcomeLogged: true,
    rottingDeal: true,
    weeklyDigest: false,
  });
  const [plan, setPlan] = useState("Growth");
  const [role, setRole] = useState("Admin");
  const [sso, setSso] = useState({
    provider: "Okta",
    connected: false,
    enforce: false,
    twoFactor: true,
  });
  const [connectors, setConnectors] = useState<Record<string, boolean>>({});

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
      if (p) setProfile((s) => ({ ...s, ...JSON.parse(p) }));
      const t = localStorage.getItem("freyr_team");
      if (t) setTeam(JSON.parse(t));
      const n = localStorage.getItem("freyr_notifs");
      if (n) setNotifs((s) => ({ ...s, ...JSON.parse(n) }));
      const pl = localStorage.getItem("freyr_plan");
      if (pl) setPlan(pl);
      const r = localStorage.getItem("freyr_role");
      if (r) setRole(r);
      const s = localStorage.getItem("freyr_sso");
      if (s) setSso((v) => ({ ...v, ...JSON.parse(s) }));
      const cn = localStorage.getItem("freyr_connectors");
      if (cn) setConnectors(JSON.parse(cn));
    } catch {}
  }, []);

  const canInvite = role !== "Rep";
  const canBilling = role === "Admin";
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

  function selectPlan(key: string) {
    if (!canBilling) {
      toast("Only admins can change the plan", "error");
      return;
    }
    setPlan(key);
    try {
      localStorage.setItem("freyr_plan", key);
    } catch {}
    toast(`Switched to ${key} plan`);
  }

  function saveProfile() {
    try {
      localStorage.setItem("freyr_profile", JSON.stringify(profile));
    } catch {}
    toast("Profile saved");
  }
  function addMember() {
    if (!canInvite) {
      toast("Reps can't invite teammates — ask an admin or manager", "error");
      return;
    }
    if (!invite.name || !invite.email) {
      toast("Name and email required", "error");
      return;
    }
    const next = [...team, { ...invite }];
    setTeam(next);
    try {
      localStorage.setItem("freyr_team", JSON.stringify(next));
    } catch {}
    setInvite({ name: "", email: "", role: "Rep" });
    toast(`Invited ${invite.name}`);
  }
  function toggleNotif(key: string) {
    const next = { ...notifs, [key]: !notifs[key] };
    setNotifs(next);
    try {
      localStorage.setItem("freyr_notifs", JSON.stringify(next));
    } catch {}
  }

  const roleColor: Record<string, { bg: string; color: string }> = {
    Admin: { bg: "rgba(0,113,227,0.12)", color: "#0040A0" },
    Manager: { bg: "rgba(52,199,89,0.12)", color: "#1A7A35" },
    Rep: { bg: "#F3F4F6", color: "#6E6E73" },
  };

  return (
    <div className="max-w-[1100px]">
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex gap-6 border-b border-border-light mb-6"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "pb-3 -mb-px border-b-2 text-[14px] transition-colors",
              tab === t.key
                ? "border-blue-primary text-blue-primary font-semibold"
                : "border-transparent text-text-secondary hover:text-text-primary font-medium"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

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
        <div className="space-y-6">
          <Card>
            <h2 className="text-[15px] font-semibold text-text-primary mb-3 flex items-center gap-2">
              <UserPlus size={18} strokeWidth={1.75} className="text-blue-primary" />
              Invite a teammate
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
              <Input placeholder="Name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
              <Input type="email" placeholder="Email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
              <select
                value={invite.role}
                onChange={(e) => setInvite({ ...invite, role: e.target.value })}
                className="bg-surface border border-border rounded-md px-3 py-2.5 text-[14px] outline-none focus:border-blue-primary"
              >
                <option>Rep</option>
                <option>Manager</option>
                <option>Admin</option>
              </select>
              <Button onClick={addMember} disabled={!canInvite}>
                Invite
              </Button>
            </div>
            {!canInvite && (
              <p className="text-[12px] text-text-tertiary mt-2">
                You&apos;re acting as a Rep — only admins and managers can invite
                teammates. Change your role in Access.
              </p>
            )}
          </Card>
          <Card className="p-0 overflow-hidden">
            <ul className="divide-y divide-border-light">
              {team.map((m, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.name} className="w-9 h-9 text-[13px]" />
                    <div>
                      <p className="text-[14px] font-medium text-text-primary">
                        {m.name}
                        {m.you && <span className="text-text-tertiary font-normal"> (you)</span>}
                      </p>
                      <p className="text-[12px] text-text-tertiary">{m.email}</p>
                    </div>
                  </div>
                  <Badge label={m.role} bg={roleColor[m.role]?.bg} color={roleColor[m.role]?.color} className="!normal-case tracking-normal" />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === "notifications" && (
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-border-light">
            {NOTIFS.map((n) => (
              <li key={n.key} className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <p className="text-[14px] font-medium text-text-primary">{n.label}</p>
                  <p className="text-[13px] text-text-secondary">{n.desc}</p>
                </div>
                <Toggle on={!!notifs[n.key]} onClick={() => toggleNotif(n.key)} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "access" && (
        <div className="space-y-6">
          <Card>
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
          </Card>

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
                disabled={!canSecurity}
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
                {sso.connected ? "Disconnect" : "Connect"}
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
                  on={sso.enforce}
                  onClick={() =>
                    canSecurity
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
                    canSecurity
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
        </div>
      )}
    </div>
  );
}
