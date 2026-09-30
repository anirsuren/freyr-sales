"use client";

import { useEffect, useState } from "react";

/**
 * WHAT IS COMING UP, FOR THE DOCK. The same engine the chat answers from
 * (lib/agentReminders), read through /api/agent/reminders.
 *
 * Several dock instances can be mounted at once (the floating one and a docked
 * one beside a material), so the read is shared: one request per five minutes
 * per tab, whichever instance asks first.
 */
export type DockReminder = {
  id: string;
  kind: "meeting" | "solutioning" | "contract" | "deal" | "followup" | "personal";
  bucket: "overdue" | "today" | "tomorrow" | "attention" | "week" | "later";
  day: string;
  daysAway: number;
  time?: string;
  title: string;
  line: string;
  href: string;
};

export type DockReminders = { today: string; reminders: DockReminder[] };

const TTL_MS = 5 * 60_000;
let cached: { at: number; value: Promise<DockReminders | null> } | null = null;

/** Set once the agent's own door answers 403: the agent is not open to this
 *  account (a Solutioning Member, or a privilege set without the agent). */
let closedToThisAccount = false;
const closedListeners = new Set<() => void>();

function load(force = false): Promise<DockReminders | null> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = fetch("/api/agent/reminders?days=7", { cache: "no-store" })
    .then((r) => {
      if (r.status === 403) {
        closedToThisAccount = true;
        closedListeners.forEach((listener) => listener());
      }
      return r.ok ? r.json() : null;
    })
    .then((d) => (d && Array.isArray(d.reminders) ? { today: String(d.today || ""), reminders: d.reminders as DockReminder[] } : null))
    .then((data) => {
      lastKnown = data;
      return data;
    })
    .catch(() => null);
  cached = { at: Date.now(), value };
  return value;
}

/** The last answer this tab saw, so a page that mounts after the dock already
 *  asked renders the list on its first paint instead of popping it in late
 *  (a late pop-in broke the Agent page's entrance animation before, Jul 29). */
let lastKnown: DockReminders | null = null;

/**
 * IS THE AGENT OPEN TO THEM AT ALL? A Solutioning Member was shown the
 * launcher, typed a question, and got "the connection stopped, ask again to
 * retry" forever, because the agent is closed to that role (found testing Sep
 * 30). The dock asks its own door once and hides the launcher if it is shut.
 */
export function useAgentClosed(): boolean {
  const [closed, setClosed] = useState(closedToThisAccount);
  useEffect(() => {
    const listener = () => setClosed(true);
    closedListeners.add(listener);
    if (!closedToThisAccount) load();
    else setClosed(true);
    return () => {
      closedListeners.delete(listener);
    };
  }, []);
  return closed;
}

/** Overdue, today and tomorrow: the part worth interrupting someone for. */
export function urgentReminders(data: DockReminders | null): DockReminder[] {
  return (data?.reminders ?? []).filter((r) => r.bucket === "overdue" || r.bucket === "today" || r.bucket === "tomorrow");
}

/** "2 due tomorrow", "1 overdue", "Meeting today": what the launcher pill says. */
export function reminderHeadline(urgent: DockReminder[]): string {
  const overdue = urgent.filter((r) => r.bucket === "overdue").length;
  const today = urgent.filter((r) => r.bucket === "today").length;
  const tomorrow = urgent.filter((r) => r.bucket === "tomorrow").length;
  const parts: string[] = [];
  if (overdue) parts.push(`${overdue} overdue`);
  if (today) parts.push(`${today} due today`);
  if (tomorrow) parts.push(`${tomorrow} due tomorrow`);
  return parts.join(" · ");
}

/** The reminder bubble: what matters, each one linked, at most three. */
export function reminderGreeting(urgent: DockReminder[]): string {
  const head = reminderHeadline(urgent);
  const items = urgent.slice(0, 3).map((r) => `- ${r.line.replace(/"([^"]+)"/, `[$1](${r.href})`)}`);
  const more = urgent.length > 3 ? `\n- and ${urgent.length - 3} more. Ask me "what's coming up?" for the full list.` : "";
  return `Heads up, ${head}:\n\n${items.join("\n")}${more}`;
}

export function useAgentReminders(enabled: boolean): DockReminders | null {
  const [data, setData] = useState<DockReminders | null>(() => (enabled ? lastKnown : null));
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const refresh = (force = false) =>
      load(force).then((value) => {
        if (live) setData(value);
      });
    refresh();
    // A reminder that says "tomorrow" at 23:59 must say "today" a minute later.
    const timer = window.setInterval(() => refresh(true), 15 * 60_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled]);
  return data;
}
