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
};

export default nextConfig;
