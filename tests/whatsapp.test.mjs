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
    id: "wamid.A", from: "15550100001", name: "Anir", timestamp: 1758900000000, phoneNumberId: "PNID", type: "text", text: "How is GSK doing?",
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

test("the agent's markdown becomes WhatsApp text with phone-openable links", () => {
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
      "You have *two* open opportunities with GSK (https://freyrsales.dev.freyrapps.com/customers/CUS-0001) worth _$330,000_:",
      "",
      "• Freya.Register (https://freyrsales.dev.freyrapps.com/opportunities/OPP-0001): Value $200,000, Stage Proposal",
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
