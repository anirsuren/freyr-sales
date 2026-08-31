const nextBuildCpus = Number.parseInt(process.env.NEXT_BUILD_CPUS || "", 10);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets local audits use an isolated build cache so another running dev
  // server is never invalidated by type/build verification.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Standalone packaging is for the Docker deploy. Isolated-distDir builds
  // (the Playwright suite, local audits) serve via `next start`, which
  // refuses standalone output — so only the real build gets it.
  output: process.env.NEXT_DIST_DIR ? undefined : "standalone",
  outputFileTracingRoot: process.cwd(),
  /**
   * ffmpeg-static picks its binary at RUNTIME — `path.join(__dirname,
   * "ffmpeg")` — so Next's tracer copies the wrapper module into
   * .next/standalone and leaves the 78MB executable behind. The Dockerfile
   * ships only .next/standalone, so the container had a transcription
   * pipeline with no transcoder in it. Naming the file here is what puts it
   * in the image.
   */
  outputFileTracingIncludes: {
    "/api/offerings/**": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  /**
   * And keep it OUT of the server bundle. Bundled, ffmpeg-static computes its
   * binary path from a `__dirname` that points at the bundle rather than at
   * the package, so it returned a path to nothing — which is how every video
   * ever uploaded came back "no readable text". Left external, it is required
   * at runtime from real node_modules and computes the right path itself.
   */
  serverExternalPackages: ["ffmpeg-static"],
  // Disabled so the streaming pipeline effect on the loading page runs exactly
  // once in dev (React StrictMode double-invokes effects, which would fire the
  // SSE pipeline twice).
  reactStrictMode: false,
  // Types are guarded by `tsc --noEmit` and 86 Playwright tests; don't let
  // stylistic ESLint rules (no-explicit-any in mock adapters, etc.) block the
  // production build / Vercel deploy.
  // The floating dev-tools bubble Next paints bottom-corner in dev is what
  // read as a "weird transparent broken icon" on the tasks page (Anir,
  // Jul 25) — it is Next's own UI, never ships to production, and Suren
  // reviews the app on the dev server, so it has to go.
  devIndicators: false,
  // Kill the App Router's 30s client-side page cache for dynamic pages.
  // Without this, saving on one page and navigating to another (e.g. submit
  // a pitch for review → open the Sessions list) showed a STALE cached copy
  // of the list — reads exactly like "my save disappeared" (Anir, Jul 5).
  /**
   * MOCK MODE LIVES IN THE ADDRESS BAR (Anir, Aug 31: "the second I switch
   * between real mode and mock mode, that slash mock mode has to appear right
   * after the 3006").
   *
   * NOT a duplicate set of pages — nineteen routes copied twice would drift
   * apart inside a week. One rewrite, so /mock-mode/anything serves exactly
   * the page /anything serves, and the prefix is free to be what it should be:
   * a label on the window, and a URL somebody can paste to a colleague.
   *
   * Middleware runs BEFORE this, and it sees the prefixed path. That is
   * deliberate and it is what keeps the door locked: /mock-mode/admin is not
   * in the public list, so it needs a session exactly as /admin does. The
   * prefix cannot be used to walk around authentication.
   */
  async rewrites() {
    return [{ source: "/mock-mode/:path*", destination: "/:path*" }];
  },
  experimental: {
    staleTimes: { dynamic: 0 },
    // Belt and braces for the Aug 20 upload outage: even when middleware has
    // reason to buffer a request body, the cap must clear the biggest file
    // the materials endpoint accepts (MAX_UPLOAD_BYTES, 512MB) — the 10MB
    // default truncated Antara's 32MB proposal and formData() blew up on the
    // stump.
    middlewareClientMaxBodySize: 512 * 1024 * 1024,
    ...(Number.isInteger(nextBuildCpus) && nextBuildCpus > 0
      ? { cpus: nextBuildCpus }
      : {}),
  },
};

export default nextConfig;
