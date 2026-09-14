/**
 * KEEP THE PICTURE, NOT THE LINK.
 *
 * Anir, Sep 4: "for the LinkedIn one, just save the images? Come on, it's not
 * that hard."
 *
 * He is right, and the reason it was broken is worth writing down. We were
 * storing LinkedIn's own image URL, which looks permanent and is not: every
 * one carries a signed expiry, `?e=1787788800`. Once that moment passes the
 * CDN returns 403 and the face becomes an empty grey square. On the day this
 * was found, 199 of 279 faces on Market Intel were already dead and the
 * remaining 80 were due to expire within three weeks — the page was on its way
 * to showing nothing but blanks, with no error anywhere to explain it.
 *
 * So the fetch happens ONCE, at refresh time, and the bytes go into our own
 * bucket. What is stored afterwards is a URL we control, which has no expiry
 * and no dependency on LinkedIn still serving it.
 *
 * The bucket is public on purpose: these are the same public profile pictures
 * anyone can see on LinkedIn, they are rendered in an <img> on every Market
 * Intel page, and a signed URL would reintroduce exactly the expiry problem
 * this module exists to remove.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

export const MI_PHOTO_BUCKET = "market-intel-photos";

/** Only these are worth mirroring; anything else is already ours or is junk. */
export function isLinkedInImageUrl(url: string): boolean {
  return /^https?:\/\/[^/]*licdn\.com\//i.test(url);
}

function needsMirror(url: string): boolean {
  return isLinkedInImageUrl(url);
}

type MirrorPhotoOptions = { fallbackToSource?: boolean };

/**
 * A stable name for the picture.
 *
 * Keyed on the URL with its query string REMOVED, because the query is where
 * the expiry lives — the same photo re-fetched next week arrives with a new
 * `?e=` and would otherwise be mirrored again under a new name, filling the
 * bucket with duplicates of one face.
 */
function keyFor(url: string): string {
  const withoutQuery = url.split("?")[0];
  const hash = createHash("sha1").update(withoutQuery).digest("hex").slice(0, 24);
  const ext = /\.(jpe?g|png|webp|gif)$/i.exec(withoutQuery)?.[1] ?? "jpg";
  return `people/${hash}.${ext.toLowerCase()}`;
}

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Mirror one picture and hand back a URL that will still work next month.
 *
 * People keep the ORIGINAL url on failure because a currently loading face is
 * useful. Company callers opt out of that fallback so an expiring CDN string
 * cannot prevent their official-site logo from being used instead.
 */
export async function mirrorPhoto(
  url: string | null | undefined,
  options: MirrorPhotoOptions = {}
): Promise<string> {
  const src = String(url ?? "").trim();
  if (!src || !needsMirror(src)) return src;
  const failed = () => options.fallbackToSource === false ? "" : src;
  const db = admin();
  if (!db) return failed();

  const key = keyFor(src);
  const store = db.storage.from(MI_PHOTO_BUCKET);
  const publicUrl = store.getPublicUrl(key).data.publicUrl;

  /* Already mirrored: a HEAD on our own copy is far cheaper than fetching
     LinkedIn again, and the whole point is that our copy does not expire. */
  const folder = key.slice(0, key.lastIndexOf("/"));
  const name = key.slice(key.lastIndexOf("/") + 1);
  const { data: found } = await store.list(folder, { search: name, limit: 1 });
  if (found?.some((f) => f.name === name)) return publicUrl;

  try {
    const res = await fetch(src, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(20_000),
    });
    /* An expired link 403s. Nothing to mirror and nothing to be done about it
       here — the refresh that fetched a fresh URL is what fixes those. */
    if (!res.ok) return failed();
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return failed();
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length || bytes.length > 5_000_000) return failed();
    const { error } = await store.upload(key, bytes, {
      contentType: type,
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) return failed();
    return publicUrl;
  } catch {
    return failed();
  }
}

/**
 * Mirror many at once, de-duplicated and in small batches.
 *
 * A person appears on their company card and again on every post they wrote,
 * so the same URL arrives many times over; fetching it once per appearance
 * would be hundreds of needless downloads. Batched rather than all-at-once so
 * a refresh does not open three hundred sockets to one host.
 */
export async function mirrorPhotos(
  urls: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const unique = [...new Set(urls.map((u) => String(u ?? "").trim()).filter(needsMirror))];
  const out = new Map<string, string>();
  const BATCH = 8;
  for (let i = 0; i < unique.length; i += BATCH) {
    const slice = unique.slice(i, i + BATCH);
    const done = await Promise.all(slice.map((u) => mirrorPhoto(u)));
    slice.forEach((u, n) => out.set(u, done[n]));
  }
  return out;
}
