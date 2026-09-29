/**
 * WHAT IS LEFT OF THE OLD WAITING ROOM.
 *
 * The lead-to-contact hop resolves on the server now and redirects, so there
 * is no "Opening contact" screen on the happy path (Anir, Sep 29). This is
 * only what a real problem looks like: a deleted lead, a lead with no company,
 * or an account this person may not create.
 */
import Link from "next/link";

export function LeadContactProblem({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-[40vh] max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold text-text-primary">This contact could not be opened</h1>
      <p className="text-sm text-text-secondary" role="status">{message}</p>
      <Link href="/leads" className="text-sm font-semibold text-blue-primary hover:underline">Back to leads</Link>
    </main>
  );
}
