import { getDataMode } from "@/lib/dataMode";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import { marketIntelMemberScope } from "@/lib/marketIntelMemberScope";
import { marketIntelDatabaseConfig } from "@/lib/marketIntelDatabase";
import { getCurrentUser } from "@/lib/currentUser";
import { viewerAccessMap } from "@/lib/viewerAccess";
import { canAccessModuleWith } from "@/lib/moduleAccess";

export const dynamic = "force-dynamic";
async function context(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) return null;
  const [user, access] = await Promise.all([getCurrentUser(), viewerAccessMap()]);
  if (!canAccessModuleWith("/market-intel", user.role, access)) return null;
  const member = await marketIntelMemberScope(scope);
  const config = marketIntelDatabaseConfig(getDataMode());
  if (!config.url || !config.key) throw new Error("Storage unavailable");
  const db = createClient(config.url, config.key, { auth: { persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
  const prefix = `mi-article:${createHash("sha256").update(JSON.stringify([getDataMode(), member.workspaceId, member.userId])).digest("hex")}:`;
  return { db, prefix };
}
export async function GET(req: NextRequest) {
  try {
    const ctx = await context(req);
    if (!ctx) return NextResponse.json({error:"Not available on this account."},{status:403});
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (companyId && companyId.length > 200) return NextResponse.json({error:"Invalid company."},{status:400});
    const articles: unknown[] = [];
    // The account-wide view must include every saved item. Supabase limits a
    // single response, so walk the current user's rows in stable pages.
    for (let offset = 0; ; offset += 500) {
      let query = ctx.db.from("offering_catalog_state").select("catalog").like("id", `${ctx.prefix}%`);
      if (companyId) query = query.eq("catalog->>companyId", companyId);
      const {data,error} = await query.order("id").range(offset, offset + 499);
      if (error) throw error;
      articles.push(...(data ?? []).map(row => row.catalog));
      if ((data?.length ?? 0) < 500) break;
    }
    return NextResponse.json({ articles }, {headers:{"Cache-Control":"no-store"}});
  } catch { return NextResponse.json({error:"Could not load saved articles."},{status:503}); }
}
export async function PUT(req: NextRequest) {
  try {
    const ctx = await context(req);
    if (!ctx) return NextResponse.json({error:"Not available on this account."},{status:403});
    const body = await req.json().catch(() => null);
    if (!body || typeof body.companyId !== "string" || !body.companyId || body.companyId.length > 200 || typeof body.url !== "string" || body.url.length > 4096 || typeof body.on !== "boolean") return NextResponse.json({error:"Invalid article."},{status:400});
    let url: URL;
    try { url = new URL(body.url); } catch { return NextResponse.json({error:"Invalid article URL."},{status:400}); }
    if (!["https:","http:"].includes(url.protocol)) return NextResponse.json({error:"Invalid article URL."},{status:400});
    const id = ctx.prefix + createHash("sha256").update(JSON.stringify([body.companyId, body.url])).digest("hex");
    if (!body.on) {
      const {error} = await ctx.db.from("offering_catalog_state").delete().eq("id",id);
      if (error) throw error;
    } else {
      if (typeof body.title !== "string" || !body.title.trim() || !["company","people","news","authority","site"].includes(body.kind)) return NextResponse.json({error:"Invalid item."},{status:400});
      const catalog = {companyId:body.companyId,companyName:typeof body.companyName === "string" ? body.companyName.slice(0,200) : "",url:body.url,title:body.title.slice(0,1000),kind:body.kind,sourceLabel:typeof body.sourceLabel === "string" ? body.sourceLabel.slice(0,300) : "",body:typeof body.body === "string" ? body.body.slice(0,12000) : null,date:typeof body.date === "string" && Number.isFinite(Date.parse(body.date)) ? body.date : null};
      const {error} = await ctx.db.from("offering_catalog_state").upsert({id,catalog,updated_at:new Date().toISOString()},{onConflict:"id"});
      if (error) throw error;
    }
    return NextResponse.json({ok:true});
  } catch { return NextResponse.json({error:"Could not update this bookmark. Please try again."},{status:503}); }
}
