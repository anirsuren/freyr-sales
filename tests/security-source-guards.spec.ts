import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

test("generic offering updates cannot overwrite ownership or identity metadata", () => {
  const route = source("app/api/offerings/[id]/route.ts");
  const update = route.indexOf("updateOffering(id, body)");

  for (const field of ["owners", "id", "created_at"]) {
    const guard = route.indexOf(`delete body.${field};`);
    expect(guard, `${field} must be stripped`).toBeGreaterThan(-1);
    expect(guard, `${field} must be stripped before persistence`).toBeLessThan(
      update
    );
  }
});

test("offering ownership assignment is admin-only and directory-verified", () => {
  const route = source("app/api/offerings/[id]/owners/route.ts");

  expect(route).toContain('actor.role !== "admin"');
  expect(route).toContain("activeWorkspaceMember(actor.workspaceId");
  expect(route).toContain("directoryTarget?.id");
  expect(route).not.toContain("canManageOfferings");
});

test("every customer or workflow-mutating agent route is fail-closed in Real mode", () => {
  const guardedRoutes = [
    "act",
    "advance",
    "approve-all",
    "autopilot",
    "cadence-run",
    "digest",
    "enroll",
    "plan",
    "review/share",
    "run",
    "send-all",
    "undo",
  ];

  for (const routeName of guardedRoutes) {
    expect(
      source(`app/api/agent/${routeName}/route.ts`),
      `${routeName} must reject live mutations`
    ).toContain("rejectRealModeAgentMutation");
  }

  const converse = source("app/api/agent/converse/route.ts");
  expect(converse).toContain("if (action) {");
  expect(converse).toContain("const denied = rejectRealModeAgentMutation();");
});

