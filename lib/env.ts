// Centralized API-key detection. Every API route consults these helpers to
// decide whether to call a real external service or fall back to mock data.

export const hasSupabase = () =>
  !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

export const hasAnthropic = () => !!process.env.ANTHROPIC_API_KEY;

export const hasFirecrawl = () => !!process.env.FIRECRAWL_API_KEY;

export const hasApify = () => !!process.env.APIFY_API_TOKEN;

export const hasTelegram = () => !!process.env.TELEGRAM_BOT_TOKEN;

// Email send channel — Resend or generic SMTP (V4 #4).
export const hasEmail = () =>
  !!(process.env.RESEND_API_KEY || process.env.SMTP_URL);

// Convenience snapshot used by the /admin system-status panel.
export function getServiceStatus() {
  return {
    anthropic: hasAnthropic(),
    supabase: hasSupabase(),
    firecrawl: hasFirecrawl(),
    apify: hasApify(),
    telegram: hasTelegram(),
    email: hasEmail(),
  };
}
