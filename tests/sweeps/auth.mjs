/* MINT A SESSION INSIDE THE TEST, NOT BEFORE IT.
   The access grant lives 14 minutes. Any walk through the app that takes
   longer than that silently downgrades to "rep" halfway, and every page the
   role gates then redirects — which reads exactly like a permissions bug and
   is not one. Scripts call refresh() between steps instead. */
import fs from 'node:fs';
import crypto from 'node:crypto';

const env = Object.fromEntries(
  fs.readFileSync('/Users/anirudhsuren/Downloads/freyr sales/freyr-sales/.env.local','utf8')
    .split('\n').filter(l=>l.includes('=') && !l.startsWith('#'))
    .map(l=>{const i=l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];})
);
const sign = (payload, secret) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url');
};
const WORKSPACE = env.FREYR_WORKSPACE_ID || '5dec1cae-b2b8-42ea-a9f6-a3212e90f437';

export const PEOPLE = {
  admin:   {sub:'576d2b6c-f4f0-4b04-848e-74fd3a3a10f8', app:'6d64db4f-77ad-4a38-a825-10b4fdbc4424', name:'Anir Suren',  email:'anir.s@freyrsolutions.com',    role:'admin'},
  manager: {sub:'12812108-1f92-4bdb-a910-eff5edbaa7d1', app:'f0f0b0df-1734-49c0-bf53-a45a43da1522', name:'Anir Test 5', email:'anir.s+5@freyrsolutions.com', role:'manager'},
  rep:     {sub:'12812108-1f92-4bdb-a910-eff5edbaa7d1', app:'f0f0b0df-1734-49c0-bf53-a45a43da1522', name:'Anir Test 5', email:'anir.s+5@freyrsolutions.com', role:'rep'},
};

export function cookiesFor(who) {
  const p = PEOPLE[who];
  if (!p) throw new Error(`no such identity: ${who}`);
  const now = Math.floor(Date.now()/1000);
  return [
    {name:'freyr_session', domain:'localhost', path:'/', value: sign(
      {id:p.sub, name:p.name, email:p.email, roles:[p.role], exp: now + 8*3600},
      env.AUTH_SESSION_SECRET || env.AUTH_COOKIE_SECRET)},
    {name:'freyr_access_v2', domain:'localhost', path:'/', value: sign(
      {sub:p.sub, userId:p.app, email:p.email, displayName:p.name, role:p.role,
       workspaceId:WORKSPACE, exp: now + 14*60},
      env.AUTH_COOKIE_SECRET)},
  ];
}

/** Put a fresh, unexpired grant on the context. Call it liberally. */
export async function refresh(ctx, who) {
  /* Overwrite in place. clearCookies() first meant a page could be mid-flight
     with no session at all, which bounced it to /login and looked like a
     blocked route. Same name+domain+path replaces the value. */
  await ctx.addCookies(cookiesFor(who));
}

/**
 * A BROWSER THAT HAS ONLY EVER BEEN ONE PERSON.
 *
 * Switching identity by overwriting cookies on a live context let an earlier
 * role's grant linger, and a rep appeared to reach /market-intel — a
 * permissions hole that was not real. One context per identity, always.
 */
export async function asPerson(browser, who, viewport = {width:1512,height:1000}) {
  const ctx = await browser.newContext({viewport});
  await ctx.addCookies(cookiesFor(who));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0,160)));
  return {ctx, page, errors, refresh: () => refresh(ctx, who)};
}
