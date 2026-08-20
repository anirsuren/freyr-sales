import { NextResponse } from "next/server";
import {
  getOffering,
  updateOffering,
  deleteOffering,
  hydrateOffering,
  commitOfferingsChange,
  normalizeRoadmapDetails,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";
import { forgetMaterialText } from "@/lib/materialText";
import { canEditOffering } from "@/lib/offeringOwnership";
import { getCurrentUser } from "@/lib/currentUser";
import { GENERIC_USER_IDENTITY } from "@/lib/userIdentity";
import {
  canViewNextCustomerVersion,
  hideNextCustomerVersions,
} from "@/lib/roadmapAccess";
import {
  stampMaterialAttribution,
  sanitizeMaterialFolderPath,
  materialJourneyStages,
  MATERIAL_FORMATS,
  ACCESS_LEVELS,
  type OfferingMaterial,
} from "@/lib/offeringMaterials";
import { redactAgentOnlyMaterials } from "@/lib/materialAccess";
import {
  accountBackedPeopleForPoc,
  listAssignablePeople,
  redactUnverifiedOfferingPeople,
} from "@/lib/assignablePeople";
import { getDataMode } from "@/lib/dataMode";

export const dynamic = "force-dynamic";

/**
 * The signed-in member's display name, or null when the session carries no
 * verified identity. Null means "we don't know who this is" — the caller must
 * then leave the attribution blank rather than credit a placeholder.
 */
async function uploaderName(): Promise<string | null> {
  const user = await getCurrentUser();
  if (user.id === GENERIC_USER_IDENTITY.id) return null;
  return user.name.trim() || null;
}

const FORBIDDEN = NextResponse.json(
  { error: "Ask a workspace admin to assign you as an owner before editing" },
  { status: 403 }
);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const offering = getOffering((await params).id);
  if (!offering) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const people = await listAssignablePeople();
  const hydrated = hydrateOffering(
    redactUnverifiedOfferingPeople(offering, people)
  );
  const user = await getCurrentUser();
  const visible = redactAgentOnlyMaterials(hydrated, user.memberId);
  return NextResponse.json({
    offering: (await canViewNextCustomerVersion(offering))
      ? visible
      : hideNextCustomerVersions(visible),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Ownership is immutable through the generic editor. The dedicated admin
  // endpoint verifies the target against the active workspace directory; a
  // broad object spread here must never bypass that gate. Record identity and
  // creation metadata are likewise server-owned.
  delete body.owners;
  delete body.contacts;
  delete body.id;
  delete body.created_at;
  const { id } = await params;
  // ONE rule for every write: you must own this offering. Uploading a sales
  // material is editing the offering's content, so it goes through the same
  // gate rather than the old "any signed-in member may attach materials"
  // shortcut, which let anyone in the workspace change any offering's assets.
  // An owner is assigned by an admin; there is no self-claim path.
  // Resolved from the STORED offering, never the request body, so a caller
  // cannot hand themselves ownership by posting a new POC.
  const existing = getOffering(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canEditOffering(existing))) return FORBIDDEN;
  // ADD OR REMOVE ONE COMPONENT, from the component's own page. Sending the
  // whole component_ids array from there would mean the component page has to
  // know every other component on the offering, which it does not; this asks
  // for one change and the server does the merge.
  if (typeof body.addComponentId === "string") {
    const componentId = body.addComponentId.trim().slice(0, 120);
    const connect = body.connected !== false;
    const current = existing.component_ids ?? [];
    body.component_ids = connect
      ? Array.from(new Set([...current, componentId]))
      : current.filter((x) => x !== componentId);
    delete body.addComponentId;
    delete body.connected;
  }
  const people = await listAssignablePeople();
  if (getDataMode() === "live" && body.poc !== undefined) {
    const selected = accountBackedPeopleForPoc(String(body.poc || ""), people);
    if (selected.invalid.length) {
      return NextResponse.json(
        {
          error: `Choose active workspace accounts for POC: ${selected.invalid.join(", ")}`,
        },
        { status: 400 }
      );
    }
    const existingByName = new Map(
      (existing.contacts || []).map((contact) => [
        contact.name.trim().toLowerCase(),
        contact,
      ])
    );
    body.poc = selected.people.map((person) => person.name).join(" / ");
    body.contacts = selected.people.map((person, index) => {
      const prior = existingByName.get(person.name.trim().toLowerCase());
      return {
        id: prior?.id || `oc-${id}-${Date.now().toString(36)}-${index}`,
        name: person.name,
        role: person.role || prior?.role || "Service delivery POC",
        email: person.email || "",
        phone: prior?.phone || "",
      };
    });
  }
  if (Array.isArray(body.materialFolders)) {
    body.materialFolders = Array.from(
      new Set(
        body.materialFolders
          .map(sanitizeMaterialFolderPath)
          .filter(Boolean)
      )
    );
  }
  if (Array.isArray(body.materials)) {
    const incoming = body.materials as OfferingMaterial[];
    for (const material of incoming) {
      material.folder = sanitizeMaterialFolderPath(material.folder);
      const prior = existing.materials.find(
        (item) =>
          (!!material.id && item.id === material.id) ||
          (!!material.docsPath && item.docsPath === material.docsPath)
      );
      // Existing legacy rows remain readable and can be normalized safely on
      // their next explicit edit. Every new material is complete at the server
      // boundary even if a caller bypasses the browser form.
      if (!prior) {
        const stages = materialJourneyStages(material);
        // Two kinds of "valid file or link". An uploaded file's url is OUR OWN
        // download route — app-relative on purpose, so no stored presign can
        // ever expire in the record. Only a pasted link must be an absolute
        // http(s) URL. Requiring absolute of BOTH rejected every fresh file
        // upload at the final save while pasted links kept working (Inayat's
        // Test File.docx, Aug 12 — fully tagged, still bounced).
        const rawUrl = String(material.url || "");
        let validUrl = false;
        if (material.docsPath) {
          validUrl = rawUrl.startsWith(
            `/api/offerings/${id}/materials/download`
          );
        } else {
          try {
            const parsed = new URL(rawUrl);
            validUrl =
              parsed.protocol === "https:" || parsed.protocol === "http:";
          } catch {}
        }
        if (
          !material.label?.trim() ||
          !validUrl ||
          !MATERIAL_FORMATS.includes(material.kind as never) ||
          !material.folder ||
          stages.length === 0 ||
          !ACCESS_LEVELS.includes(material.accessLevel as never)
        ) {
          return NextResponse.json(
            {
              error:
                "Every new material needs a name, valid file or link, file format, folder, at least one buyer journey stage, and one access level.",
            },
            { status: 400 }
          );
        }
        material.journeyStages = stages;
        material.journeyStage = stages[0];
      }
    }
  }
  if (body.roadmap_details !== undefined) {
    try {
      body.roadmap_details = normalizeRoadmapDetails(body.roadmap_details);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Invalid roadmap details",
        },
        { status: 400 }
      );
    }
  }
  // "Who added this" is stamped here, from the session — never from the body.
  // Existing rows keep the attribution already on file, so re-saving the list
  // (which every material edit does) can't re-credit someone else's upload.
  if (Array.isArray(body.materials)) {
    body.materials = stampMaterialAttribution(
      body.materials as OfferingMaterial[],
      getOffering(id)?.materials ?? [],
      await uploaderName()
    );
  }
  // A material that is being REMOVED takes its extracted text with it: the
  // assistant must stop answering from a deck the owner just deleted.
  const droppedPaths = Array.isArray(body.materials)
    ? existing.materials
        .map((m) => m.docsPath)
        .filter(
          (p): p is string =>
            !!p &&
            !(body.materials as OfferingMaterial[]).some(
              (m) => m.docsPath === p
            )
        )
    : [];

  try {
    const offering = await commitOfferingsChange(() => updateOffering(id, body));
    if (!offering) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (droppedPaths.length)
      await forgetMaterialText(droppedPaths).catch(() => undefined);
    const user = await getCurrentUser();
    return NextResponse.json({
      ok: true,
      offering: redactAgentOnlyMaterials(
        redactUnverifiedOfferingPeople(offering, people),
        user.memberId
      ),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Offering save failed" },
      { status: 503 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await canManageOfferings())) return FORBIDDEN;
  const { id } = await params;
  try {
    const ok = await commitOfferingsChange(() => deleteOffering(id));
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Offering delete failed" },
      { status: 503 }
    );
  }
}
