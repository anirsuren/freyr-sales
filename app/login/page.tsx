import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SupabaseLoginForm } from "@/components/auth/SupabaseLoginForm";
import { configuredAuthOrigin } from "@/lib/authOrigin";
import { autoApproveEmailDomains } from "@/lib/authEmailPolicy";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
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
    <div className="min-h-screen flex items-center justify-center bg-surface px-6">
      <Card className="w-full max-w-[420px] p-8">
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
            <SupabaseLoginForm joinDomainLabel={joinDomainLabel || null} />
          ) : entra ? (
            <a href="/.auth/login/aad" className="w-full h-11 rounded-lg bg-blue-primary text-white font-semibold text-[14px] flex items-center justify-center gap-2 hover:bg-blue-hover transition-colors">
              <ShieldCheck size={18} /> Continue with Microsoft
            </a>
          ) : alb ? (
            <Link href="/dashboard" className="w-full h-11 rounded-lg bg-blue-primary text-white font-semibold text-[14px] flex items-center justify-center gap-2 hover:bg-blue-hover transition-colors">
              <ShieldCheck size={18} /> Continue with Microsoft
            </Link>
          ) : (
            <Link href="/dashboard" className="w-full h-11 rounded-lg bg-blue-primary text-white font-semibold text-[14px] flex items-center justify-center hover:bg-blue-hover transition-colors">
              Enter local workspace
            </Link>
          )}
        </div>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-text-tertiary">
          {!authenticationReady
            ? "The application is locked. Customer and sales data remain inaccessible."
            : supabase && joinDomains.length > 0
            ? `Freyr colleagues join automatically with a confirmed ${joinDomainLabel} email. Everyone else needs an invitation.`
            : supabase
            ? "Authentication is provided by Supabase. Workspace access is invitation-only."
            : authMode
            ? "Protected by Freyr single sign-on. Do not share credentials."
            : "Local development only: production must set AUTH_MODE=aws-alb."}
        </p>
      </Card>
    </div>
  );
}
