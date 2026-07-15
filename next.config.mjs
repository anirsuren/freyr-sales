/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets local audits use an isolated build cache so another running dev
  // server is never invalidated by type/build verification.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  // Disabled so the streaming pipeline effect on the loading page runs exactly
  // once in dev (React StrictMode double-invokes effects, which would fire the
  // SSE pipeline twice).
  reactStrictMode: false,
  // Types are guarded by `tsc --noEmit` and 86 Playwright tests; don't let
  // stylistic ESLint rules (no-explicit-any in mock adapters, etc.) block the
  // production build / Vercel deploy.
  // Kill the App Router's 30s client-side page cache for dynamic pages.
  // Without this, saving on one page and navigating to another (e.g. submit
  // a pitch for review → open the Sessions list) showed a STALE cached copy
  // of the list — reads exactly like "my save disappeared" (Anir, Jul 5).
  experimental: { staleTimes: { dynamic: 0 } },
};

export default nextConfig;
