import { NextRequest, NextResponse } from 'next/server';
import { verifiedRequestMemberScope } from '@/lib/memberScope';
import { readCheckIn, saveCheckIn } from '@/lib/checkInStore';
import { validCheckInTime } from '@/lib/checkInSchedule';
import { isValidTimeZone } from '@/lib/timeZone';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) return NextResponse.json({ error: 'Sign in to view your check-in.' }, { status: 403 });
  try { return NextResponse.json({ schedule: await readCheckIn(scope.workspaceId, scope.userId) }); }
  catch { return NextResponse.json({ error: 'Check-in settings could not be loaded.' }, { status: 503 }); }
}
export async function PUT(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) return NextResponse.json({ error: 'Sign in to save your check-in.' }, { status: 403 });
  const s = await req.json().catch(() => null);
  if (!s || typeof s.enabled !== 'boolean' || !validCheckInTime(s.time) || typeof s.timeZone !== 'string' || !isValidTimeZone(s.timeZone)) return NextResponse.json({ error: 'Choose a valid time and timezone.' }, { status: 400 });
  try { await saveCheckIn(scope.workspaceId, scope.userId, { enabled: s.enabled, time: s.time, timeZone: s.timeZone }); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: 'Your check-in could not be saved. Try again.' }, { status: 503 }); }
}
