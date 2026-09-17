/** Limits new catalog entries, not following companies that already exist. */
export const BD_COMPANY_LIMIT = 20;
export function assertCompanyAdditionAllowed(
  companies: readonly { addedBy?: { id: string } }[],
  userId: string | undefined,
  limit: number | undefined,
): void {
  if (limit === undefined) return;
  if (!userId) throw new Error("Sign in before adding a company.");
  if (companies.filter(company => company.addedBy?.id === userId).length >= limit) {
    throw new Error(`You have reached your limit of ${limit} added companies. You can still track existing companies from Manage customers.`);
  }
}
