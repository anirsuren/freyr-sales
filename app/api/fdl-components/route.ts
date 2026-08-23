import { NextResponse } from "next/server";
import {
  commitOfferingsChange,
  createFdlComponent,
  initializeLiveOfferings,
  listFdlComponents,
  type FdlComponentType,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";

export const dynamic = "force-dynamic";

const COMPONENT_TYPES: FdlComponentType[] = ["Module", "Agent", "Platform"];

/** FDL components: the software pieces offerings are packages of. */
export async function GET() {
  await initializeLiveOfferings().catch(() => undefined);
  return NextResponse.json({ components: listFdlComponents() });
}

export async function POST(req: Request) {
  if (!(await canManageOfferings())) {
    return NextResponse.json(
      { error: "Only admins and editors can create components." },
      { status: 403 }
    );
  }
  const body = (await req.json().catch(() => ({}))) ?? {};
  const name = String(body?.name ?? "").trim().slice(0, 80);
  const type = COMPONENT_TYPES.includes(body?.type) ? (body.type as FdlComponentType) : null;
  if (!name || !type) {
    return NextResponse.json(
      { error: "A component needs a name and a type (Module, Agent or Platform)." },
      { status: 400 }
    );
  }
  await initializeLiveOfferings().catch(() => undefined);
  const component = await commitOfferingsChange(() =>
    createFdlComponent({ name, type })
  );
  return NextResponse.json({ component });
}
