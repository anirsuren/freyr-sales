"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { RoleTag } from "@/components/ui/RoleTag";
import { useTimeZone } from "@/components/auth/CurrentUserProvider";
import {
  COMMON_TIME_ZONES,
  describeZone,
  detectTimeZone,
  formatAbsolute,
} from "@/lib/timeZone";
import { UserPlus, Check, ShieldCheck, Lock, Mail, CalendarDays, MessageSquare, Building2, Link2, MousePointer2, Settings2, UserRound, UsersRound, Bell, PlugZap, KeyRound, UserCheck, UserX, Clock3, Database, ArrowRight, Rocket, MonitorSmartphone, Clock } from "lucide-react";
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
import {
  useCurrentUser,
  useMyPhoto,
} from "@/components/auth/CurrentUserProvider";
import {
  userScopedStorageKey,
  type UserIdentity,
} from "@/lib/userIdentity";
import { canSwitchWorkspaceMode } from "@/lib/release";

/**
 * WHAT AN INVITED PERSON MAY DO, as a colour + icon each.
 *
 * Ordered by reach, and deliberately NOT red/green/amber: those mean a state in
 * this app, and a role is an identity. Admin is the widest grant, so it is the
 * one that has to be unmistakable at a glance.
 */
const INVITE_ROLE_OPTIONS: ColorOption[] = [
  { value: "Rep", label: "Rep", color: "#0071E3", icon: UserRound },
  { value: "Manager", label: "Manager", color: "#7C3AED", icon: UsersRound },
  { value: "Admin", label: "Admin", color: "#0F766E", icon: ShieldCheck },
];

const TABS = [
  { key: "workspace", label: "Workspace", description: "Data and behavior", icon: Settings2 },
  { key: "profile", label: "Profile", description: "Identity and preferences", icon: UserRound },
  { key: "team", label: "Team", description: "Members and invitations", icon: UsersRound },
  { key: "notifications", label: "Notifications", description: "Alerts and digests", icon: Bell },
  { key: "integrations", label: "Integrations", description: "Connected systems", icon: PlugZap },
  { key: "access", label: "Access", description: "Approvals and roles", icon: KeyRound },
] as const;

// Settings is one of the few pages that survives the offerings-only release, so
// it must not become the back door to the modules that don't. These two tabs
// are entirely about unreleased work — every notification is a deal/session
// alert, and Integrations mirrors the CRM record counts (companies, contacts,
// deals). They come back the moment the release opens up.
const TABS_HIDDEN_IN_OFFERINGS_ONLY: ReadonlySet<string> = new Set([
  "notifications",
  "integrations",
]);

// Client-facing connectors — tools a rep's org already uses (Anir, Jul 8:
// "integrations shouldn't be client-facing keys — put what THEY would connect").
// Internal service keys (Anthropic/Apify/Telegram) live in .env, not here.
const CONNECTORS = [
  { key: "email", name: "Email", icon: Mail, desc: "Send pitches and sequences from your own inbox. Gmail or Outlook." },
  { key: "calendar", name: "Calendar", icon: CalendarDays, desc: "Booked meetings land straight on your Google or Outlook calendar." },
  { key: "crm", name: "CRM", icon: Building2, desc: "Two-way sync of accounts, contacts and deals with Salesforce or HubSpot." },
  { key: "chat", name: "Slack / Teams", icon: MessageSquare, desc: "Deal alerts and your daily digest, right in your team channel." },
  { key: "linkedin", name: "LinkedIn", icon: Link2, desc: "Enrich contacts and send connection notes without leaving Freyr." },
] as const;

const ROLES = ["Admin", "Manager", "Rep"];
const SSO_PROVIDERS = ["Okta", "Google Workspace", "Azure AD", "SAML 2.0"];
/**
 * WHAT THE CODE ACTUALLY ENFORCES — checked against lib/role.ts and
 * lib/offeringOwnership.ts, not written from memory.
 *
 * The row this table used to get badly wrong was editing offerings: it claimed
 * Admin ✓ Manager ✓ Rep ✗, and the truth is neither. Editing is gated on
 * OWNERSHIP, for everyone — "a workspace admin does not get to edit an offering
 * merely by being an admin". A Rep who owns one can edit it; an Admin who does
 * not own it cannot. What admin buys is the right to TAKE ownership, granted on
 * the spot, and to hand it to someone else. A permissions table that contradicts
 * the server is worse than no table: it is the page people check before they
 * trust the product with their access model.
 */
const PERMISSIONS: { cap: string; admin: boolean; manager: boolean; rep: boolean; note?: string }[] = [
  { cap: "Browse offerings & open sales materials", admin: true, manager: true, rep: true },
  { cap: "Ask the assistant", admin: true, manager: true, rep: true },
  {
    cap: "Edit an offering & its materials",
    admin: false,
    manager: false,
    rep: false,
    note: "Whoever owns that offering, any role",
  },
  {
    cap: "Take ownership of an offering",
    admin: true,
    manager: false,
    rep: false,
    note: "Others request it; an admin grants it",
  },
  { cap: "Invite, approve or suspend teammates", admin: true, manager: false, rep: false },
  { cap: "Switch the workspace between Real and Mock", admin: true, manager: false, rep: false },
];

const SERVICE_LABELS: Record<string, string> = {
  anthropic: "Anthropic: AI analysis & pitch generation",
  supabase: "Supabase: database",
  firecrawl: "Firecrawl: web crawl & scrape",
  apify: "Apify: LinkedIn enrichment",
  telegram: "Telegram: bot notifications",
  email: "Email: Resend / SMTP send channel",
};

type Member = { name: string; email: string; role: string; you?: boolean };
type AccessRole = "admin" | "editor" | "sales";
type AccessDirectory = {
  members: { id: string; name: string; email: string | null; role: AccessRole; active: boolean; lastSeenAt: string | null }[];
  requests: { id: string; name: string; email: string | null; requestedRole: AccessRole; requestedAt: string }[];
  invitations: {
    id: string;
    name?: string | null;
    email: string;
    role: AccessRole;
    expiresAt: string;
  }[];
};
// NO INVENTED TEAMMATES. MOCK_TEAMMATES and MOCK_ACCESS put made-up names on
// REAL Freyr addresses — "Walter Hensley" wearing suren.dheen@freyrsolutions.com
// — plus a fictional access request with live Approve and Reject buttons. Real
// mode already hid them, but they shipped in the bundle and were one setting
// away from being on screen with the CEO's address under someone else's name.
// The directory now starts from the signed-in user and fills in from the server.

const DEFAULT_NOTIFICATIONS: Record<string, boolean> = {
  newSession: true,
  outcomeLogged: true,
  rottingDeal: true,
  weeklyDigest: false,
};

/**
 * REAL MODE SHOWS REAL PEOPLE, OR NOBODY.
 *
 * The sample directory used to appear whenever the approval gate was off,
 * regardless of mode, so real mode listed invented teammates and a pending
 * access request from a person who does not exist (Anir, Jul 29: "is the fake
 * fucking account, bro? make sure everything in this real mode is actually
 * real"). A fake name beside an Approve button is not a placeholder, it is a
 * lie about who is asking for access.
 *
 * The samples now belong to mock mode alone. Real mode starts with the signed
 * in user and fills in from the server.
 */
function initialAccessDirectory(currentUser: UserIdentity): AccessDirectory {
  // Just the person reading the page, until the server answers with the real
  // directory. One honest row beats a padded one.
  return {
    members: [
      {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role,
        active: true,
        lastSeenAt: new Date().toISOString(),
      },
    ],
    requests: [],
    invitations: [],
  };
}

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
  disabled = false,
}: {
  on: boolean;
  onClick: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      aria-disabled={disabled}
      aria-label={label}
      className={cn(
        "w-10 h-6 rounded-full transition-colors relative shrink-0",
        on ? "bg-blue-primary" : "bg-border",
        disabled && "cursor-not-allowed opacity-60"
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
  initialDataModeLocked,
  authConfig,
  offeringsOnly = false,
}: {
  services: Record<string, boolean>;
  crmCounts: { companies: number; contacts: number; deals: number };
  initialDataMode: "mock" | "live";
  initialDataModeLocked: boolean;
  authConfig: { authMode: string; approvalEnabled: boolean };
  /** True while only the Offerings module is released — see lib/release.ts. */
  offeringsOnly?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  /**
   * TIME ZONE, saved the moment it changes — a preference behind a Save button
   * that governs every timestamp on every other page is a preference people
   * set and then wonder why nothing moved.
   */
  const { timeZone: activeZone, saved: savedZone, refresh: refreshZone } =
    useTimeZone();
  const [detectedZone, setDetectedZone] = useState("UTC");
  const [savingZone, setSavingZone] = useState(false);
  const [nowInZone, setNowInZone] = useState("");
  useEffect(() => {
    setDetectedZone(detectTimeZone());
  }, []);
  // A live clock in the chosen zone: the fastest way to tell you picked right.
  useEffect(() => {
    const paint = () => setNowInZone(formatAbsolute(new Date(), activeZone));
    paint();
    const id = window.setInterval(paint, 30_000);
    return () => window.clearInterval(id);
  }, [activeZone]);
  // The device's own zone is offered even when it is not on the short list.
  const zoneChoices = Array.from(
    new Set(
      [...COMMON_TIME_ZONES, detectedZone, savedZone].filter(
        (z): z is string => Boolean(z)
      )
    )
  ).sort();

  async function saveTimeZone(next: string) {
    setSavingZone(true);
    try {
      const res = await fetch("/api/profile/timezone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeZone: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast(body.error || "Could not save your time zone", "error");
        return;
      }
      refreshZone();
      toast(
        next
          ? `Times now read in ${describeZone(next)}`
          : "Times now follow this device"
      );
    } catch {
      toast("Could not save your time zone", "error");
    } finally {
      setSavingZone(false);
    }
  }
  const currentUser = useCurrentUser();
  /**
   * THE DOMAIN THIS WORKSPACE ACTUALLY USES, for the invite placeholder.
   *
   * Read off the signed-in admin's own address rather than written into the
   * markup: "freyrsolutions.com" typed literally would be a lie the day this
   * runs anywhere else, and a placeholder reading "name@company.com" is the
   * kind of stock filler that makes a product look like a template.
   */
  const workspaceDomain =
    (currentUser.email || "").split("@")[1]?.trim() || "freyrsolutions.com";
  const profileStorageKey = userScopedStorageKey(
    "freyr_profile",
    currentUser.id
  );
  const notifStorageKey = userScopedStorageKey("freyr_notifs", currentUser.id);
  const roleStorageKey = userScopedStorageKey("freyr_role", currentUser.id);
  const ssoStorageKey = userScopedStorageKey("freyr_sso", currentUser.id);
  const connectorStorageKey = userScopedStorageKey(
    "freyr_connectors",
    currentUser.id
  );
  const visibleTabs = TABS.filter(
    (item) => !offeringsOnly || !TABS_HIDDEN_IN_OFFERINGS_ONLY.has(item.key)
  );
  const requestedTab = searchParams.get("tab");
  // A hidden tab can't be reached by hand-typing ?tab=integrations either — an
  // unknown key falls back to Workspace, same as any other bad value.
  const [tab, setTab] = useState(
    requestedTab && visibleTabs.some((item) => item.key === requestedTab)
      ? requestedTab
      : "workspace"
  );
  const [dataMode, setDataMode] = useState<"mock" | "live">(initialDataMode);
  const [modeBusy, setModeBusy] = useState(false);
  const hoverPreference = useHoverPreference();
  // The mode switch reveals the modules that aren't launched yet, so it is an
  // admin control (Suren, Jul 28). Reps still SEE which mode the workspace is
  // in — the card just tells them who changes it, instead of vanishing.
  const canChangeDataMode = canSwitchWorkspaceMode(currentUser.role);

  async function changeDataMode(mode: "mock" | "live") {
    if (initialDataModeLocked) {
      toast("Workspace data mode is controlled by this deployment");
      return;
    }
    if (!canChangeDataMode) {
      toast("Only a workspace admin can change what the workspace shows");
      return;
    }
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
    name: currentUser.name,
    title: currentUser.title,
    email: currentUser.email || "",
    signature: `${currentUser.name}\nFreyr Solutions`,
    // The agent writes in the rep's voice, so it needs to know who the rep
    // actually is — role, seniority, background. The LinkedIn profile is the
    // richest single source of that, and it is what the enrichment run reads to
    // pull a real headshot instead of initials.
    linkedin: "",
  });
  const [savedProfile, setSavedProfile] = useState(profile);
  const [linkedinStatus, setLinkedinStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  // Tracks the last URL we sent for enrichment so repeated saves don't re-run a
  // scrape (and burn Apify credits) for a link that has not changed.
  const savedLinkedinRef = useRef<string>("");
  const [invite, setInvite] = useState({ name: "", email: "", role: "Rep" });
  const [notifs, setNotifs] = useState<Record<string, boolean>>(
    DEFAULT_NOTIFICATIONS
  );
  const authenticatedRoleLabel =
    currentUser.role === "admin"
      ? "Admin"
      : currentUser.role === "editor"
        ? "Manager"
        : "Rep";
  const [role, setRole] = useState(authenticatedRoleLabel);
  const [sso, setSso] = useState({
    provider: "Azure AD",
    connected: false,
    enforce: false,
    twoFactor: false,
  });
  const [connectors, setConnectors] = useState<Record<string, boolean>>({});
  const [accessDirectory, setAccessDirectory] = useState<AccessDirectory>(() =>
    initialAccessDirectory(currentUser)
  );
  const [accessBusy, setAccessBusy] = useState<string | null>(null);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);

  const activeTab = visibleTabs.find((item) => item.key === tab) || visibleTabs[0];
  const isLocalAuth = authConfig.authMode === "local";
  const authProviderLabel =
    authConfig.authMode === "supabase"
      ? "Supabase email/password"
      : authConfig.authMode === "entra"
        ? "Microsoft Entra"
        : authConfig.authMode === "aws-alb"
          ? "AWS ALB OIDC"
          : "Local demo";
  const authProviderDetail =
    authConfig.authMode === "supabase"
      ? "Verified email required"
      : isLocalAuth
        ? "No production identity"
        : "Single sign-on configured";
  const signInMethod =
    authConfig.authMode === "supabase" ? "Email + password" : "Single sign-on";
  const identityVerification =
    authConfig.authMode === "supabase"
      ? "Verified email required"
      : "Identity provider managed";

  function toggleConnector(key: string, name: string) {
    const next = { ...connectors, [key]: !connectors[key] };
    setConnectors(next);
    try {
      localStorage.setItem(connectorStorageKey, JSON.stringify(next));
    } catch {}
    toast(next[key] ? `Connected ${name}` : `Disconnected ${name}`);
  }

  // hydrate from localStorage
  useEffect(() => {
    setHydratedUserId(null);
    let nextProfile = {
      name: currentUser.name,
      title: currentUser.title,
      email: currentUser.email || "",
      signature: `${currentUser.name}\nFreyr Solutions`,
      linkedin: "",
    };
    setInvite({ name: "", email: "", role: "Rep" });
    setNotifs({ ...DEFAULT_NOTIFICATIONS });
    setRole(authenticatedRoleLabel);
    setSso({
      provider: "Azure AD",
      connected: false,
      enforce: false,
      twoFactor: false,
    });
    setConnectors({});
    setAccessDirectory(
      initialAccessDirectory(currentUser)
    );
    setAccessBusy(null);
    try {
      const p = localStorage.getItem(profileStorageKey);
      if (p) {
        const saved = JSON.parse(p) as {
          title?: unknown;
          signature?: unknown;
          linkedin?: unknown;
        };
        nextProfile = {
          ...nextProfile,
          title:
            typeof saved.title === "string" ? saved.title : nextProfile.title,
          signature:
            typeof saved.signature === "string"
              ? saved.signature
              : nextProfile.signature,
          linkedin:
            typeof saved.linkedin === "string"
              ? saved.linkedin
              : nextProfile.linkedin,
          // Identity always comes from the verified server session.
          name: currentUser.name,
          email: currentUser.email || "",
        };
      }
      const n = localStorage.getItem(notifStorageKey);
      if (n) setNotifs((s) => ({ ...s, ...JSON.parse(n) }));
      const r = localStorage.getItem(roleStorageKey);
      if (r && initialDataMode === "mock" && !authConfig.approvalEnabled) {
        setRole(r);
      } else {
        setRole(authenticatedRoleLabel);
      }
      const s = localStorage.getItem(ssoStorageKey);
      if (s && initialDataMode === "mock" && isLocalAuth) {
        setSso((v) => ({ ...v, ...JSON.parse(s) }));
      }
      const cn = localStorage.getItem(connectorStorageKey);
      if (cn) setConnectors(JSON.parse(cn));
    } catch {
      // Invalid data in one account's browser storage must not preserve values
      // from the previously signed-in account.
    } finally {
      setProfile(nextProfile);
      setSavedProfile(nextProfile);
      setHydratedUserId(currentUser.id);
    }
  }, [
    currentUser,
    currentUser.id,
    currentUser.email,
    currentUser.name,
    currentUser.role,
    currentUser.title,
    authConfig.approvalEnabled,
    authenticatedRoleLabel,
    initialDataMode,
    isLocalAuth,
    profileStorageKey,
    notifStorageKey,
    roleStorageKey,
    ssoStorageKey,
    connectorStorageKey,
  ]);

  const profileDirty =
    hydratedUserId === currentUser.id &&
    JSON.stringify(profile) !== JSON.stringify(savedProfile);

  useEffect(() => {
    if (!authConfig.approvalEnabled) return;
    // ONLY ADMINS MAY READ THE DIRECTORY, so only admins should ask for it.
    // Everyone else used to open Settings, get a red "Couldn't load workspace
    // access" toast from the 403, and then be shown "Active members 1" — an
    // error and a false roster, for doing nothing but visiting the page.
    if (currentUser.role !== "admin") return;
    let active = true;
    fetch("/api/settings/access", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Access directory unavailable");
        const directory = await response.json();
        if (active) setAccessDirectory(directory);
      })
      .catch(() => {
        if (active) toast("Couldn't load workspace access", "error");
      });
    return () => {
      active = false;
    };
  }, [authConfig.approvalEnabled, currentUser.id, toast]);

  const canInvite = authConfig.approvalEnabled
    ? currentUser.role === "admin"
    : role === "Admin";
  const canSecurity = authConfig.approvalEnabled
    ? currentUser.role === "admin"
    : role === "Admin";

  function selectRole(r: string) {
    if (authConfig.approvalEnabled) {
      toast("Your role is managed by workspace access");
      return;
    }
    setRole(r);
    try {
      localStorage.setItem(roleStorageKey, r);
    } catch {}
    toast(`You're now acting as ${r}`);
  }
  function updateSso(patch: Partial<typeof sso>) {
    const next = { ...sso, ...patch };
    setSso(next);
    try {
      localStorage.setItem(ssoStorageKey, JSON.stringify(next));
    } catch {}
  }

  /**
   * Turn the pasted LinkedIn URL into identity the agent can read. Runs as part
   * of Save so there is no second button to discover — the rep pastes a link,
   * saves, and the agent knows who they are.
   */
  async function syncLinkedIn() {
    const url = profile.linkedin.trim();
    if (url === (savedLinkedinRef.current || "")) return; // unchanged
    savedLinkedinRef.current = url;
    if (!url) {
      setLinkedinStatus(null);
      void fetch("/api/profile/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedinUrl: "" }),
      }).catch(() => {});
      return;
    }
    setLinkedinStatus({ ok: true, message: "Reading your profile…" });
    try {
      const res = await fetch("/api/profile/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedinUrl: url }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setLinkedinStatus({
          ok: true,
          message: data?.profile?.headline
            ? `Got it: the agent now knows you as "${data.profile.headline}".`
            : "Saved. The agent will use this when it writes as you.",
        });
      } else {
        setLinkedinStatus({
          ok: false,
          message: data?.error || "Couldn't read that profile. Check the link.",
        });
      }
    } catch {
      setLinkedinStatus({
        ok: false,
        message: "Couldn't reach the profile service. Try saving again.",
      });
    }
  }

  /**
   * PROFILE PHOTO, UPLOADED FROM THIS MACHINE.
   *
   * Downscaled in the browser to a 256px square before it is sent: a phone
   * photo is several megabytes, the avatar renders at 56px, and shipping the
   * original would be slow for no visible gain.
   */
  // Shared with the header and sidebar: one upload, every avatar.
  const { photo, refresh: refreshPhoto } = useMyPhoto();
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  async function squareDataUrl(file: File): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const size = Math.min(256, side);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    // Centre-crop to a square so faces are not squashed into the circle.
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size
    );
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  async function onPickPhoto(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Pick an image file", "error");
      return;
    }
    setPhotoBusy(true);
    try {
      const dataUrl = await squareDataUrl(file);
      const res = await fetch("/api/profile/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo: dataUrl }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "upload failed");
      refreshPhoto();
      toast("Profile picture updated");
      router.refresh();
    } catch (error) {
      toast(
        error instanceof Error && error.message !== "upload failed"
          ? error.message
          : "Couldn't save that picture. Try another one.",
        "error"
      );
    } finally {
      setPhotoBusy(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    try {
      await fetch("/api/profile/photo", { method: "DELETE" });
      refreshPhoto();
      toast("Back to your initials");
      router.refresh();
    } catch {
      toast("Couldn't remove the picture. Try again.", "error");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function saveProfile() {
    try {
      localStorage.setItem(
        profileStorageKey,
        JSON.stringify({
          title: profile.title,
          signature: profile.signature,
          linkedin: profile.linkedin,
        })
      );
    } catch {}
    void syncLinkedIn();
    const nextName = profile.name.trim();
    if (!nextName || nextName === currentUser.name) {
      setSavedProfile(profile);
      toast("Profile saved");
      return;
    }
    // The display name is workspace identity, not a local preference — write it
    // through to the directory so it changes everywhere, for everyone.
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      if (res.ok) {
        setSavedProfile({ ...profile, name: nextName });
        toast("Profile saved: your name is updated everywhere");
        router.refresh();
      } else if (res.status === 404) {
        // Local/demo workspace without sign-in — nothing server-side to update.
        setSavedProfile({ ...profile, name: nextName });
        toast("Profile saved");
      } else {
        const data = await res.json().catch(() => null);
        toast(data?.error || "Couldn't update your name. Try again.", "error");
      }
    } catch {
      toast("Couldn't update your name. Try again.", "error");
    }
  }
  async function addMember() {
    if (!canInvite) {
      toast("Reps can't invite teammates: ask an admin or manager", "error");
      return;
    }
    if (!invite.name.trim() || !invite.email) {
      toast("Full name and email are required", "error");
      return;
    }
    const accessRole: AccessRole = invite.role === "Admin" ? "admin" : invite.role === "Manager" ? "editor" : "sales";
    setAccessBusy("invite");
    try {
      if (authConfig.approvalEnabled) {
        const response = await fetch("/api/settings/access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "invite",
            name: invite.name.trim(),
            email: invite.email,
            role: accessRole,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Invite failed");
        setAccessDirectory(data.directory);
        const delivery = data.invitationDelivery?.emailResult as
          | { ok?: boolean; skipped?: boolean; error?: string }
          | undefined;
        if (delivery?.ok && !delivery.skipped) {
          toast(`Invitation emailed to ${invite.email}`);
        } else {
          toast(
            delivery?.error
              ? `Invitation created, but email failed: ${delivery.error}`
              : "Invitation created, but email delivery is not configured",
            "error"
          );
        }
      } else {
        setAccessDirectory((directory) => ({
          ...directory,
          invitations: [
            {
              id: `invite-${Date.now()}`,
              name: invite.name.trim(),
              email: invite.email.toLowerCase(),
              role: accessRole,
              expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
            },
            ...directory.invitations,
          ],
        }));
        toast(`Demo invitation created for ${invite.email}`);
      }
      setInvite({ name: "", email: "", role: "Rep" });
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
      localStorage.setItem(notifStorageKey, JSON.stringify(next));
    } catch {}
  }

  if (hydratedUserId !== currentUser.id) return null;

  return (
    <div className="grid max-w-[1280px] grid-cols-[220px_minmax(0,1fr)] gap-7">
      <aside className="border-r border-border-light pr-5">
        <div className="sticky top-0">
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
            Workspace settings
          </p>
          <nav role="tablist" aria-label="Settings sections" className="space-y-1">
            {visibleTabs.map((item) => {
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
                value: authProviderLabel,
                detail: authProviderDetail,
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
          <Card className="px-5 py-4" data-tour="settings-data-mode">
            <div className="flex items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-semibold text-text-primary">Workspace data</h2>
                  {initialDataModeLocked && (
                    <span className="rounded-md bg-blue-light px-2 py-1 text-[9.5px] font-semibold uppercase tracking-[0.04em] text-blue-primary">
                      Deployment controlled
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11.5px] text-text-secondary">
                  {initialDataModeLocked
                    ? `This release is locked to ${dataMode === "mock" ? "Mock Mode" : "Real Mode"} for every signed-in user.`
                    : canChangeDataMode
                      ? "Choose whether this browser uses sample records or the connected workspace."
                      : "A workspace admin decides whether the team sees the released app or the modules still being built."}
                </p>
              </div>
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
                  disabled={initialDataModeLocked || modeBusy || !canChangeDataMode}
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

          <Card
            data-tour="settings-product-tour"
            className="relative overflow-hidden p-0"
          >
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-1 bg-blue-primary"
            />
            <div className="relative flex flex-col items-start justify-between gap-5 px-6 py-5 md:flex-row md:items-center">
              <div className="flex min-w-0 items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-light text-blue-primary">
                  <Rocket size={20} strokeWidth={1.8} />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-semibold text-text-primary">
                      Guided product tour
                    </h2>
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-success">
                      Available anytime
                    </span>
                  </div>
                  <p className="mt-1 max-w-[650px] text-[12.5px] leading-relaxed text-text-secondary">
                    Open the tour center to start, continue, or replay a guided
                    walkthrough. Your progress is saved between visits.
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] font-medium text-text-tertiary">
                    <span>Page-by-page guidance</span>
                    <span aria-hidden="true" className="h-1 w-1 rounded-full bg-border" />
                    <span>Focused feature highlights</span>
                    <span aria-hidden="true" className="h-1 w-1 rounded-full bg-border" />
                    <span>Resume whenever you want</span>
                  </div>
                </div>
              </div>
              <Button
                onClick={() => router.push("/onboarding")}
                className="shrink-0"
                aria-label="Open guided product tour"
              >
                Open product tour
                <ArrowRight size={16} strokeWidth={2} />
              </Button>
            </div>
          </Card>
        </div>
      )}

      {tab === "profile" && (
        <Card>
          <div className="flex items-center gap-4 mb-5">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={photoBusy}
              title="Upload a profile picture"
              className="group relative h-14 w-14 shrink-0 rounded-full disabled:opacity-60"
            >
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo}
                  alt={profile.name}
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <Avatar name={profile.name} className="w-14 h-14 text-[18px]" />
              )}
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                {photoBusy ? "…" : "Change"}
              </span>
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onPickPhoto(e.target.files?.[0] ?? null)}
            />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-text-primary">{profile.name}</p>
              <p className="text-[13px] text-text-secondary">{profile.title}</p>
              {/* The avatar itself is the control: hover it and it says Change
                  (Anir, Jul 29: "it shouldn't be an upload a picture button").
                  Remove only appears once there is something to remove. */}
              {photo && (
                <button
                  type="button"
                  onClick={() => void removePhoto()}
                  disabled={photoBusy}
                  className="mt-1 text-[12px] font-semibold text-text-secondary hover:underline disabled:opacity-60"
                >
                  Remove picture
                </button>
              )}
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-[13px] font-medium text-text-primary mb-1.5">Full name</span>
                <Input
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="block text-[13px] font-medium text-text-primary mb-1.5">Title</span>
                <Input value={profile.title} onChange={(e) => setProfile({ ...profile, title: e.target.value })} />
              </label>
            </div>
            <label className="block">
              <span className="block text-[13px] font-medium text-text-primary mb-1.5">Email</span>
              <Input type="email" value={profile.email} readOnly aria-readonly="true" />
            </label>
            {/* TIME ZONE. Every timestamp in the app is rendered in this zone,
                and hovering one shows the exact time (Anir, Jul 30). Automatic
                follows the device, which is right for almost everyone and stays
                right when they travel; an explicit zone is for the person who
                wants their times in head-office hours wherever they are.
                Either way the app stores a ZONE, never an offset, so daylight
                saving is handled for it. */}
            <label className="block">
              <span className="block text-[13px] font-medium text-text-primary mb-1.5">
                Time zone
              </span>
              <ColorSelect
                ariaLabel="Time zone"
                className={savingZone ? "pointer-events-none w-full opacity-60" : "w-full"}
                collapsible={false}
                value={savedZone}
                onChange={(v) => void saveTimeZone(v)}
                options={[
                  {
                    value: "",
                    label: `Automatic — follow this device (${describeZone(detectedZone)})`,
                    icon: MonitorSmartphone,
                    color: "#0071E3",
                  },
                  ...zoneChoices.map((z) => ({
                    value: z,
                    label: describeZone(z),
                    icon: Clock,
                    color: "#0F766E",
                  })),
                ]}
              />
              <span className="mt-1.5 block text-[12px] text-text-secondary">
                Times read in <strong>{describeZone(activeZone)}</strong>. Right
                now that is {nowInZone}.
              </span>
            </label>
            <label className="block">
              <span className="block text-[13px] font-medium text-text-primary mb-1.5">Email signature</span>
              <Textarea className="min-h-[90px]" value={profile.signature} onChange={(e) => setProfile({ ...profile, signature: e.target.value })} />
            </label>
            {/* The agent drafts in the rep's own voice, so it has to know who
                the rep is. LinkedIn is the one link that carries role, tenure
                and background in a form the enrichment run can read, and it is
                where the profile photo comes from, replacing the initials
                circle (Anir, Jul 25: "the agent should know all about my
                LinkedIn URL… that's how it pulls your profile picture too"). */}
            <label className="block">
              <span className="block text-[13px] font-medium text-text-primary mb-1.5">
                LinkedIn profile
              </span>
              <Input
                type="url"
                inputMode="url"
                placeholder="https://www.linkedin.com/in/your-profile"
                value={profile.linkedin}
                onChange={(e) =>
                  setProfile({ ...profile, linkedin: e.target.value })
                }
                aria-describedby="linkedin-help"
              />
              <span
                id="linkedin-help"
                className="mt-1.5 block text-[12px] text-text-secondary"
              >
                Paste your LinkedIn address. The agent reads it to learn your
                role and background, so what it writes sounds like you, and it
                can pick up your photo. Optional: you can upload a picture above instead.
              </span>
              {linkedinStatus && (
                <span
                  role="status"
                  className={cn(
                    "mt-1.5 block text-[12px] font-medium",
                    linkedinStatus.ok ? "text-emerald-700" : "text-red-600"
                  )}
                >
                  {linkedinStatus.message}
                </span>
              )}
            </label>
            {profileDirty && (
              <div className="page-in">
                <Button onClick={saveProfile}>Save profile</Button>
              </div>
            )}
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
                <p className="mt-1 text-[11.5px] text-text-secondary">Invite any valid email address. Only workspace owners can create invitations, and each invite expires after 14 days.</p>
              </div>
              <span className="rounded-md bg-success/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-success">Invite only</span>
            </div>
            <div className="mt-4 grid grid-cols-[minmax(180px,0.8fr)_minmax(240px,1fr)_160px_auto] items-end gap-3">
              <label>
                <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Full name</span>
                <Input
                  autoComplete="name"
                  placeholder="Teammate’s name"
                  value={invite.name}
                  onChange={(e) =>
                    setInvite({ ...invite, name: e.target.value })
                  }
                />
              </label>
              <label>
                <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Work email</span>
                {/* THIS WORKSPACE'S OWN DOMAIN, not a stock "company.com"
                    (Anir, Jul 30: "make sure this is personalized for Freyr
                    Solutions. It shouldn't say add company name"). Taken from
                    the signed-in admin's address rather than hardcoded, so it
                    stays true if Freyr ever runs this on another domain. */}
                <Input type="email" placeholder={`name@${workspaceDomain}`} value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
              </label>
              <label>
                <span className="mb-1.5 block text-[11px] font-semibold text-text-secondary">Starting role</span>
                {/* A colour + an icon each, like every other picker in the app.
                    A bare native select was the last plain-text dropdown left,
                    and what someone can DO here is exactly the kind of fact the
                    chip rule exists for. */}
                <ColorSelect
                  value={invite.role}
                  onChange={(v) => setInvite({ ...invite, role: v })}
                  options={INVITE_ROLE_OPTIONS}
                  ariaLabel="Starting role"
                />
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
                  {/* Same three names, same chip, as the account menu. This
                      row used to say "Catalog editor" for the role the invite
                      form calls "Manager". */}
                  <RoleTag role={member.role} size="sm" />
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
                  <div className="flex items-center justify-between gap-3"><h2 className="text-[14px] font-semibold text-text-primary">Invite-only workspace</h2><span className={cn("rounded-md px-2 py-1 text-[10px] font-semibold", authConfig.approvalEnabled ? "bg-success/10 text-success" : "bg-surface text-text-tertiary")}>{authConfig.approvalEnabled ? "On" : "Off on this server"}</span></div>
                  {/* STATE THE DEPLOYMENT FACT, DON'T IMPLY A BUTTON. This said
                      "Ready to enable" — but the switch is AUTH_MODE, fixed at
                      deploy time, with no control anywhere in the product. And
                      "Enforced" overstated it: anyone with a company address
                      joins on their own, by design. Say both plainly. */}
                  <p className="mt-1 text-[11.5px] leading-relaxed text-text-secondary">
                    {authConfig.approvalEnabled
                      ? `Anyone with a ${workspaceDomain} address joins automatically. Everyone else needs an invitation from an admin, and is stopped at a pending screen until then.`
                      : "This server runs without sign-in, so approval is not applied. It is set by the deployment, not from this page."}
                  </p>
                  <div className="mt-3 flex items-center gap-4 text-[10.5px] font-medium text-text-tertiary">
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck size={13} className={isLocalAuth ? "text-warning" : "text-success"} />
                      {authConfig.authMode === "supabase"
                        ? "Verified email required"
                        : isLocalAuth
                          ? "Local demo identity"
                          : "Single sign-on required"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <UserCheck size={13} className={authConfig.approvalEnabled ? "text-success" : "text-warning"} />
                      {authConfig.approvalEnabled ? "Invitation required" : "Approval gate off"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Database size={13} className="text-success" /> Server-only database
                    </span>
                  </div>
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
              <div><h2 className="text-[14px] font-semibold text-text-primary">Access requests</h2><p className="text-[11px] text-text-tertiary">Any identity awaiting an admin decision appears here.</p></div>
              <span className={cn("rounded-md px-2 py-1 text-[10.5px] font-semibold", accessDirectory.requests.length ? "bg-warning/10 text-warning" : "bg-success/10 text-success")}>{accessDirectory.requests.length ? `${accessDirectory.requests.length} pending` : "Queue clear"}</span>
            </div>
            {accessDirectory.requests.length ? (
              <ul className="divide-y divide-border-light">
                {accessDirectory.requests.map((request) => (
                  <li key={request.id} className="flex items-center justify-between gap-5 px-5 py-3.5">
                    <div className="flex min-w-0 items-center gap-3"><Avatar name={request.name} className="h-9 w-9 shrink-0 text-[12px]" /><span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-text-primary">{request.name}</span><span className="block truncate text-[11px] text-text-tertiary">{request.email || "Email not asserted by identity provider"}</span></span></div>
                    <div className="flex items-center gap-2">
                      <span className="mr-2 text-[10.5px] text-text-tertiary">Requested {new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-Math.max(1, Math.round((Date.now() - new Date(request.requestedAt).getTime()) / 60000)), "minute")}</span>
                      {/* Admins only. The server 403s everyone else, so a Rep
                          who clicked these got nothing but a red toast. */}
                      {canInvite && (
                        <>
                      <button disabled={accessBusy === request.id} onClick={() => reviewRequest(request.id, "reject", request.requestedRole)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[11.5px] font-semibold text-text-secondary hover:bg-surface disabled:opacity-50"><UserX size={13} /> Reject</button>
                      <button disabled={accessBusy === request.id} onClick={() => reviewRequest(request.id, "approve", request.requestedRole)} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-primary px-3 text-[11.5px] font-semibold text-white hover:bg-blue-hover disabled:opacity-50"><UserCheck size={13} /> Approve</button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 px-5 py-5 text-[12px] text-text-secondary"><Check size={15} className="text-success" /> No one is waiting for access.</div>
            )}
          </Card>

          {/* THE "YOUR ROLE" SELF-SELECT CARD IS GONE. It rendered three
              buttons — Admin, Manager, Rep — that any Rep could press. It
              wrote localStorage and unlocked the invite form and security
              controls in the UI while changing nothing on the server, so it
              was fake privilege that made this page lie about what someone
              could do. A role is granted by an admin, never chosen. */}

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
                    <td className="px-5 py-3 text-[13px] text-text-primary">
                      {p.cap}
                      {/* A rule that is not "by role" needs saying, or three
                          dashes read as "nobody can do this". */}
                      {p.note && (
                        <span className="mt-0.5 block text-[11.5px] text-text-secondary">
                          {p.note}
                        </span>
                      )}
                    </td>
                    {(["admin", "manager", "rep"] as const).map((k) => (
                      <td key={k} className="px-3 py-3 text-center">
                        {p[k] ? (
                          <Check size={15} strokeWidth={2.5} className="text-success inline" />
                        ) : (
                          <span className="text-text-tertiary">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* THE "SSO & SECURITY — DEMO ONLY" CARD IS GONE.
              It offered a provider dropdown, a Connect button that toasted
              "Connected Azure AD SSO", and toggles for enforcing SSO and
              two-factor — all of it writing localStorage. Its own subtitle
              admitted it: "Browser-only controls for previewing the local
              demo. They do not configure a deployment." It rendered only where
              AUTH_MODE is unset, i.e. a developer's machine, which is exactly
              where it got demoed from. What remains is the honest read-only
              statement of what this deployment actually enforces. */}

            <Card>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
                    <Lock size={18} strokeWidth={1.75} className="text-blue-primary" />
                    Authentication &amp; security
                  </h2>
                  <p className="mt-1 text-[11.5px] text-text-secondary">
                    Read-only deployment policy for this workspace.
                  </p>
                </div>
                <span className="rounded-md bg-blue-light px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-blue-primary">
                  Managed by deployment
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-md border border-border-light">
                {[
                  {
                    label: "Identity provider",
                    value:
                      authConfig.authMode === "supabase"
                        ? "Supabase Auth"
                        : authProviderLabel,
                  },
                  { label: "Sign-in method", value: signInMethod },
                  {
                    label: "Identity verification",
                    value: identityVerification,
                  },
                  {
                    label: "Workspace access",
                    value: authConfig.approvalEnabled
                      ? "Invite only"
                      : "Approval gate not enforced",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="border-b border-r border-border-light px-4 py-3 last:border-b-0"
                  >
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                      {item.label}
                    </dt>
                    <dd className="mt-1 text-[13px] font-semibold text-text-primary">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[11.5px] leading-relaxed text-text-secondary">
                {authConfig.authMode === "supabase"
                  ? "Users must receive an invitation, create their own password, and confirm their email before they can access Freyr."
                  : "Sign-in policy is enforced by the configured identity provider before workspace approval is evaluated."}
              </p>
            </Card>

        </div>
      )}

      {tab === "integrations" && (
        <div className="space-y-4">
          <p className="text-[13px] text-text-secondary max-w-[640px]">
            Connect the tools your team already uses. Freyr works alongside them,
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
              your admin, nothing to connect here, just what&apos;s live.
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
