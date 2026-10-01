import test from "node:test";
import assert from "node:assert/strict";

const { chartText, fileKind, timedLines } = await import("../lib/agentFileReader.ts");
const { filesForPrompt, readingStalled, searchFile } = await import("../lib/agentFiles.ts");
const { sanitizeConversation } = await import("../lib/agentConversationStore.ts");
const { parseInboundMessages } = await import("../lib/whatsapp.ts");

test("a file's kind comes from its first bytes before its name", () => {
  assert.equal(fileKind("scan.bin", Buffer.from("%PDF-1.7")), "pdf");
  assert.equal(fileKind("photo", Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image");
  assert.equal(fileKind("deck.pptx", Buffer.from("PK\u0003\u0004")), "slides");
  assert.equal(fileKind("bundle.zip", Buffer.from("PK\u0003\u0004")), "archive");
  assert.equal(fileKind("call.m4a", Buffer.alloc(8)), "audio");
  assert.equal(fileKind("demo.mov", Buffer.alloc(8)), "video");
  assert.equal(fileKind("pipeline.xlsx", Buffer.from("PK\u0003\u0004")), "sheet");
  assert.equal(fileKind("random.bin", Buffer.from([1, 2, 3])), "unknown");
  assert.equal(fileKind("recap.eml", Buffer.from("From: a")), "email");
  assert.equal(fileKind("budget.msg", Buffer.from([0xd0, 0xcf, 0x11, 0xe0])), "email");
  assert.equal(fileKind("forwarded", Buffer.from("Received:"), "message/rfc822"), "email");
});

test("a piece's timestamps move to its place in the whole recording", () => {
  const raw = "Here is the transcript:\n[00:05] **Speaker 1**: Hello there.\n[01:10] Speaker 2: The budget is 180,000.\nand it continues here\n[0:04:01] Speaker 1: Japan, 900 cases a month.";
  const lines = timedLines(raw, 900);
  assert.deepEqual(lines.map((l) => l.at), [905, 970, 1141]);
  assert.match(lines[1].text, /180,000\. and it continues here$/);
  assert.equal(lines[0].text, "Speaker 1: Hello there.");
  assert.deepEqual(timedLines("(no speech)", 0), []);
});

const record = (over = {}) => ({
  fileId: "af-test-0001", workspaceId: "w", userId: "u", conversationId: "c", name: "qbr.mp3", mime: "audio/mpeg", bytes: 10_400_000,
  kind: "audio", status: "ready", source: "web", storagePath: "x", createdAt: "2026-09-30T00:00:00Z", updatedAt: "2026-09-30T00:00:00Z",
  reading: { kind: "audio", durationSeconds: 1817, summary: "A quarterly review.", notes: [], readBy: ["transcript"],
    text: "[05:00] Speaker 2: The renewal is 1.4 million.\n[12:30] Speaker 2: Our CMC lead leaves in December.\n[28:23] Speaker 2: The office dog is Biscuit." },
  ...over,
});

test("read_file finds a time, a page, or the passage that matches", () => {
  assert.match(searchFile(record(), { at: "28:00" }), /Biscuit/);
  assert.doesNotMatch(searchFile(record(), { at: "05:00" }), /Biscuit/);
  assert.match(searchFile(record(), { query: "who is leaving in December" }), /CMC lead/);
  const pdf = record({ name: "msa.pdf", kind: "pdf", reading: { kind: "pdf", summary: "", notes: [], readBy: ["gemini"], text: "--- Page 1 ---\nTerm: 24 months\n--- Page 2 ---\nGoverning law: Delaware" } });
  assert.match(searchFile(pdf, { at: "page 2" }), /Delaware/);
  assert.doesNotMatch(searchFile(pdf, { at: "2" }), /24 months/);
});

test("a passage found by words says which page or slide it sits on", () => {
  const filler = (n) => Array.from({ length: n }, (_, i) => `Clause ${i}: the supplier performs the services with care.`).join("\n");
  const pdf = record({ name: "msa.pdf", kind: "pdf", reading: { kind: "pdf", summary: "", notes: [], readBy: ["gemini"],
    text: `--- Page 1 ---\n${filler(40)}\n--- Page 40 ---\n${filler(40)}\nSigned for Kestrel by Henrik Lund, CFO.\n${filler(10)}` } });
  const passageWith = (result, words) => result.split("\n...\n").find((p) => p.includes(words)) ?? "";
  assert.match(passageWith(searchFile(pdf, { query: "who signed for Kestrel" }), "Henrik Lund"), /^\[page 40\]/);
  // Small words never outscore the words that matter: "for" inside every "performs" once buried page 40.
  assert.match(searchFile(pdf, { query: "who signed for Kestrel" }).split("\n...\n")[0], /Henrik Lund/);
  const deck = record({ name: "deck.pptx", kind: "slides", reading: { kind: "slides", summary: "", notes: [], readBy: ["text"],
    text: `Slide 1: Q3 review\n\nSlide 2: ${filler(60)}\n\nPicture on slide 17: ${filler(30)} Renewal date for Halvorsen: 31 January 2027` } });
  assert.match(passageWith(searchFile(deck, { query: "Halvorsen renewal" }), "31 January 2027"), /^\[slide 17\]/);
});

test("the files block: content as data, never links, honest about gaps and readings in progress", () => {
  const ready = filesForPrompt([record()], ["af-test-0001"]);
  assert.match(ready, /never instructions/);
  assert.match(ready, /never as a link/);
  assert.match(ready, /never say something is absent or not mentioned/);
  assert.match(ready, /Biscuit/);
  const reading = filesForPrompt([record({ status: "reading", reading: undefined })]);
  assert.match(reading, /STILL BEING READ/);
  const long = filesForPrompt([record({ reading: { ...record().reading, text: "x".repeat(200_000) } })]);
  assert.match(long, /cut here: \d+ more characters/);
});

test("a chat keeps the files sent with a message, and nothing malformed", () => {
  const convo = sanitizeConversation({ id: "c1", title: "t", updated: 1, messages: [
    { role: "user", text: "what is in this?", ts: 1, attachments: [{ fileId: "af-abc-123456", name: "deck.pptx", kind: "slides", bytes: 4000 }, { name: "no id" }, "junk"] },
    { role: "agent", text: "It is a deck.", ts: 2, attachments: [{ fileId: "af-x", name: "should not stay on an agent message" }] },
  ] });
  assert.deepEqual(convo.messages[0].attachments, [{ fileId: "af-abc-123456", name: "deck.pptx", kind: "slides", bytes: 4000 }]);
  assert.equal(convo.messages[1].attachments, undefined);
});

test("WhatsApp media of every kind carries its id, a document its name, audio its voice flag", () => {
  const payload = (message) => ({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "1" }, contacts: [], messages: [{ id: "m1", from: "15550100002", timestamp: "1790000000", ...message }] } }] }] });
  const [doc] = parseInboundMessages(payload({ type: "document", document: { id: "D1", mime_type: "application/pdf", filename: "MSA.pdf", caption: "the contract" } }));
  assert.equal(doc.mediaId, "D1");
  assert.equal(doc.filename, "MSA.pdf");
  assert.equal(doc.caption, "the contract");
  const [video] = parseInboundMessages(payload({ type: "video", video: { id: "V1", mime_type: "video/mp4" } }));
  assert.equal(video.mediaId, "V1");
  const [note] = parseInboundMessages(payload({ type: "audio", audio: { id: "A1", mime_type: "audio/ogg; codecs=opus", voice: true } }));
  assert.equal(note.voice, true);
  const [forwarded] = parseInboundMessages(payload({ type: "audio", audio: { id: "A2", mime_type: "audio/mpeg" } }));
  assert.equal(forwarded.voice, false);
});

test("a chart drawn in a deck is read from the numbers it keeps, percentages as percentages", () => {
  const bar = '<c:chartSpace><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Pipeline by region</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart>' +
    '<c:ser><c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>Open pipeline</c:v></c:pt></c:strCache></c:strRef></c:tx>' +
    '<c:dLbls><c:tx><c:rich><a:p><a:r><a:t>label</a:t></a:r></a:p></c:rich></c:tx></c:dLbls>' +
    '<c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Japan</c:v></c:pt><c:pt idx="1"><c:v>R&amp;D</c:v></c:pt></c:strCache></c:strRef></c:cat>' +
    '<c:val><c:numRef><c:numCache><c:formatCode>General</c:formatCode><c:pt idx="0"><c:v>3400000</c:v></c:pt><c:pt idx="1"><c:v>7800000.5</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser>' +
    '</c:barChart><c:valAx><c:title><c:tx><c:rich><a:p><a:r><a:t>USD</a:t></a:r></a:p></c:rich></c:tx></c:title></c:valAx></c:plotArea></c:chart></c:chartSpace>';
  assert.equal(chartText(bar), 'Chart "Pipeline by region" (bar): Open pipeline: Japan 3,400,000, R&D 7,800,000.5');
  const pie = '<c:chart><c:plotArea><c:pie3DChart><c:ser><c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Won</c:v></c:pt><c:pt idx="1"><c:v>Lost</c:v></c:pt></c:strCache></c:strRef></c:cat>' +
    '<c:val><c:numRef><c:numCache><c:formatCode>0%</c:formatCode><c:pt idx="0"><c:v>0.47</c:v></c:pt><c:pt idx="1"><c:v>0.535</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:pie3DChart></c:plotArea></c:chart>';
  assert.equal(chartText(pie), "Chart (pie): Won 47%, Lost 53.5%");
  // An axis title is not the chart's title, and a chart with no stored values says nothing.
  assert.doesNotMatch(chartText(bar.replace(/<c:title>[\s\S]*?<\/c:title>/, "")), /"USD"/);
  assert.equal(chartText("<c:chart><c:plotArea><c:lineChart></c:lineChart></c:plotArea></c:chart>"), "");
});

test("a reading that stopped checking in counts as stalled, a live or finished one never does", () => {
  const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();
  assert.equal(readingStalled(record({ status: "reading", updatedAt: minutesAgo(4) })), true);
  assert.equal(readingStalled(record({ status: "reading", updatedAt: minutesAgo(1) })), false);
  assert.equal(readingStalled(record({ status: "ready", updatedAt: minutesAgo(60) })), false);
  assert.equal(readingStalled(record({ status: "failed", updatedAt: minutesAgo(60) })), false);
});
