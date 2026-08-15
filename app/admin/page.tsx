import { PageHeader } from "@/components/layout/PageHeader";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { getRole } from "@/lib/role";
import { requireModuleAccess } from "@/lib/moduleAccessServer";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

/**
 * ADMIN IS FOR RUNNING THE COMPANY'S WORKSPACE — user groups and who is in
 * them. Nothing else (Anir, Aug 12: "this is a user-facing thing... why the
 * hell is there information about the knowledge base and the API keys? That
 * shit shouldn't be there"). Site-index and service-key plumbing is developer
 * business and does not belong on a page Freyr staff open.
 */
export default async function AdminPage() {
  await requireModuleAccess("/admin");
  const role = await getRole();
  const workspace = process.env.FREYR_WORKSPACE_ID;
  const directory =
    role === "admin" && workspace
      ? await listWorkspaceAccess(workspace).catch(() => null)
      : null;
  const memberNames = [
    ...new Set(
      (directory?.members ?? [])
        .filter((m) => m.active && m.accountType === "real")
        .map((m) => m.name.trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <div>
      {role === "admin" ? (
        // Team members and User groups are separate screens now, behind the
        // same segmented selector Performance and Market Intel use (Anir,
        // Aug 15). The selector carries the page name, so there is no
        // PageHeader above it repeating it.
        <AdminTabs memberNames={memberNames} />
      ) : (
        <>
        <PageHeader
          title="Admin"
          subtitle="Running the workspace: who is what, and which departments they belong to."
        />
        <div className="rounded-2xl border border-border-light bg-white px-6 py-14 text-center text-[13px] text-text-secondary">
          Admin tools are open to workspace admins.
        </div>
        </>
      )}
    </div>
  );
}
