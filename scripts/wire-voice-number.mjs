// One-command Twilio ⇄ ElevenLabs wire-up (Anir authorized the ~$1/mo number
// purchase on Jul 4). Needs TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN in
// .env.local (never committed). Then:
//   node scripts/wire-voice-number.mjs
// 1. buys the cheapest local US voice number (skips if TWILIO_NUMBER set)
// 2. imports it into ElevenLabs (agents can then dial out from it)
// 3. assigns the Regulatory Affairs agent to answer INBOUND calls
// 4. appends ELEVENLABS_PHONE_NUMBER_ID + FREYR_VOICE_NUMBER to .env.local
import { readFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
const env = readFileSync(envPath, "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();

const SID = get("TWILIO_ACCOUNT_SID");
const TOKEN = get("TWILIO_AUTH_TOKEN");
const XI = get("ELEVENLABS_API_KEY");
if (!SID || !TOKEN) throw new Error("Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env.local first");
if (!XI) throw new Error("ELEVENLABS_API_KEY missing from .env.local");

const basic = "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64");
const tw = (path, init = {}) =>
  fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}${path}`, {
    ...init,
    headers: { Authorization: basic, ...(init.headers || {}) },
  });

// -- 1. get (or buy) the number --------------------------------------------
let number = get("FREYR_VOICE_NUMBER") || get("TWILIO_NUMBER");
if (number) {
  console.log(`Using existing number ${number}`);
} else {
  const avail = await (
    await tw(`/AvailablePhoneNumbers/US/Local.json?VoiceEnabled=true&PageSize=5`)
  ).json();
  const pick = avail.available_phone_numbers?.[0];
  if (!pick) throw new Error("No local US numbers available — try again");
  console.log(`Buying ${pick.friendly_name} (${pick.phone_number})…`);
  const bought = await (
    await tw(`/IncomingPhoneNumbers.json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        PhoneNumber: pick.phone_number,
        FriendlyName: "Freyr voice agents",
      }),
    })
  ).json();
  if (!bought.sid) throw new Error(`Purchase failed: ${JSON.stringify(bought)}`);
  number = bought.phone_number;
  console.log(`Bought ${number} (sid ${bought.sid})`);
}

// -- 2. import into ElevenLabs ----------------------------------------------
const H = { "xi-api-key": XI, "Content-Type": "application/json" };
const imp = await (
  await fetch("https://api.elevenlabs.io/v1/convai/phone-numbers", {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      phone_number: number,
      label: "Freyr voice agents",
      sid: SID,
      token: TOKEN,
    }),
  })
).json();
const phoneId = imp.phone_number_id;
if (!phoneId) throw new Error(`ElevenLabs import failed: ${JSON.stringify(imp)}`);
console.log(`Imported into ElevenLabs → ${phoneId}`);

// -- 3. Regulatory Affairs answers inbound ----------------------------------
const agents = JSON.parse(readFileSync(join(root, "lib/voiceAgents.json"), "utf8"));
const inboundAgent = agents["Regulatory Affairs"];
const assign = await fetch(
  `https://api.elevenlabs.io/v1/convai/phone-numbers/${phoneId}`,
  { method: "PATCH", headers: H, body: JSON.stringify({ agent_id: inboundAgent }) }
);
console.log(`Inbound → Regulatory Affairs agent: ${assign.status}`);

// -- 4. persist --------------------------------------------------------------
if (!get("ELEVENLABS_PHONE_NUMBER_ID"))
  appendFileSync(envPath, `\nELEVENLABS_PHONE_NUMBER_ID=${phoneId}\nFREYR_VOICE_NUMBER=${number}\n`);
console.log(`\nDone. Restart the dev server, then call ${number} — Mike answers as the Regulatory Affairs agent. Outbound uses the same line for all 6 agents.`);
