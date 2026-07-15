import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  const authMode = process.env.AUTH_MODE;
  const entra = authMode === "entra";
  const alb = authMode === "aws-alb";

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-6">
      <Card className="w-full max-w-[420px] p-8">
        <div className="text-center">
          <span className="text-[25px] font-bold text-blue-primary tracking-tight">FREYR</span>
          <h1 className="mt-4 text-[20px] font-semibold text-text-primary">Sales Intelligence</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
            Sign in with your Freyr corporate identity. Access and permissions are managed by IT.
          </p>
        </div>

        <div className="mt-7">
          {entra ? (
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
          {authMode
            ? "Protected by Freyr single sign-on. Do not share credentials."
            : "Local development only — production must set AUTH_MODE=aws-alb."}
        </p>
      </Card>
    </div>
  );
}
