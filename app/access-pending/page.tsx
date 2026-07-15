import Link from "next/link";
import { Clock3, LockKeyhole, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "Access pending" };

export default async function AccessPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; configuration?: string }>;
}) {
  const params = await searchParams;
  const authMode = process.env.AUTH_MODE;
  const signOut = authMode === "entra" ? "/.auth/logout?post_logout_redirect_uri=/login" : "/login";
  const configurationError = params.configuration === "error";

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-6">
      <Card className="w-full max-w-[520px] p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
            {configurationError ? <LockKeyhole size={20} /> : <Clock3 size={20} />}
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-blue-primary">Freyr workspace</p>
            <h1 className="mt-1 text-[21px] font-semibold text-text-primary">
              {configurationError ? "Access control needs attention" : "Your access request is pending"}
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
              {configurationError
                ? "Your identity was verified, but the workspace approval service is not fully configured. Ask the workspace owner to review the deployment settings."
                : "Your identity is verified, but a workspace owner must approve you before any Freyr data is visible."}
            </p>
          </div>
        </div>

        {params.email && (
          <div className="mt-5 rounded-md border border-border-light bg-surface px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Signed in as</p>
            <p className="mt-1 text-[13px] font-medium text-text-primary">{params.email}</p>
          </div>
        )}

        <div className="mt-5 flex items-center gap-2 text-[12px] text-success">
          <ShieldCheck size={15} /> No customer, offering, or pipeline data has been exposed.
        </div>
        <div className="mt-6 border-t border-border-light pt-5">
          <Link href={signOut} className="text-[13px] font-semibold text-blue-primary hover:underline">
            Sign out and use another account
          </Link>
        </div>
      </Card>
    </div>
  );
}
