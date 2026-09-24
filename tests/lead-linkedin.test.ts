import { strict as assert } from "node:assert";
import { test } from "node:test";
import { leadLinkedInPostDate, leadLinkedInUrl, normalizeLeadLinkedInProfile } from "../lib/leadLinkedIn";

test("accepts only personal LinkedIn profiles and strips tracking parameters", () => {
  assert.equal(leadLinkedInUrl("linkedin.com/in/jane-doe/?trk=foo"), "https://www.linkedin.com/in/jane-doe");
  assert.equal(leadLinkedInUrl("https://www.linkedin.com/in/jane-doe?trk=foo"), "https://www.linkedin.com/in/jane-doe");
  assert.equal(leadLinkedInUrl("https://linkedin.com/in/jane-doe/"), "https://www.linkedin.com/in/jane-doe");
  assert.equal(leadLinkedInUrl(""), "");
  for (const url of ["https://linkedin.com.evil.test/in/jane", "https://linkedin.com/company/freyr", "https://linkedin.com:444/in/jane", "javascript:alert(1)"]) {
    assert.equal(leadLinkedInUrl(url), null);
  }
});

test("stores only bounded profile facts and ignores empty or extra actor fields", () => {
  const profile = normalizeLeadLinkedInProfile({
    firstName: "Jane", lastName: "Doe", headline: "  Regulatory   Lead ",
    about: "x".repeat(9000), skills: ["FDA", { name: "EMA" }],
    experience: [{ title: "Director", company: "Example Pharma", secret: "drop me" }],
    recentPosts: [{ text: "Public update", url: "https://www.linkedin.com/feed/update/123", date: "2026-09-22" }, { text: "bad", url: "https://evil.example/post" }],
    extra: "drop me",
  }, "2026-09-23T12:00:00.000Z");
  assert.equal(profile?.fullName, "Jane Doe");
  assert.equal(profile?.headline, "Regulatory Lead");
  assert.equal(profile?.about.length, 8000);
  assert.deepEqual(profile?.skills, ["FDA", "EMA"]);
  assert.deepEqual(profile?.experience[0], { title: "Director", company: "Example Pharma", duration: "", description: "" });
  assert.deepEqual(profile?.recentPosts, [{ text: "Public update", url: "https://www.linkedin.com/feed/update/123", date: "2026-09-22T00:00:00.000Z" }]);
  assert.equal((profile as Record<string, unknown>)?.extra, undefined);
  assert.equal(normalizeLeadLinkedInProfile({}), null);
});

test("normalizes the working public-profile provider's nested facts", () => {
  const profile = normalizeLeadLinkedInProfile({
    basic_info: {
      fullname: "Eric Kelly",
      headline: "Regulatory affairs leader",
      about: "Public bio",
      location: { full: "Boston, Massachusetts, United States" },
      current_company: { name: "Takeda" },
      top_skills: ["Regulatory Affairs"],
    },
    experience: [{ title: "Director", company: "Takeda" }],
    education: [{ school: "Example University", degree: "MS" }],
  });
  assert.equal(profile?.fullName, "Eric Kelly");
  assert.equal(profile?.currentCompany, "Takeda");
  assert.equal(profile?.location, "Boston, Massachusetts, United States");
  assert.deepEqual(profile?.skills, ["Regulatory Affairs"]);
});

test("keeps the provider's professional details and numeric post timestamps", () => {
  const profile = normalizeLeadLinkedInProfile({
    basic_info: { fullname: "Albert Bourla", current_company: { name: "Pfizer" }, follower_count: 1200000, connection_count: "500" },
    experience: [{ title: "CEO", company: "Pfizer", duration: "2019–present" }],
    education: [{ school: "Example University", degree: "PhD", field_of_study: "Medicine", duration: "1980–1985" }],
    honors: [{ title: "Industry recognition", subtitle: "Example organization" }],
    organizations: [{ title: "Board member", subtitle: "Example institute" }],
    recentPosts: [{ text: "Public update", url: "https://www.linkedin.com/feed/update/123", posted_at: { timestamp: 1790255295630 }, stats: { total_reactions: 343, comments: 10, reposts: 19 }, post_type: "video" }],
  });
  assert.equal(profile?.currentTitle, "CEO");
  assert.equal(profile?.followerCount, 1200000);
  assert.equal(profile?.connectionCount, 500);
  assert.deepEqual(profile?.education[0], { school: "Example University", degree: "PhD", fieldOfStudy: "Medicine", duration: "1980–1985" });
  assert.deepEqual(profile?.honors, [{ title: "Industry recognition", subtitle: "Example organization" }]);
  assert.deepEqual(profile?.organizations, [{ title: "Board member", subtitle: "Example institute" }]);
  assert.deepEqual(profile?.recentPosts[0], { text: "Public update", url: "https://www.linkedin.com/feed/update/123", date: new Date(1790255295630).toISOString(), reactions: 343, comments: 10, reposts: 19, type: "video" });
  assert.equal(leadLinkedInPostDate({ timestamp: 1790255295630 }), new Date(1790255295630).toISOString());
});
