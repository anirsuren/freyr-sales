type ProposalLabel = { id: string; action: string; summary: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Proposal IDs are internal handles; name the deal when talking to a person. */
export function hideActionIds(reply: string, proposals: ProposalLabel[]): string {
  let visible = reply;
  for (const proposal of proposals) {
    const quotedName = proposal.action === "create_opportunity" ? /Open a new deal "([^"]+)"/.exec(proposal.summary)?.[1] : null;
    const label = quotedName ? `the "${quotedName}" deal` : "the proposed change";
    const id = escapeRegExp(proposal.id);
    visible = visible.replace(
      new RegExp(`\\b(?:the\\s+)?(?:pending\\s+)?proposal\\s+(?:\\x60)?${id}(?:\\x60)?`, "gi"),
      quotedName ? `the proposal for ${label}` : "the proposed change"
    );
    visible = visible.replace(new RegExp(`(?:\\x60)?\\b${id}\\b(?:\\x60)?`, "gi"), label);
  }
  return visible.replace(/`?\bact-[a-z0-9]+\b`?/gi, "the proposed change");
}
