import { redirect } from "next/navigation";

/**
 * /goals IS /performance (Suren, Aug 25: "we are calling it Performance but I
 * don't want to call it performance… it's a goal view, the view is based on
 * goals, it's actually Goals").
 *
 * The rail, the command palette and the browser tab all say Goals now. The
 * page itself keeps living at /performance because every bookmark, every
 * shared goal link, every ?goal= deep link and every notification email
 * already points there, and a rename that breaks those is a worse trade than
 * one extra route. This is the door with the new name on it.
 */
export const dynamic = "force-dynamic";

export default function GoalsAlias() {
  redirect("/performance");
}
