import "server-only";
import { getDb } from "./db";
import type { Contact } from "./types";

export type LeadContactInput = {
  name?: string;
  contactId?: string;
  email?: string;
  phone?: string;
  title?: string;
  linkedinUrl?: string;
  country?: string;
};

/** A lead's person is a Contact on their Customer account, not only a label. */
export async function ensureLeadContact(customerId: string, lead: LeadContactInput): Promise<Contact | null> {
  const name = String(lead.name ?? "").trim().slice(0, 120);
  if (!name) return null;
  const db = getDb();
  const email = String(lead.email ?? "").trim().toLocaleLowerCase();
  if (lead.contactId) {
    const linked = await db.contacts.get(lead.contactId);
    if (linked?.customer_id === customerId && linked.full_name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()) return linked;
  }
  const contacts = await db.contacts.list(customerId);
  const existing = contacts.find((contact) => email && contact.email?.trim().toLocaleLowerCase() === email)
    ?? contacts.find((contact) => contact.full_name.trim().toLocaleLowerCase() === name.toLocaleLowerCase() && (!email || !contact.email || contact.email.trim().toLocaleLowerCase() === email));
  if (existing) return existing;
  return db.contacts.create({
    customer_id: customerId,
    full_name: name,
    email: email || null,
    phone: String(lead.phone ?? "").trim() || null,
    job_title: String(lead.title ?? "").trim() || null,
    linkedin_url: String(lead.linkedinUrl ?? "").trim() || null,
    country: String(lead.country ?? "").trim() || null,
    career_summary: null,
    enrichment_summary: null,
  });
}
