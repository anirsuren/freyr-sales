// Centralized API-key detection. Every API route consults these helpers to
// decide whether to call a real external service or fall back to mock data.
import { getDataMode } from "./dataMode";

const live = () => getDataMode() === "live";

export const hasSupabase = () =>
  live() && !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

export const hasAnthropic = () => live() && !!process.env.ANTHROPIC_API_KEY;

export const hasFirecrawl = () => live() && !!process.env.FIRECRAWL_API_KEY;

export const hasApify = () => live() && !!process.env.APIFY_API_TOKEN;

export const hasTelegram = () => live() && !!process.env.TELEGRAM_BOT_TOKEN;

// Email send channel — Resend or generic SMTP (V4 #4).
export const hasEmail = () =>
  live() && !!process.env.RESEND_API_KEY;

export const hasCrm = () =>
  live() && !!(process.env.HUBSPOT_ACCESS_TOKEN || process.env.SALESFORCE_CLIENT_ID);

// ElevenLabs — the offering-category voice agents (Suren's Jul 3 ask).
export const hasElevenLabs = () => live() && !!process.env.ELEVENLABS_API_KEY;

// Convenience snapshot used by the /admin system-status panel.
export function getServiceStatus() {
  return {
    anthropic: hasAnthropic(),
    supabase: hasSupabase(),
    firecrawl: hasFirecrawl(),
    apify: hasApify(),
    telegram: hasTelegram(),
    email: hasEmail(),
    elevenlabs: hasElevenLabs(),
  };
}
