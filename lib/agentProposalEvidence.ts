import { parseDay, parseMoney } from "./agentActionsShared";

type Turn = { role: "user" | "agent"; text: string };

const CREATE_DEAL = /\b(?:create|open|add|make|start|propose)\b[^.!?\n]{0,120}\b(?:opportunity|deal)\b/i;
const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|sept|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

/** Only the user's words from the latest create-deal request may supply its values. */
function relevantUserText(history: Turn[], message: string): string {
  const userTexts = [...history.filter((turn) => turn.role === "user").map((turn) => turn.text), message];
  let start = userTexts.length - 1;
  for (let i = userTexts.length - 1; i >= 0; i--) {
    if (CREATE_DEAL.test(userTexts[i])) {
      start = i;
      break;
    }
  }
  return userTexts.slice(start).join("\n");
}

function datesIn(text: string): string[] {
  const patterns = [
    /\b\d{4}-\d{1,2}-\d{1,2}\b/g,
    new RegExp(`\\b${MONTH}\\.?\\s*\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s*\\d{4})?\\b`, "gi"),
    new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}(?:,?\\s*\\d{4})?\\b`, "gi"),
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?\b/g,
    /\b(?:today|tomorrow|(?:this|next|coming)\s+(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*|in\s+\d+\s+days?|end of (?:this |next )?month)\b/gi,
  ];
  return patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[0]));
}

function moneyIn(text: string): number[] {
  const candidates = [
    ...text.matchAll(/(?:[$€£]\s*|\b(?:USD|EUR|GBP|INR)\s*)\d[\d,]*(?:\.\d+)?\s*[kmb]?\b/gi),
    ...text.matchAll(/\b\d[\d,]*(?:\.\d+)?\s*[kmb]\b/gi),
    ...text.matchAll(/\b(?:tcv|value|worth|budget)\s*(?:of|is|at|:|=)?\s*(\d[\d,]*(?:\.\d+)?)\b/gi),
  ];
  return candidates.map((match) => parseMoney(match[1] ?? match[0])).filter((value): value is number => value !== null);
}

function confidenceIn(text: string): number[] {
  return [
    ...[...text.matchAll(/\b(\d{1,3})\s*(?:%|percent\b)/gi)].map((match) => Number(match[1])),
    ...[...text.matchAll(/\bconfidence\s*(?:of|is|at|:|=)?\s*(\d{1,3})\b/gi)].map((match) => Number(match[1])),
  ];
}

export function checkCreateOpportunityEvidence(
  rawParams: unknown,
  message: string,
  history: Turn[],
  now = new Date(),
  zone = "UTC"
): { params: Record<string, unknown>; unsupported: string[] } {
  const params = rawParams && typeof rawParams === "object" ? { ...(rawParams as Record<string, unknown>) } : {};
  const evidence = relevantUserText(history, message);
  const unsupported: string[] = [];
  const value = parseMoney(params.estimatedTcv);
  if (value === null || !moneyIn(evidence).includes(value)) unsupported.push("estimated value");
  const confidence = Number(params.confidence);
  if (!Number.isFinite(confidence) || !confidenceIn(evidence).includes(confidence)) unsupported.push("confidence percentage");
  const signingDate = parseDay(params.estSignDate, now, zone);
  if (!signingDate || !datesIn(evidence).some((date) => parseDay(date, now, zone) === signingDate)) {
    unsupported.push("expected signing date");
  }
  if (params.status && !new RegExp(`\\b${String(params.status).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(evidence)) {
    delete params.status;
  }
  return { params, unsupported };
}
