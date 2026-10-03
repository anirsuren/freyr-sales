import test from "node:test";
import assert from "node:assert/strict";
import { shouldContinueWhatsAppConversation } from "../lib/whatsappThreading.ts";

const hour = 60 * 60_000;
const day = 24 * hour;
const now = Date.parse("2026-09-30T12:09:00Z");

test("an overnight reply keeps the WhatsApp question it answers", () => {
  assert.equal(shouldContinueWhatsAppConversation({ updated: now - 18 * hour }, now), true);
});

test("recent chat stays available, while old or invalid chat starts fresh", () => {
  assert.equal(shouldContinueWhatsAppConversation({ updated: now - 6 * day }, now), true);
  assert.equal(shouldContinueWhatsAppConversation({ updated: now - 7 * day }, now), false);
  assert.equal(shouldContinueWhatsAppConversation({ updated: now + hour }, now), false);
  assert.equal(shouldContinueWhatsAppConversation(null, now), false);
});
