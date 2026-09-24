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

function count(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Apify returns post time as a millisecond number nested under posted_at. */
export function leadLinkedInPostDate(value: unknown): string | null {
  const raw = value && typeof value === "object" ?
    (value as Record<string, unknown>).timestamp ?? (value as Record<string, unknown>).date : value;
  const timestamp = typeof raw === "number" ? (raw < 1e12 ? raw * 1000 : raw) :
    typeof raw === "string" && /^\d{10,13}$/.test(raw) ? (Number(raw) < 1e12 ? Number(raw) * 1000 : Number(raw)) :
    typeof raw === "string" ? Date.parse(raw) : NaN;
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : null;
}

/** Keep a bounded, source-labelled fact snapshot, never an actor's raw payload. */
export function normalizeLeadLinkedInProfile(raw: unknown, fetchedAt = new Date().toISOString()): LeadLinkedInProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const basic = value.basic_info && typeof value.basic_info === "object"
    ? value.basic_info as Record<string, unknown> : value;
  const experience = records(value.experience, 30).map((item) => ({
    title: text(item.title, 140),
    company: text(item.company ?? item.companyName, 140),
    duration: text(item.duration ?? item.dateRange, 100),
    description: text(item.description, 2000),
  })).filter((item) => item.title || item.company);
  const education = records(value.education, 20).map((item) => ({
    school: text(item.school ?? item.schoolName, 140),
    degree: text(item.degree ?? item.degreeName, 140),
    ...(text(item.fieldOfStudy ?? item.field_of_study, 140) ? { fieldOfStudy: text(item.fieldOfStudy ?? item.field_of_study, 140) } : {}),
    ...(text(item.duration, 100) ? { duration: text(item.duration, 100) } : {}),
  })).filter((item) => item.school || item.degree);
  const professionalList = (raw: unknown) => records(raw, 20).map((item) => ({
    title: text(item.title, 200), subtitle: text(item.subtitle, 300),
  })).filter((item) => item.title);
  const honors = professionalList(value.honors);
  const organizations = professionalList(value.organizations);
  const skills = (Array.isArray(value.skills) ? value.skills : Array.isArray(basic.top_skills) ? basic.top_skills : []).slice(0, 50)
    .map((item) => text(typeof item === "string" ? item : (item as Record<string, unknown>)?.name, 80))
    .filter(Boolean);
  const location = basic.location && typeof basic.location === "object"
    ? (basic.location as Record<string, unknown>).full : basic.location;
  const company = basic.current_company && typeof basic.current_company === "object"
    ? (basic.current_company as Record<string, unknown>).name : basic.current_company;
  const profile = {
    fullName: text(value.fullName ?? basic.fullname ?? value.name ?? [value.firstName, value.lastName].filter(Boolean).join(" "), 120),
    headline: text(basic.headline, 300),
    currentCompany: text(value.currentCompany ?? company, 140),
    currentTitle: text(value.currentTitle || basic.current_title || experience[0]?.title, 140),
    location: text(location, 160),
    about: text(basic.about ?? basic.summary, 8000),
    ...(count(value.followerCount ?? basic.follower_count) !== undefined ? { followerCount: count(value.followerCount ?? basic.follower_count) } : {}),
    ...(count(value.connectionCount ?? basic.connection_count) !== undefined ? { connectionCount: count(value.connectionCount ?? basic.connection_count) } : {}),
    experience,
    education,
    ...(honors.length ? { honors } : {}),
    ...(organizations.length ? { organizations } : {}),
    skills,
    recentPosts: (Array.isArray(value.recentPosts) ? value.recentPosts : []).slice(0, 10).map((post) => {
      const item = post && typeof post === "object" ? post as Record<string, unknown> : {};
      const url = text(item.url, 500);
      const stats = item.stats && typeof item.stats === "object" ? item.stats as Record<string, unknown> : {};
      return {
        text: text(item.text, 5000),
        url: /^https:\/\/(?:[a-z]+\.)?linkedin\.com\//i.test(url) ? url : "",
        date: leadLinkedInPostDate(item.date ?? item.posted_at),
        ...(count(item.reactions ?? stats.total_reactions) !== undefined ? { reactions: count(item.reactions ?? stats.total_reactions) } : {}),
        ...(count(item.comments ?? stats.comments) !== undefined ? { comments: count(item.comments ?? stats.comments) } : {}),
        ...(count(item.reposts ?? stats.reposts) !== undefined ? { reposts: count(item.reposts ?? stats.reposts) } : {}),
        ...(text(item.type ?? item.post_type, 40) ? { type: text(item.type ?? item.post_type, 40) } : {}),
      };
    }).filter((post) => post.url && post.text),
    fetchedAt,
    source: "LinkedIn profile lookup" as const,
  };
  return profile.fullName || profile.headline || profile.about || experience.length ? profile : null;
}
