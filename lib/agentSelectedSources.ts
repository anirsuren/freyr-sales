/** A selection narrows retrieval, never expands permissions or exclusions. */
export function selectedSourcePassages<T extends { id: string; href: string }>(
  passages: T[],
  records: { kind: string; id: string }[],
): T[] {
  const materials = records
    .filter((r) => r.kind === "material")
    .map((r) => {
      const at = r.id.indexOf(":");
      return { offering: r.id.slice(0, at), material: r.id.slice(at + 1) };
    });
  const offerings = records
    .filter((r) => r.kind === "offering")
    .map((r) => r.id);
  if (!materials.length && !offerings.length) return passages;
  return passages.filter(
    (p) =>
      materials.some(
        (m) =>
          (p.id === m.material || p.id.startsWith(`${m.material}#`)) &&
          p.href.startsWith(`/offerings/${m.offering}`),
      ) ||
      offerings.some(
        (id) =>
          p.href === `/offerings/${id}` ||
          p.href.startsWith(`/offerings/${id}?`),
      ),
  );
}
