"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

  useEffect(() => {
    // No auth backend configured → auto-login as the mock user.
    if (!hasSupabase) {
      const t = setTimeout(() => router.replace("/dashboard"), 600);
      return () => clearTimeout(t);
    }
  }, [hasSupabase, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <Card className="w-[400px]">
        <div className="text-center mb-6">
          <span className="text-[24px] font-bold text-blue-primary tracking-tight">
            FREYR
          </span>
          <p className="text-[13px] text-text-secondary mt-1">
            Sales Intelligence Platform
          </p>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            router.replace("/dashboard");
          }}
        >
          <Input type="email" placeholder="Email" defaultValue="suren.dheen@freyr.example" />
          <Input type="password" placeholder="Password" defaultValue="••••••••" />
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>

        {!hasSupabase && (
          <p className="text-[12px] text-text-tertiary text-center mt-4">
            Demo mode — signing you in as Suren Dheen…
          </p>
        )}
      </Card>
    </div>
  );
}
