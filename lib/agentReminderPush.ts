import "server-only";
import { createClient } from "@supabase/supabase-js";
import { readPrivileges, accessMapFor } from "@/lib/privileges";
import { canAccessModuleWith } from "@/lib/moduleAccess";
import type { UserIdentityRole } from "@/lib/userIdentity";
import { memberTimeZone } from "@/lib/memberTimeZone";
import { localDay } from "@/lib/agentActionsShared";
import { remindersFor, type AgentReminder, type ReminderAccess } from "@/lib/agentReminders";
import { readDurableConversations } from "@/lib/agentConversationStore";
import { canSendWhatsApp, sendWhatsAppText, toWhatsAppText, whatsappConfig } from "@/lib/whatsapp";

/**
 * THE REMINDER COMES TO THE PHONE (Anir, Sep 30: "if a deadline is coming or
 * something tomorrow it should remind me").
 *
 * Twice a day on each person's own clock: at 8 in the morning, what is due
 * today and what is overdue; at 6 in the evening, what is due tomorrow. Only
 * people who linked a WhatsApp number get it (linking is the opt-in), only
 * their own records, only modules they can open, and each slot goes out once.
 *
 * WHATSAPP'S 24-HOUR RULE. A business may write freely only inside 24 hours of
 * the person's last message; outside it Meta requires a pre-approved template.
 * Until a reminder template is approved on the real number, a closed window
 * means the reminder waits in the app (the dock shows it) instead of going out.
 */

export type ReminderSlot = "morning" | "evening";

export const SLOT_HOUR: Record<ReminderSlot, number> = { morning: 8, evening: 18 };
const WINDOW_MS = 23 * 60 * 60 * 1000; // an hour of margin inside Meta's 24
const LOG_ROW = (workspaceId: string) => `agent-reminder-log:${workspaceId}`;

type Member = { userId: string; workspaceId: string; name: string; role: UserIdentityRole; number: string };

export type PushOutcome = {
  person: string;
  slot: ReminderSlot;
  day: string;
  items: number;
  result: "sent" | "nothing-due" | "window-closed" | "not-their-hour" | "already-sent" | "no-sender" | "failed";
  detail?: string;
  text?: string;
};

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
}

/** Everyone with a linked WhatsApp number, with the name and role the app knows them by. */
async function linkedMembers(): Promise<Member[]> {
  const client = db();
  if (!client) return [];
  const { data: rows } = await client
    .from("offering_catalog_state")
    .select("catalog")
    .like("id", "member-profile:%")
    .not("catalog->profile->whatsapp->>number", "is", null);
  const links = (rows ?? [])
    .map((row) => row.catalog as { workspaceId?: string; userId?: string; profile?: { whatsapp?: { number?: string } } } | null)
    .filter((c): c is { workspaceId: string; userId: string; profile: { whatsapp: { number: string } } } =>
      Boolean(c?.workspaceId && c?.userId && c?.profile?.whatsapp?.number));
  if (!links.length) return [];
  const { data: users } = await client
    .from("app_users")
    .select("id,display_name,app_role,active")
    .in("id", links.map((l) => l.userId));
  const byId = new Map((users ?? []).map((u) => [u.id as string, u]));
  const out: Member[] = [];
  for (const link of links) {
    const user = byId.get(link.userId);
    if (!user || user.active === false) continue;
    out.push({
      userId: link.userId,
      workspaceId: link.workspaceId,
      name: String(user.display_name || ""),
      role: String(user.app_role || "bd_member") as UserIdentityRole,
      number: String(link.profile.whatsapp.number),
    });
  }
  return out;
}

async function readLog(workspaceId: string): Promise<Record<string, string>> {
  const client = db();
  if (!client) return {};
  const { data } = await client.from("offering_catalog_state").select("catalog").eq("id", LOG_ROW(workspaceId)).maybeSingle();
  const sent = (data?.catalog as { sent?: Record<string, string> } | null)?.sent;
  return sent && typeof sent === "object" ? { ...sent } : {};
}

async function writeLog(workspaceId: string, sent: Record<string, string>): Promise<void> {
  const client = db();
  if (!client) return;
  // Keep a fortnight; the log only exists to stop a slot going out twice.
  const cutoff = Date.now() - 14 * 86_400_000;
  const kept = Object.fromEntries(Object.entries(sent).filter(([, at]) => Date.parse(at) >= cutoff));
  await client
    .from("offering_catalog_state")
    .upsert({ id: LOG_ROW(workspaceId), catalog: { sent: kept, updatedAt: new Date().toISOString() } });
}

/** The last time this person wrote to the agent on WhatsApp, or 0. */
async function lastInboundAt(member: Member): Promise<number> {
  const conversations = await readDurableConversations({ workspaceId: member.workspaceId, userId: member.userId }).catch(() => null);
  let last = 0;
  for (const c of conversations ?? []) {
    for (const m of c.messages) if (m.role === "user" && m.via === "whatsapp" && m.ts > last) last = m.ts;
  }
  return last;
}

async function accessFor(member: Member): Promise<ReminderAccess> {
  const state = await readPrivileges();
  const map = accessMapFor({ state, role: member.role, person: member.name });
  const can = (path: string) => canAccessModuleWith(path, member.role, map);
  return {
    meetings: can("/meetings"),
    solutioning: can("/solutioning"),
    contracts: can("/contracts"),
    opportunities: can("/opportunities"),
    customers: can("/customers"),
  };
}

/** The message itself: short, plain, one line per item, no app links. */
export function reminderMessage(firstName: string, slot: ReminderSlot, items: AgentReminder[]): string {
  const lines = items.slice(0, 8).map((r) => `• ${r.line}`);
  const more = items.length > 8 ? `\n• and ${items.length - 8} more. Ask me "what's coming up?"` : "";
  const head =
    slot === "morning"
      ? `Good morning ${firstName}. Here is what needs you today:`
      : `Evening ${firstName}. A heads up for tomorrow:`;
  return `${head}\n\n${lines.join("\n")}${more}\n\nReply here if you want me to move a date, log an outcome or draft something.`;
}

function itemsFor(slot: ReminderSlot, reminders: AgentReminder[]): AgentReminder[] {
  return slot === "morning"
    ? reminders.filter((r) => r.bucket === "overdue" || r.bucket === "today")
    : reminders.filter((r) => r.bucket === "tomorrow");
}

/**
 * One pass. With `force`, the hour check is skipped (the test door); the
 * once-per-slot log always holds unless `resend` is also set.
 */
export async function runReminderPush(options: {
  now?: Date;
  slot?: ReminderSlot;
  force?: boolean;
  resend?: boolean;
  dryRun?: boolean;
  onlyUserId?: string;
} = {}): Promise<PushOutcome[]> {
  const now = options.now ?? new Date();
  const config = whatsappConfig();
  const members = (await linkedMembers()).filter((m) => !options.onlyUserId || m.userId === options.onlyUserId);
  const outcomes: PushOutcome[] = [];
  const logs = new Map<string, Record<string, string>>();

  for (const member of members) {
    const timeZone = await memberTimeZone(member.userId);
    const hour = Number(
      new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now),
    );
    const slots: ReminderSlot[] = options.slot
      ? [options.slot]
      : (Object.keys(SLOT_HOUR) as ReminderSlot[]).filter((s) => options.force || SLOT_HOUR[s] === hour);
    const day = localDay(now, timeZone).ymd;
    const firstName = member.name.trim().split(/\s+/)[0] || member.name;
    if (!slots.length) {
      outcomes.push({ person: member.name, slot: "morning", day, items: 0, result: "not-their-hour", detail: `${hour}:00 in ${timeZone}` });
      continue;
    }
    for (const slot of slots) {
      if (!options.force && SLOT_HOUR[slot] !== hour) {
        outcomes.push({ person: member.name, slot, day, items: 0, result: "not-their-hour", detail: `${hour}:00 in ${timeZone}` });
        continue;
      }
      if (!logs.has(member.workspaceId)) logs.set(member.workspaceId, await readLog(member.workspaceId));
      const log = logs.get(member.workspaceId)!;
      const key = `${member.userId}:${day}:${slot}`;
      if (log[key] && !options.resend) {
        outcomes.push({ person: member.name, slot, day, items: 0, result: "already-sent", detail: log[key] });
        continue;
      }
      const reminders = await remindersFor({ person: member.name, timeZone, access: await accessFor(member), now, scope: { workspaceId: member.workspaceId, userId: member.userId } });
      const items = itemsFor(slot, reminders);
      if (!items.length) {
        outcomes.push({ person: member.name, slot, day, items: 0, result: "nothing-due" });
        continue;
      }
      const text = toWhatsAppText(reminderMessage(firstName, slot, items), process.env.AUTH_PUBLIC_ORIGIN || process.env.APP_PUBLIC_URL || "");
      const last = await lastInboundAt(member);
      if (!last || now.getTime() - last > WINDOW_MS) {
        outcomes.push({
          person: member.name, slot, day, items: items.length, result: "window-closed", text,
          detail: last ? `last message ${new Date(last).toISOString()}` : "never messaged",
        });
        continue;
      }
      if (options.dryRun || !canSendWhatsApp(config)) {
        outcomes.push({ person: member.name, slot, day, items: items.length, result: "no-sender", text, detail: options.dryRun ? "dry run" : "no WhatsApp token on this server" });
        continue;
      }
      const sent = await sendWhatsAppText(member.number, text, config!);
      if (sent.ok && !sent.skipped) {
        log[key] = now.toISOString();
        outcomes.push({ person: member.name, slot, day, items: items.length, result: "sent", text });
      } else {
        outcomes.push({ person: member.name, slot, day, items: items.length, result: "failed", text, detail: sent.error || "skipped" });
      }
    }
  }

  for (const [workspaceId, sent] of logs) await writeLog(workspaceId, sent).catch(() => undefined);
  return outcomes;
}

/**
 * THE CLOCK. Checked every ten minutes; each person's slot fires in the first
 * pass of their 8:00 and 18:00 hour, and the log makes every later pass in
 * that hour a no-op. Armed once per server process by the agent's own routes,
 * so a server restart re-arms it on the first page anyone opens.
 */
const TIMER_KEY = "__freyrAgentReminderPushTimer";
export function armReminderPush(): void {
  if (process.env.AGENT_REMINDER_PUSH === "off") return;
  const g = globalThis as unknown as Record<string, ReturnType<typeof setInterval> | undefined>;
  if (g[TIMER_KEY]) return;
  g[TIMER_KEY] = setInterval(() => {
    runReminderPush().catch((error) => console.error("[agent] reminder push failed", error));
  }, 10 * 60_000);
  // Never keep a process alive just for this.
  (g[TIMER_KEY] as unknown as { unref?: () => void }).unref?.();
}
