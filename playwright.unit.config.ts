import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["email-delivery.spec.ts", "approved-pitch-email.spec.ts"],
  timeout: 10000,
  workers: 1,
});
