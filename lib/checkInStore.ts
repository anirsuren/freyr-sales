import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { isValidTimeZone } from '@/lib/timeZone';
import { validCheckInTime, type CheckInSchedule } from '@/lib/checkInSchedule';
function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Storage unavailable');
  return createClient(url, key, { auth: { persistSession: false } });
}
export async function readCheckIn(workspaceId: string, userId: string): Promise<CheckInSchedule | null> {
  const { data, error } = await db().from('offering_catalog_state').select('catalog').eq('id', `agent-check-in:${workspaceId}:${userId}`).maybeSingle();
  if (error) throw error;
  const s = data?.catalog;
  return s && typeof s.enabled === 'boolean' && validCheckInTime(s.time) && isValidTimeZone(s.timeZone) ? s : null;
}
export async function saveCheckIn(workspaceId: string, userId: string, schedule: CheckInSchedule) {
  const { error } = await db().from('offering_catalog_state').upsert({ id: `agent-check-in:${workspaceId}:${userId}`, catalog: schedule });
  if (error) throw error;
}
