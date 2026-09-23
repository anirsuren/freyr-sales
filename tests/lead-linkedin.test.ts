import { strict as assert } from "node:assert";
import { test } from "node:test";
import { leadLinkedInUrl, normalizeLeadLinkedInProfile } from "../lib/leadLinkedIn";

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
    about: "x".repeat(4000), skills: ["FDA", { name: "EMA" }],
    experience: [{ title: "Director", company: "Example Pharma", secret: "drop me" }],
    recentPosts: [{ text: "Public update", url: "https://www.linkedin.com/feed/update/123", date: "2026-09-22" }, { text: "bad", url: "https://evil.example/post" }],
    extra: "drop me",
  }, "2026-09-23T12:00:00.000Z");
  assert.equal(profile?.fullName, "Jane Doe");
  assert.equal(profile?.headline, "Regulatory Lead");
  assert.equal(profile?.about.length, 3000);
  assert.deepEqual(profile?.skills, ["FDA", "EMA"]);
  assert.deepEqual(profile?.experience[0], { title: "Director", company: "Example Pharma", duration: "", description: "" });
  assert.deepEqual(profile?.recentPosts, [{ text: "Public update", url: "https://www.linkedin.com/feed/update/123", date: "2026-09-22" }]);
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
