/** An account is the canonical destination when it exists. A name saved only
 * on a lead still has a useful, read-only company view. */
export function companyDestination(name: string, customerId?: string | null): string {
  return customerId
    ? `/customers/${encodeURIComponent(customerId)}`
    : `/companies/${encodeURIComponent(name.trim())}`;
}
