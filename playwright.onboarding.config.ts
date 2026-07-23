import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.ONBOARDING_TEST_PORT || 3022);
const AUTH_COOKIE_SECRET = "freyr-onboarding-test-secret-2026-long-enough";

export default defineConfig({
  testDir: "./tests",
  testMatch: "onboarding.spec.ts",
  timeout: 30000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --hostname 127.0.0.1`,
    env: {
      ACCESS_CONTROL_MODE: "approval",
      AGENT_FORCE_MOCK: "1",
      AUTH_ALLOWED_EMAIL_DOMAINS: "freyrsolutions.com",
      AUTH_COOKIE_SECRET,
      AUTH_MODE: "supabase",
      AUTH_PUBLIC_ORIGIN: `http://127.0.0.1:${PORT}`,
      DATA_MODE_LOCKED: "1",
      DEFAULT_DATA_MODE: "mock",
      FREYR_WORKSPACE_ID: "00000000-0000-4000-8000-000000000001",
      NEXT_DIST_DIR: ".next-onboarding-test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      OWNER_EMAILS: "owner@freyrsolutions.com",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    },
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
