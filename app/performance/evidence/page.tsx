import { redirect } from "next/navigation";
import { StandaloneEvidenceDoc } from "@/components/performance/StandaloneEvidenceDoc";
import { EVIDENCE_NAMESPACE } from "@/lib/performanceEvidence";
import { SAMPLE_DOCUMENT_FILES } from "@/lib/sampleDocuments";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>;
}) {
  const { name } = await searchParams;
  return { title: name || "Supporting evidence" };
}

export default async function PerformanceEvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; source?: string; embed?: string }>;
}) {
  const { name, source, embed } = await searchParams;
  if (!name || !source) redirect("/performance/people");

  const isSample =
    source.startsWith("/sample-documents/") &&
    (SAMPLE_DOCUMENT_FILES as readonly string[]).includes(
      source.slice("/sample-documents/".length)
    );
  const storedPath = source.startsWith("/api/performance/evidence?")
    ? new URL(source, "http://performance.local").searchParams.get("path")
    : null;
  if (!isSample && !storedPath?.startsWith(EVIDENCE_NAMESPACE)) {
    redirect("/performance/people");
  }

  return <StandaloneEvidenceDoc name={name} source={source} embed={embed === "1"} />;
}
