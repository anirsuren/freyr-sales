/**
 * Temporary compatibility map for environments that have not applied
 * migration 018 (`app_users.account_type`) yet.
 *
 * These are exact, stable app_users IDs read from the workspace directory on
 * 5 Aug 2026. This is deliberately not an email/name heuristic. As soon as the
 * database column exists, callers use the row value and never consult this
 * map.
 */
const LEGACY_ACCOUNT_TYPES = new Map<string, "real" | "test">([
  ["60e975d7-fa85-488a-a951-173ffeba771e", "real"], // Anant Puranik
  ["6d64db4f-77ad-4a38-a825-10b4fdbc4424", "real"], // Anir Suren
  ["0657b916-9026-4b32-98d6-668f9577d89a", "real"], // Eswar Subramanian
  ["856ea24d-98a9-4941-b4ea-1176032a378a", "real"], // Saras Verma
  ["ddbd95fa-e7ba-40d0-a0e5-64c2eb0aef09", "real"], // Suren Dheenadayalan
  ["20ed8931-fd89-462b-9981-ee51d630c0f2", "test"], // anir.s+test2
  ["d64fefbe-b5a0-4ed2-b51d-13480a71d616", "test"], // anir.s+test3
  ["69d02dcd-44fe-4737-8807-ecaf68f41197", "test"], // anir.s+test4
]);

export function legacyAccountTypeForMember(
  memberId: string
): "real" | "test" | null {
  return LEGACY_ACCOUNT_TYPES.get(memberId) ?? null;
}
