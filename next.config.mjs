/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disabled so the streaming pipeline effect on the loading page runs exactly
  // once in dev (React StrictMode double-invokes effects, which would fire the
  // SSE pipeline twice).
  reactStrictMode: false,
  // Types are guarded by `tsc --noEmit` and 86 Playwright tests; don't let
  // stylistic ESLint rules (no-explicit-any in mock adapters, etc.) block the
  // production build / Vercel deploy.
  eslint: { ignoreDuringBuilds: true },
  // Kill the App Router's 30s client-side page cache for dynamic pages.
  // Without this, saving on one page and navigating to another (e.g. submit
  // a pitch for review → open the Sessions list) showed a STALE cached copy
  // of the list — reads exactly like "my save disappeared" (Anir, Jul 5).
  experimental: { staleTimes: { dynamic: 0 } },
};

export default nextConfig;
