import * as feedModule from "@/lib/marketIntelFeed";

const feed = feedModule.deriveSignals ? feedModule : (feedModule as any).default;
const names = feed.freyrCompetitorNames();
if (!names.some((company: { name: string }) => company.name === "Veeva")) throw new Error("Freyr competitor missing");
if (names.some((company: { name: string }) => company.name === "Novartis")) throw new Error("Customer treated as Freyr competitor");

const company: any = {
  id: "amgen", name: "Amgen", group: "customer", posts: [], site: [], news: [
    { title: "Amgen discusses Novartis and Roche in drug race", source: "News", url: "https://example.com/old", published: "2026-09-01", summary: "Novartis competes with Amgen.", label: { v: 3, signals: ["competitor_mentions"], relevant: true, industries: ["MPR"], why: "A Freyr competitor is already in this account." } },
    { title: "Amgen and Veeva announce regulatory platform work", source: "News", url: "https://example.com/new", published: "2026-09-20", summary: "Veeva will support filings." },
  ],
};
const result = feed.deriveSignals(company, names);
const old = result.signals.find((signal: { url: string }) => signal.url.endsWith("/old"));
const current = result.signals.find((signal: { url: string }) => signal.url.endsWith("/new"));
if (old?.kinds.includes("competitor_mentions") || old?.why.includes("Freyr competitor")) throw new Error("Old customer-rival label survived");
if (!current?.kinds.includes("competitor_mentions") || !current.competitors?.includes("Veeva")) throw new Error("Freyr competitor not detected");
if (result.competitorMentions.length !== 1 || result.competitorMentions[0].name !== "Veeva") throw new Error("Incorrect sidebar counts");
if (result.signals[0].url !== "https://example.com/new") throw new Error("Signals are not newest first");
console.log("Market Intel competitor meaning: pass");
