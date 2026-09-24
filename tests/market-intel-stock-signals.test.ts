import assert from "node:assert/strict";
import test from "node:test";
import { deriveSignals, type FeedCompany, type FeedNews } from "../lib/marketIntelFeed";
import { isStockMarketOnly } from "../lib/marketIntelSignals";

const item = (title: string): FeedNews => ({
  title, source: "News", url: `https://news.example.com/${encodeURIComponent(title)}`,
  published: "2026-09-10T12:00:00Z",
  label: { signals: ["financial_operational"], relevant: false, industries: [], isCompanyNews: true, v: 3 },
});
const signalsFor = (title: string) => {
  const company: FeedCompany = {
    id: "amgen", name: "Amgen", slug: null, author: null, posts: [], site: [], news: [item(title)],
    fetchedAt: "2026-09-10T12:00:00Z", group: "customer",
  };
  return deriveSignals(company, []).signals[0].kinds;
};

test("stock-price and analyst headlines are Others even with stored financial labels", () => {
  for (const title of [
    "Amgen stock surges 3.5%",
    "Amgen is up 8.6%",
    "Amgen stock price drops 10%",
    "HSBC trims Amgen share price target to $425",
  ]) {
    assert.equal(isStockMarketOnly(title), true, title);
    assert.deepEqual(signalsFor(title), ["others"], title);
  }
});

test("actual company financial results remain financial updates", () => {
  for (const title of [
    "Amgen reports quarterly revenue of $9 billion",
    "Amgen reports earnings and shares rise",
  ]) {
    assert.equal(isStockMarketOnly(title), false, title);
    assert.deepEqual(signalsFor(title), ["financial_operational"], title);
  }
});
