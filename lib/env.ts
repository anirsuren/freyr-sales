// Centralized API-key detection. Every API route consults these helpers to
// decide whether to call a real external service or fall back to mock data.
import { getDataMode } from "./dataMode";

const live = () => getDataMode() === "live";

// The AI agent is NOT a data-source question. Mock mode means "show seeded
// accounts instead of the real book" — it should never have meant "answer
// from canned templates instead of Claude", but one shared switch made it so
// (Anir, Jul 25: "mock has nothing to do with shit"). The agent, its voice
// personas and its research tools now follow the KEY, not the data mode.

/** Whether database credentials exist, regardless of the viewer's data mode. */
export const isSupabaseConfigured = () =>
  !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

/** Whether this request should actively use the real database as its dataset. */
export const hasSupabase = () => live() && isSupabaseConfigured();

export const hasAnthropic = () => !!process.env.ANTHROPIC_API_KEY;

export const hasFirecrawl = () => !!process.env.FIRECRAWL_API_KEY;

export const hasApify = () => !!process.env.APIFY_API_TOKEN;

export const hasTelegram = () => live() && !!process.env.TELEGRAM_BOT_TOKEN;

// Email send channel — Resend or generic SMTP (V4 #4).
export const hasEmail = () =>
  live() && !!process.env.RESEND_API_KEY;

export const hasCrm = () =>
  live() && !!(process.env.HUBSPOT_ACCESS_TOKEN || process.env.SALESFORCE_CLIENT_ID);

// ElevenLabs — the offering-category voice agents (Suren's Jul 3 ask).
export const hasElevenLabs = () => !!process.env.ELEVENLABS_API_KEY;

// Convenience snapshot used by the /admin system-status panel.
export function getServiceStatus() {
  return {
    anthropic: hasAnthropic(),
    // System status answers "is the service configured?". Mock mode changes
    // which records are displayed; it does not make Supabase disappear.
    supabase: isSupabaseConfigured(),
    firecrawl: hasFirecrawl(),
    apify: hasApify(),
    telegram: hasTelegram(),
    email: hasEmail(),
    elevenlabs: hasElevenLabs(),
  };
}
