import "server-only";
import { getDb } from "./db";
import type { Customer } from "./types";
import { getDataMode } from "./dataMode";

const pending = new Map<string, Promise<Customer>>();

/** Resolve a company entered in any sales form to a real Customer account. */
export async function ensureCustomerAccount(name: string, customerId?: string | null, createdBy?: string): Promise<Customer> {
  const companyName = name.trim().slice(0, 160);
  if (!companyName) throw new Error("Enter a company name.");
  const db = getDb();
  if (customerId) {
    const selected = await db.customers.get(customerId);
    if (selected && selected.company_name.trim().toLocaleLowerCase() === companyName.toLocaleLowerCase()) return selected;
  }
  const key = `${getDataMode()}:${companyName.toLocaleLowerCase()}`;
  const running = pending.get(key);
  if (running) return running;
  const task = (async () => {
    const existing = (await db.customers.list()).find((customer) => customer.company_name.trim().toLocaleLowerCase() === companyName.toLocaleLowerCase());
    if (existing) return existing;
    return db.customers.create({
      company_name: companyName,
      website_url: null,
      size_tier: null,
      industry: null,
      geography: null,
      enrichment_summary: null,
      created_by: createdBy?.trim() || null,
    });
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
