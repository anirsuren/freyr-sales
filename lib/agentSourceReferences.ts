/** Request-local citation handles keep long feed URLs out of generated prose.
 * Only URLs actually returned by an authorized reader can be resolved. */
export function agentSourceReferences() {
  const urls = new Map<string, string>();
  const references = new Map<string, string>();
  return {
    compact(text: string) {
      return text.replace(/https?:\/\/[^\s<>"\])]+/g, url => {
        let ref = urls.get(url);
        if (!ref) {
          ref = `/agent-source/${urls.size + 1}`;
          urls.set(url, ref);
          references.set(ref, url);
        }
        return ref;
      });
    },
    resolve(reference: string) {
      return references.get(reference) || (urls.has(reference) ? reference : undefined);
    },
    expand(text: string) {
      return text.replace(/\[([^\]\n]+)\]\(\/agent-source\/(\d+)\)/g, (_match, label, id) => {
        const url = references.get(`/agent-source/${id}`);
        return url ? `[${label}](${url})` : label;
      }).replace(/\/agent-source\/\d+/g, 'Source unavailable');
    },
  };
}
