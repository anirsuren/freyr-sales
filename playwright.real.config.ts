import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.PORT || 3002);

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    viewport: { width: 1600, height: 1000 },
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --hostname 127.0.0.1`,
    env: {
      DEFAULT_DATA_MODE: "live",
      DATA_MODE_LOCKED: "1",
      AUTH_MODE: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      AGENT_FORCE_MOCK: "1",
    },
    url: `http://127.0.0.1:${PORT}/offerings`,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
