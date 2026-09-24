import assert from "node:assert/strict";
import test from "node:test";
import { healthAuthorityName, isCompanyAuthorityNotice } from "../lib/marketIntelAuthorities";
import { deriveSignals, type FeedCompany, type FeedNews } from "../lib/marketIntelFeed";
import { CUSTOMER_SIGNALS, COMPETITOR_SIGNALS } from "../lib/marketIntelSignals";

const noticeUrl = "https://api.fda.gov/drug/enforcement.json?search=recall_number%3A%22D-0615-2026%22";
const news = (url: string, provenance?: "health_authority"): FeedNews => ({
  title: "FDA Class II recall D-0615-2026: Amgen — Corlanor tablets",
  source: "FDA",
  url,
  published: "2026-07-01T12:00:00.000Z",
  provenance,
  label: { signals: ["compliance_enforcement"], relevant: true, industries: [], isCompanyNews: true, v: 3 },
});

test("customer signal follows RA/QA and does not appear for competitors", () => {
  assert.equal(CUSTOMER_SIGNALS[CUSTOMER_SIGNALS.indexOf("ra_qa_team") + 1], "compliance_enforcement");
  assert.equal(CUSTOMER_SIGNALS[CUSTOMER_SIGNALS.indexOf("compliance_enforcement") + 1], "technology");
  assert.equal(COMPETITOR_SIGNALS.includes("compliance_enforcement"), false);
});

test("only official authority URLs can establish provenance", () => {
  assert.equal(healthAuthorityName(noticeUrl), "FDA");
  assert.equal(healthAuthorityName("https://www.gov.uk/drug-device-alerts/example"), "MHRA");
  assert.equal(healthAuthorityName("https://www.ema.europa.eu/en/example"), "EMA");
  assert.equal(healthAuthorityName("https://fda.gov.evil.example/recall"), null);
  assert.equal(isCompanyAuthorityNotice({ title: "Amgen FDA recall", url: noticeUrl }, "Amgen"), true);
  assert.equal(isCompanyAuthorityNotice({ title: "Amgen FDA recall", url: "https://news.example.com/amgen-recall" }, "Amgen"), false);
  assert.equal(isCompanyAuthorityNotice({ title: "Novartis FDA recall", url: noticeUrl }, "Amgen"), false);
});

test("a news article carrying an old compliance label is not shown as an authority signal", () => {
  const base: FeedCompany = {
    id: "amgen", name: "Amgen", slug: null, author: null, posts: [], site: [],
    news: [news("https://news.example.com/amgen-recall")], fetchedAt: "2026-07-01T12:00:00.000Z", group: "customer",
  };
  assert.equal(deriveSignals(base, []).signals[0].kinds.includes("compliance_enforcement"), false);
  assert.equal(deriveSignals({ ...base, news: [news(noticeUrl, "health_authority")] }, []).signals[0].kinds[0], "compliance_enforcement");
});
