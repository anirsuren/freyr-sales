import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.AUTH_TEST_PORT || 3011);
const AUTH_COOKIE_SECRET = "freyr-auth-test-secret-2026-long-enough";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  workers: 1,
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
      AUTH_COOKIE_SECRET,
      AUTH_MODE: "supabase",
      DATA_MODE_LOCKED: "1",
      DEFAULT_DATA_MODE: "mock",
      FREYR_WORKSPACE_ID: "00000000-0000-4000-8000-000000000001",
      NEXT_DIST_DIR: ".next-auth-test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      OWNER_EMAILS: "owner@example.com",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    },
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
