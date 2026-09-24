/** Unlinked legacy names resolve to Customer accounts on navigation. */
export function companyDestination(name: string, customerId?: string | null): string {
  return customerId
    ? `/customers/${encodeURIComponent(customerId)}`
    : `/companies/${encodeURIComponent(name.trim())}`;
}
