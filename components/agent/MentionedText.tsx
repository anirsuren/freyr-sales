import { EntityMark, type Entity } from "./EntityPills";
/** Preserve the explicit record identity in sent messages, including after reload. */
export function MentionedText({
  text,
  selected = [],
  entities = [],
}: {
  text: string;
  selected?: Entity[];
  entities?: Entity[];
}) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const next = selected
      .filter((entity) => entity.name?.length)
      .map((entity) => ({ entity, at: text.indexOf(entity.name, cursor) }))
      .filter((match) => match.at >= 0)
      .sort(
        (a, b) => a.at - b.at || b.entity.name.length - a.entity.name.length,
      )[0];
    if (!next) {
      parts.push(text.slice(cursor));
      break;
    }
    parts.push(text.slice(cursor, next.at));
    const current = entities.find((entity) => entity.kind === next.entity.kind && entity.id === next.entity.id);
    const identity = { ...next.entity, ...current, name: next.entity.name };
    parts.push(
      <span
        key={`${cursor}:${next.entity.id}`}
        title={[identity.name, identity.subtitle, ...(identity.details || []), identity.description].filter(Boolean).join(" · ")}
        className="inline-flex items-center gap-1 align-middle rounded-full border border-white/40 bg-white/15 px-2 py-0.5 text-[13px] font-medium"
      >
        <EntityMark entity={identity} />
        {next.entity.name}
      </span>,
    );
    cursor = next.at + next.entity.name.length;
  }
  return <>{parts}</>;
}
