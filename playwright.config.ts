import { defineConfig } from "@playwright/test";

// App runs on :3001 in this environment (:3000 was occupied by another project).
const PORT = Number(process.env.PORT || 3001);

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    // AGENT_FORCE_MOCK=1 makes every agent surface fall back to its
    // deterministic output so assertions stay stable even when a real
    // ANTHROPIC_API_KEY is set on the dev box. Run the authoritative suite with
    // no live-key server already on :3001 so Playwright starts this one.
    command: `AGENT_FORCE_MOCK=1 npm run dev -- --port ${PORT} --hostname 127.0.0.1`,
    env: { AGENT_FORCE_MOCK: "1" },
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
