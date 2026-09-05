import Link from "next/link";
import { headers } from "next/headers";
import { PasskeySignIn } from "@/components/auth/PasskeySignIn";
import { appHomePath } from "@/lib/appHome";
import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SupabaseLoginForm } from "@/components/auth/SupabaseLoginForm";
import { configuredAuthOrigin } from "@/lib/authOrigin";
import { autoApproveEmailDomains } from "@/lib/authEmailPolicy";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  /* DEV SAYS SO, PROD NEVER DOES (Anir, Aug 27: "put a message on the login
     page that eventually it's gonna get moved over to the actual production
     environment, but right now it is here"). Both environments run the SAME
     image; they differ by the address they answer on, so the request's own
     Host header is the one switch that needs no config and survives every
     promote: the banner shows on freyrsales.dev.* and localhost, and can
     never appear on freyrsales.freyrapps.com. */
  const host = ((await headers()).get("host") ?? "").toLowerCase();
  const isDevHome =
    host.includes(".dev.") || host.startsWith("localhost") || host.startsWith("127.");
  const authMode = process.env.AUTH_MODE;
  const entra = authMode === "entra";
  const alb = authMode === "aws-alb";
  const supabase = authMode === "supabase";
  const localDevelopment =
    !authMode && process.env.NODE_ENV !== "production";
  const cookieSecret = process.env.AUTH_COOKIE_SECRET;
  const sessionSecret = process.env.AUTH_SESSION_SECRET;
  const supabaseConfigured = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !!configuredAuthOrigin() &&
    (process.env.NODE_ENV !== "production" || process.env.FREYR_WORKSPACE_ID) &&
    cookieSecret &&
    cookieSecret.length >= 32 &&
    (!sessionSecret || sessionSecret.length >= 32)
  );
  const authenticationReady =
    entra || alb || (supabase && supabaseConfigured) || localDevelopment;
  // Company-domain auto-join: colleagues on these domains don't need an
  // invitation — say so up front instead of the invitation-only copy.
  const joinDomains = autoApproveEmailDomains();
  const joinDomainLabel = joinDomains.map((d) => `@${d}`).join(" or ");

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 overflow-hidden bg-surface px-6 py-4">
      {/* The app has moved to its own address. Anir, Sep 5: now urge users to
          the new link (this reverses the earlier "don't give them the link yet"
          — the prod site is live and everyone should move to it). Plain words,
          the real address, no metaphors. Host-gated: shows on dev/localhost,
          never on the prod host. */}
      {isDevHome && (
        <div className="w-full max-w-[420px] rounded-xl border border-blue-subtle bg-blue-light px-4 py-3 text-center text-[12.5px] leading-relaxed text-blue-primary">
          <b className="font-semibold">Freyr Sales has moved.</b>{" "}
          Please use the new site from now on:{" "}
          <a
            href="https://freyrsales.freyrapps.com"
            className="font-semibold underline underline-offset-2"
          >
            freyrsales.freyrapps.com
          </a>
          . Your account and all your data are already there. This address is
          being retired.
        </div>
      )}
      <Card className="max-h-[calc(100dvh-2rem)] w-full max-w-[420px] overflow-y-auto p-8">
        <div className="text-center">
          <span className="text-[25px] font-bold text-blue-primary tracking-tight">FREYR</span>
          <h1 className="mt-4 text-[20px] font-semibold text-text-primary">Sales Intelligence</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
            {!authenticationReady
              ? "Authentication is not fully configured. No workspace data is available until an administrator completes the secure login setup."
              : supabase && joinDomains.length > 0
              ? `Work at Freyr? Your ${joinDomainLabel} email is already your account: enter it below and set a password. No invitation needed.`
              : supabase
              ? "Sign in with the exact email address your workspace owner invited. New accounts require both that invitation and email confirmation before any sales data is visible."
              : "Sign in with your Freyr corporate identity. Access and permissions are managed by IT."}
          </p>
        </div>

        <div className="mt-7">
          {!authenticationReady ? (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-relaxed text-red-800"
            >
              Secure login is unavailable. Ask the deployment administrator to
              configure Supabase and the authentication cookie secret.
            </div>
          ) : supabase ? (
            <>
              <SupabaseLoginForm
                joinDomainLabel={joinDomainLabel || null}
                /* Read at REQUEST time on the server, so this page signs
                   people into whichever database THIS environment points at —
                   a baked NEXT_PUBLIC value would follow the build, and prod
                   runs dev's build (see the prop's own comment). */
                supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? null}
                supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null}
              />
              <PasskeySignIn />
            </>
          ) : entra ? (
            <a href="/.auth/login/aad" className="w-full h-11 rounded-lg bg-blue-primary text-white font-semibold text-[14px] flex items-center justify-center gap-2 hover:bg-blue-hover transition-colors">
              <ShieldCheck size={18} /> Continue with Microsoft
            </a>
          ) : alb ? (
            <Link href={appHomePath()} className="w-full h-11 rounded-lg bg-blue-primary text-white font-semibold text-[14px] flex items-center justify-center gap-2 hover:bg-blue-hover transition-colors">
              <ShieldCheck size={18} /> Continue with Microsoft
            </Link>
          ) : (
            <Link href={appHomePath()} className="w-full h-11 rounded-lg bg-blue-primary text-white font-semibold text-[14px] flex items-center justify-center hover:bg-blue-hover transition-colors">
              Enter local workspace
            </Link>
          )}
        </div>
      </Card>
    </div>
  );
}
