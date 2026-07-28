/**
 * Stable anchor id from a section title.
 *
 * Lives in its own module with no imports so BOTH sides can use it: the edit
 * form (a client component) stamps the id onto each section, and the edit
 * page's side rail (a server component) links to it. Exporting it from the
 * form itself would not work — a server component that reaches into a
 * "use client" module gets a client reference, not the function.
 */
export function sectionId(title: string) {
  return `sec-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}
