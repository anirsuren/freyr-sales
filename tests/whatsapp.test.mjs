import test from "node:test";
import assert from "node:assert/strict";

const wa = await import("../lib/whatsapp.ts");

const SECRET = "test-app-secret";

test("a body signed with the app secret verifies; anything else does not", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const header = wa.signWhatsAppBody(body, SECRET);
  assert.equal(wa.verifyWhatsAppSignature(body, header, SECRET), true);
  assert.equal(wa.verifyWhatsAppSignature(body + " ", header, SECRET), false);
  assert.equal(wa.verifyWhatsAppSignature(body, header, "other-secret"), false);
  assert.equal(wa.verifyWhatsAppSignature(body, "sha256=nothex", SECRET), false);
  assert.equal(wa.verifyWhatsAppSignature(body, null, SECRET), false);
  assert.equal(wa.verifyWhatsAppSignature(body, header, ""), false);
});

test("messages come out of Meta's envelope; receipts and other fields do not", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15550100000", phone_number_id: "PNID" },
              contacts: [{ profile: { name: "Anir" }, wa_id: "15550100001" }],
              messages: [
                { from: "15550100001", id: "wamid.A", timestamp: "1758900000", type: "text", text: { body: "  How is GSK doing?  " } },
                { from: "15550100001", id: "wamid.B", timestamp: "1758900001", type: "image", image: { id: "x" } },
              ],
            },
          },
          { field: "messages", value: { statuses: [{ id: "wamid.A", status: "delivered" }] } },
          { field: "account_update", value: { messages: [{ id: "nope", from: "1" }] } },
        ],
      },
    ],
  };
  const messages = wa.parseInboundMessages(payload);
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0], {
    id: "wamid.A", from: "15550100001", name: "Anir", timestamp: 1758900000000, phoneNumberId: "PNID", type: "text", text: "How is GSK doing?", mediaId: "", mimeType: "",
  });
  assert.equal(messages[1].type, "image");
  assert.equal(messages[1].text, "");
  assert.deepEqual(wa.parseInboundMessages({ object: "page", entry: [] }), []);
  assert.deepEqual(wa.parseInboundMessages(null), []);
});

test("a link code is six digits and nothing else", () => {
  assert.equal(wa.linkCodeIn("482913"), "482913");
  assert.equal(wa.linkCodeIn(" 482 913 "), "482913");
  assert.equal(wa.linkCodeIn("482-913"), "482913");
  assert.equal(wa.linkCodeIn("code 482913"), null);
  assert.equal(wa.linkCodeIn("4829130"), null);
  assert.equal(wa.linkCodeIn(""), null);
});

test("phone numbers are digits; display adds the plus", () => {
  assert.equal(wa.normalizePhone("+1 (555) 010-0000"), "15550100000");
  assert.equal(wa.displayPhone("15550100000"), "+15550100000");
  assert.equal(wa.displayPhone(""), "");
  assert.equal(wa.waMeLink("+1 555 010 0000", "482913"), "https://wa.me/15550100000?text=482913");
  assert.equal(wa.waMeLink("", "482913"), null);
});

test("the agent's markdown becomes WhatsApp text: app records by name, outside sources with their link", () => {
  const md = [
    "## Open deals with GSK",
    "",
    "You have **two** open opportunities with [GSK](/customers/CUS-0001) worth *$330,000*:",
    "",
    "| Deal | Value | Stage |",
    "|---|---|---|",
    "| [Freya.Register](/opportunities/OPP-0001) | $200,000 | Proposal |",
    "| Regulatory writing | $130,000 | Qualified |",
    "",
    "- Owner: Priya",
    "* Next step: ~~call~~ email",
    "",
    "Source: [Fierce Pharma](https://www.fiercepharma.com/story)",
    "",
    '<followups>["What is the next step?","Who owns these?","Any risk?"]</followups>',
  ].join("\n");
  const text = wa.toWhatsAppText(md, "https://freyrsales.dev.freyrapps.com/");
  assert.equal(
    text,
    [
      "*Open deals with GSK*",
      "",
      "You have *two* open opportunities with GSK worth _$330,000_:",
      "",
      "• Freya.Register: Value $200,000, Stage Proposal",
      "• Regulatory writing: Value $130,000, Stage Qualified",
      "",
      "• Owner: Priya",
      "• Next step: ~call~ email",
      "",
      "Source: Fierce Pharma (https://www.fiercepharma.com/story)",
    ].join("\n")
  );
});

test("long replies split on paragraph boundaries under the WhatsApp cap", () => {
  const paragraph = "word ".repeat(300).trim();
  const text = [paragraph, paragraph, paragraph].join("\n\n");
  const chunks = wa.chunkWhatsAppText(text, 2000);
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((chunk) => chunk.length <= 2000));
  assert.equal(chunks.join("\n\n"), text);
  assert.deepEqual(wa.chunkWhatsAppText("short"), ["short"]);
});

test("with no access token the reply is logged and reported as skipped, not sent", async () => {
  const config = { verifyToken: "v", appSecret: "s", accessToken: "", phoneNumberId: "", businessNumber: "", graphVersion: "v22.0" };
  let called = false;
  const result = await wa.sendWhatsAppText("15550100001", "hello", config, async () => {
    called = true;
    return new Response("{}", { status: 200 });
  });
  assert.deepEqual(result, { ok: true, skipped: true });
  assert.equal(called, false);
});

test("with a token the Graph API gets a text message for the right number", async () => {
  const config = { verifyToken: "v", appSecret: "s", accessToken: "tok", phoneNumberId: "PNID", businessNumber: "", graphVersion: "v22.0" };
  const calls = [];
  const result = await wa.sendWhatsAppText("+1 555 010 0001", "hello", config, async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ messages: [{ id: "wamid.OUT" }] }), { status: 200 });
  });
  assert.deepEqual(result, { ok: true, messageId: "wamid.OUT" });
  assert.equal(calls[0].url, "https://graph.facebook.com/v22.0/PNID/messages");
  assert.equal(calls[0].init.headers.Authorization, "Bearer tok");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    messaging_product: "whatsapp", recipient_type: "individual", to: "15550100001", type: "text", text: { preview_url: false, body: "hello" },
  });
  const failed = await wa.sendWhatsAppText("15550100001", "hello", config, async () =>
    new Response(JSON.stringify({ error: { message: "(#131030) Recipient not in allowed list" } }), { status: 400 })
  );
  assert.deepEqual(failed, { ok: false, error: "(#131030) Recipient not in allowed list" });
});

test("configuration needs the verify token and the app secret; sending needs the rest", () => {
  assert.equal(wa.whatsappConfig({}), null);
  assert.equal(wa.whatsappConfig({ WHATSAPP_VERIFY_TOKEN: "v" }), null);
  const partial = wa.whatsappConfig({ WHATSAPP_VERIFY_TOKEN: "v", WHATSAPP_APP_SECRET: "s" });
  assert.equal(partial.graphVersion, "v22.0");
  assert.equal(wa.canSendWhatsApp(partial), false);
  const full = wa.whatsappConfig({ WHATSAPP_VERIFY_TOKEN: "v", WHATSAPP_APP_SECRET: "s", WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "p" });
  assert.equal(wa.canSendWhatsApp(full), true);
});

test("the app reaches itself on the address the server is bound to", async () => {
  const { internalAppOrigin } = await import("../lib/internalOrigin.ts");
  assert.equal(internalAppOrigin({ PORT: "3000" }), "http://127.0.0.1:3000");
  assert.equal(internalAppOrigin({ PORT: "3000", HOSTNAME: "0.0.0.0" }), "http://127.0.0.1:3000");
  assert.equal(internalAppOrigin({ PORT: "3000", HOSTNAME: "ip-10-0-1-23.ec2.internal" }), "http://ip-10-0-1-23.ec2.internal:3000");
  assert.equal(internalAppOrigin({ PORT: "8080", HOSTNAME: "ip-10-0-1-23" }), "http://ip-10-0-1-23:8080");
  assert.equal(internalAppOrigin({ PORT: "3000", HOSTNAME: "ip-10-0-1-23", APP_INTERNAL_ORIGIN: "http://localhost:3000/" }), "http://localhost:3000");
  assert.equal(internalAppOrigin({}), "http://127.0.0.1:3000");
});

test("a voice note comes through with its media id and mime type", async () => {
  const wa = await import("../lib/whatsapp.ts");
  const messages = wa.parseInboundMessages({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "PNID" }, contacts: [], messages: [
      { from: "15550100001", id: "wamid.V", timestamp: "1758900002", type: "audio", audio: { id: "media-1", mime_type: "audio/ogg; codecs=opus", voice: true } },
    ] } }] }],
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "audio");
  assert.equal(messages[0].text, "");
  assert.equal(messages[0].mediaId, "media-1");
  assert.equal(messages[0].mimeType, "audio/ogg; codecs=opus");
  const voice = await import("../lib/voiceNote.ts");
  assert.equal(voice.voiceNoteConfigured({}), false);
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, name: init.body.get("file").name, model: init.body.get("model") }); return new Response("  hello from the road  ", { status: 200 }); };
  const out = await voice.transcribeVoiceNote(Buffer.from("ogg-bytes"), "audio/ogg; codecs=opus", fetchImpl, { OPENAI_API_KEY: "k" });
  assert.deepEqual(out, { ok: true, text: "hello from the road" });
  assert.equal(calls[0].name, "voice-note.ogg");
  assert.equal(calls[0].model, "whisper-1");
});

test("a voice note's bytes come from Meta in two hops, and a miss is null not a crash", async () => {
  const wa = await import("../lib/whatsapp.ts");
  const config = { verifyToken: "v", appSecret: "s", accessToken: "tok", phoneNumberId: "PNID", businessNumber: "15551787823", graphVersion: "v22.0" };
  const seen = [];
  const ok = async (url, init) => {
    seen.push({ url: String(url), auth: init?.headers?.Authorization });
    return String(url).includes("/media-1")
      ? new Response(JSON.stringify({ url: "https://lookaside.fb/file/abc", mime_type: "audio/ogg; codecs=opus" }), { status: 200 })
      : new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/ogg" } });
  };
  const got = await wa.downloadWhatsAppMedia("media-1", config, ok);
  assert.equal(got?.mimeType, "audio/ogg; codecs=opus");
  assert.equal(got?.bytes.length, 3);
  assert.equal(seen.length, 2);
  assert.ok(seen[0].url.endsWith("/v22.0/media-1"));
  assert.equal(seen[0].auth, "Bearer tok");
  assert.equal(seen[1].url, "https://lookaside.fb/file/abc");

  // No token: nothing is fetched at all.
  let called = 0;
  const counted = async () => { called += 1; return new Response("{}", { status: 200 }); };
  assert.equal(await wa.downloadWhatsAppMedia("media-1", { ...config, accessToken: "" }, counted), null);
  assert.equal(called, 0);

  // Meta says no, or the file 404s: null, never a throw.
  assert.equal(await wa.downloadWhatsAppMedia("media-1", config, async () => new Response("no", { status: 401 })), null);
  assert.equal(
    await wa.downloadWhatsAppMedia("media-1", config, async (url) =>
      String(url).includes("/media-1") ? new Response(JSON.stringify({ url: "https://lookaside.fb/file/abc" }), { status: 200 }) : new Response("gone", { status: 404 })
    ),
    null
  );
  assert.equal(await wa.downloadWhatsAppMedia("media-1", config, async () => { throw new Error("network"); }), null);
});
