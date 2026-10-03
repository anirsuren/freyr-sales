export type CheckInSchedule = { enabled: boolean; time: string; timeZone: string };
export function validCheckInTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
export function checkInDue(now: Date, schedule: CheckInSchedule): boolean {
  if (!schedule.enabled) return false;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: schedule.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const minute = Number(parts.find(p => p.type === 'hour')?.value) * 60 + Number(parts.find(p => p.type === 'minute')?.value);
  const [h,m] = schedule.time.split(':').map(Number);
  // A bounded catch-up window survives a brief restart without sending at night.
  return minute >= h * 60 + m && minute < h * 60 + m + 60;
}

/** A daily conversation starter, including days with no due records. */
export function dailyCheckInMessage(firstName: string, items: { line: string }[]): string {
  if (!items.length) return `Hi ${firstName}, checking in for the day. You have nothing due today or overdue in the work I can see.\n\nWhat would you like to focus on? I can help you plan your day, review a deal or draft a follow-up.`;
  return `Hi ${firstName}. Here is what needs you today:\n\n${items.map(r => `• ${r.line}`).join("\n")}\n\nReply here if you want me to move a date, log an outcome or draft something.`;
}
