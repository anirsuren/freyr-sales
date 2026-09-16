"use client";

import { StandaloneRecordDoc } from "@/components/documents/StandaloneRecordDoc";
import { formatFromFilename } from "@/lib/offeringMaterials";

function evidencePath(source: string, name: string) {
  if (source.startsWith("/api/performance/evidence?")) {
    const url = new URL(source, "http://performance.local");
    return url.searchParams.get("path") || name;
  }
  return source || name;
}

export function StandaloneEvidenceDoc({
  name,
  source,
  embed,
}: {
  name: string;
  source: string;
  embed: boolean;
}) {
  const query = new URLSearchParams({ name, source });
  const selfUrl = `/performance/evidence?${query.toString()}`;

  return (
    <StandaloneRecordDoc
      embed={embed}
      contextName="Performance result"
      kicker="Supporting evidence"
      material={{
        id: source || name,
        label: name,
        kind: formatFromFilename(name),
        url: source,
        docsPath: evidencePath(source, name),
      }}
      downloadUrl={source}
      previewBase={`/api/performance/evidence/preview?${query.toString()}`}
      selfUrl={selfUrl}
      backUrl="/performance/people"
    />
  );
}
