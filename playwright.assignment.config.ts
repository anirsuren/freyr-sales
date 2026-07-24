import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.ASSIGNMENT_TEST_PORT || 3014);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --hostname 127.0.0.1`,
    env: {
      ACCESS_CONTROL_MODE: "approval",
      AUTH_COOKIE_SECRET: "freyr-assignment-test-secret-2026-long-enough",
      AUTH_MODE: "supabase",
      AUTH_PUBLIC_ORIGIN: BASE_URL,
      DATA_MODE_LOCKED: "1",
      DEFAULT_DATA_MODE: "live",
      FREYR_WORKSPACE_ID: "00000000-0000-4000-8000-000000000001",
      NEXT_DIST_DIR: ".next-assignment-test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
