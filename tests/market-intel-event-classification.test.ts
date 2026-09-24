import assert from "node:assert/strict";
import test from "node:test";
import { deriveSignals, type FeedCompany, type FeedPost } from "../lib/marketIntelFeed";
import { isCompanyEventPost } from "../lib/marketIntelSignals";

const post = (text: string): FeedPost => ({
  url: "https://www.linkedin.com/posts/amgen-advocacy-summit",
  text,
  date: "2026-09-09T15:32:00.000Z",
  reactions: 144,
  comments: 6,
  reposts: 12,
  label: { signals: ["others"], relevant: true, industries: ["MPR"], isCompanyNews: true, v: 3 },
});

const company = (text: string): FeedCompany => ({
  id: "amgen", name: "Amgen", slug: null, author: null, posts: [post(text)], news: [], site: [],
  fetchedAt: "2026-09-09T15:32:00.000Z", group: "customer",
});

test("an existing Others label on a company summit post displays as Events", () => {
  const text = "What happens when you bring 130+ advocacy organizations together? At the 2026 Amgen Advocacy Summit, we listened to patient communities.";
  assert.equal(isCompanyEventPost(text), true);
  const result = deriveSignals(company(text), []).signals;
  assert.deepEqual(result[0].kinds, ["events"]);
});

test("general event commentary does not get forced into Events", () => {
  const text = "Our latest report discusses how patient advocacy events may change in the future.";
  assert.equal(isCompanyEventPost(text), false);
  assert.deepEqual(deriveSignals(company(text), []).signals[0].kinds, ["others"]);
});
