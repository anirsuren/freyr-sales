import { cookies } from "next/headers";

// Two user types for the Offerings module (Suren's change #4): an admin who can
// edit/update data, and a sales (regular) user who can only view it. Mock-first:
// the active role lives in a cookie that an in-app switcher flips. Wiring this to
// real per-user logins is a later step.
export type Role = "admin" | "sales";

export function getRole(): Role {
  return cookies().get("freyr_role")?.value === "sales" ? "sales" : "admin";
}

export function isAdmin(): boolean {
  return getRole() === "admin";
}
