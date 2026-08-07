import { createClient } from "@supabase/supabase-js";
import type { AuthenticatedUser } from "@/lib/auth";

/**
 * PASSKEYS — Touch ID / Face ID / security key, as a second way in.
 *
 * The password path is untouched. A passkey is an ADDITIONAL credential the
 * account owner enrols while already signed in, and verifying one mints the
 * exact same `freyr_session` a password sign-in mints, so every downstream
 * check (roles, access, workspace) behaves identically.
 *
 * What is stored is a PUBLIC key. The private half never leaves the device's
 * secure enclave, and each sign-in is a fresh signature over a challenge this
 * server issued seconds earlier, so nothing here is replayable.
 */

/** Passkeys are bound to one origin. localhost credentials never work on prod. */
export function relyingParty(host: string | null): { rpID: string; origin: string } {
  const clean = (host || "localhost:3000").split(":")[0];
  const isLocal = clean === "localhost" || clean === "127.0.0.1";
  return {
    rpID: clean,
    origin: isLocal ? `http://${host}` : `https://${clean}`,
  };
}

export const RP_NAME = "Freyr Sales Intelligence";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Passkeys need the Supabase service role key.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export type StoredCredential = {
  id: string;
  auth_user_id: string;
  email: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
  device_label: string | null;
  rp_id: string;
  created_at: string;
  last_used_at: string | null;
};

/**
 * SCOPED TO THIS ORIGIN. A credential enrolled on localhost can never be used
 * on the deployed site, so listing it there is noise at best and misleading at
 * worst — it showed eight dev-test passkeys in Anir's production Settings
 * (Aug 7: "what is all this stuff?"). Pass the rpID and the list only ever
 * shows keys that actually work where you are standing.
 */
export async function credentialsForUser(
  authUserId: string,
  rpID?: string
): Promise<StoredCredential[]> {
  let query = db()
    .from("webauthn_credentials")
    .select("*")
    .eq("auth_user_id", authUserId);
  if (rpID) query = query.eq("rp_id", rpID);
  const { data } = await query.order("created_at", { ascending: true });
  return (data as StoredCredential[]) ?? [];
}

export async function credentialsForEmail(email: string): Promise<StoredCredential[]> {
  const { data } = await db()
    .from("webauthn_credentials")
    .select("*")
    .ilike("email", email.trim());
  return (data as StoredCredential[]) ?? [];
}

export async function credentialById(id: string): Promise<StoredCredential | null> {
  const { data } = await db()
    .from("webauthn_credentials")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as StoredCredential) ?? null;
}

export async function saveCredential(row: {
  id: string;
  authUserId: string;
  email: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  deviceLabel: string;
  rpId: string;
}): Promise<void> {
  const { error } = await db().from("webauthn_credentials").upsert({
    id: row.id,
    auth_user_id: row.authUserId,
    email: row.email,
    public_key: row.publicKey,
    counter: row.counter,
    transports: row.transports ?? null,
    device_label: row.deviceLabel,
    rp_id: row.rpId,
  });
  if (error) throw new Error(error.message);
}

export async function touchCredential(id: string, counter: number): Promise<void> {
  await db()
    .from("webauthn_credentials")
    .update({ counter, last_used_at: new Date().toISOString() })
    .eq("id", id);
}

export async function deleteCredential(id: string, authUserId: string): Promise<void> {
  await db()
    .from("webauthn_credentials")
    .delete()
    .eq("id", id)
    .eq("auth_user_id", authUserId);
}

/**
 * Challenges live server-side and are single-use: the row is deleted the moment
 * it is read. A client that could pick its own challenge could replay a old
 * signature, which is the whole thing the ceremony exists to prevent.
 */
export async function issueChallenge(input: {
  challenge: string;
  kind: "register" | "login";
  authUserId?: string;
  email?: string;
}): Promise<void> {
  await db().from("webauthn_challenges").insert({
    challenge: input.challenge,
    kind: input.kind,
    auth_user_id: input.authUserId ?? null,
    email: input.email ?? null,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
}

export async function consumeChallenge(
  challenge: string,
  kind: "register" | "login"
): Promise<{ authUserId: string | null; email: string | null } | null> {
  const supabase = db();
  const { data } = await supabase
    .from("webauthn_challenges")
    .select("*")
    .eq("challenge", challenge)
    .eq("kind", kind)
    .maybeSingle();
  if (!data) return null;
  await supabase.from("webauthn_challenges").delete().eq("id", data.id);
  // Expired challenges are consumed and then rejected, so a stale one cannot be
  // retried by racing the cleanup.
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return { authUserId: data.auth_user_id, email: data.email };
}

/**
 * The signed-in identity a verified passkey resolves to.
 *
 * Returns the AUTH principal — the same shape /api/auth/session builds from a
 * Supabase token — and lets resolveWorkspaceAccess do the app_users matching,
 * exactly as the password path does. Looking the row up by auth_user_id here
 * was wrong: app_users.id is the APP row id, a different uuid from the auth
 * user id the session carries.
 *
 * The liveness check is by email, which is the column both identities share.
 */
export async function userForCredential(
  cred: StoredCredential
): Promise<AuthenticatedUser | null> {
  const { data } = await db()
    .from("app_users")
    .select("display_name, active")
    .ilike("email", cred.email)
    .maybeSingle();
  if (data && data.active === false) return null;
  return {
    id: cred.auth_user_id,
    name: (data?.display_name as string) || cred.email.split("@")[0],
    email: cred.email,
    roles: [],
  };
}
