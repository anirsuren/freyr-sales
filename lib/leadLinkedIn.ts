import type { LeadLinkedInProfile } from "./leadsShared";

/** Only a personal LinkedIn profile can be attached to a person lead. */
export function leadLinkedInUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "";
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port ||
        (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) ||
        !/^\/in\/[a-z0-9_%\-]+\/?$/i.test(url.pathname)) return null;
    return `https://www.linkedin.com${url.pathname.replace(/\/$/, "")}`;
  } catch { return null; }
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function records(value: unknown, max: number): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((v) => v && typeof v === "object").slice(0, max) : [];
}

/** Keep a bounded, source-labelled fact snapshot, never an actor's raw payload. */
export function normalizeLeadLinkedInProfile(raw: unknown, fetchedAt = new Date().toISOString()): LeadLinkedInProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const experience = records(value.experience, 12).map((item) => ({
    title: text(item.title, 140),
    company: text(item.company ?? item.companyName, 140),
    duration: text(item.duration ?? item.dateRange, 100),
    description: text(item.description, 500),
  })).filter((item) => item.title || item.company);
  const education = records(value.education, 8).map((item) => ({
    school: text(item.school ?? item.schoolName, 140),
    degree: text(item.degree ?? item.degreeName, 140),
  })).filter((item) => item.school || item.degree);
  const skills = (Array.isArray(value.skills) ? value.skills : []).slice(0, 30)
    .map((item) => text(typeof item === "string" ? item : (item as Record<string, unknown>)?.name, 80))
    .filter(Boolean);
    const profile = {
    fullName: text(value.fullName ?? value.name ?? [value.firstName, value.lastName].filter(Boolean).join(" "), 120),
    headline: text(value.headline, 300),
    currentCompany: text(value.currentCompany, 140),
    currentTitle: text(value.currentTitle, 140),
    location: text(value.location, 160),
    about: text(value.about ?? value.summary, 3000),
    experience,
    education,
    skills,
    recentPosts: (Array.isArray(value.recentPosts) ? value.recentPosts : []).slice(0, 10).map((post) => {
      const item = post && typeof post === "object" ? post as Record<string, unknown> : {};
      const url = text(item.url, 500);
      return {
        text: text(item.text, 2000),
        url: /^https:\/\/(?:[a-z]+\.)?linkedin\.com\//i.test(url) ? url : "",
        date: text(item.date, 40) || null,
      };
    }).filter((post) => post.url && post.text),
    fetchedAt,
    source: "LinkedIn profile lookup" as const,
  };
  return profile.fullName || profile.headline || profile.about || experience.length ? profile : null;
}
