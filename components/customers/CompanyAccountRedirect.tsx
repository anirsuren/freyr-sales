/**
 * WHAT IS LEFT OF THE OLD WAITING ROOM.
 *
 * A company link resolves to its account on the server now and redirects, so
 * there is no "Opening customer account…" screen on the happy path (Anir,
 * Sep 29). This is only what a real problem looks like.
 */
import Link from "next/link";
import { CompanyLogo } from "@/components/ui/CompanyLogo";

export function CompanyAccountProblem({ name, message }: { name: string; message: string }) {
  return (
    <main className="mx-auto flex min-h-[40vh] max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
      <CompanyLogo name={name} className="h-14 w-14" />
      <h1 className="text-xl font-semibold text-text-primary">{name}</h1>
      <p className="text-sm text-text-secondary" role="status">{message}</p>
      <Link href="/customers" className="text-sm font-semibold text-blue-primary hover:underline">Back to customers</Link>
    </main>
  );
}
