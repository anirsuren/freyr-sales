import { redirect } from "next/navigation";

/** /goals/org → /performance/org, and so on for every tab. See ../page.tsx. */
export const dynamic = "force-dynamic";

export default async function GoalsTabAlias({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  redirect(`/performance/${encodeURIComponent(tab)}`);
}
