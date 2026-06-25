import { test, expect } from "@playwright/test";
import { readFile } from "fs/promises";

// App runs on :3001 here (:3000 was occupied by another project).
const BASE = "http://localhost:3001";

test.describe("Freyr Sales Intelligence Platform — Full Verification", () => {
  test("01 — root redirects to dashboard", async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveURL(/dashboard/);
  });

  test("02 — dashboard loads with mock data", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto(`${BASE}/dashboard`);
    await expect(page.locator("text=Active Leads")).toBeVisible();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    await expect(page.locator("text=New Session")).toBeVisible();
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(errors.filter((e) => !e.includes("favicon"))).toHaveLength(0);
  });

  test("03 — sidebar navigation renders and highlights active item", async ({
    page,
  }) => {
    await page.goto(`${BASE}/dashboard`);
    await expect(page.locator("nav")).toBeVisible();
    await page.click("nav >> text=Customers");
    await expect(page).toHaveURL(/customers/);
    await page.click("nav >> text=Pipeline");
    await expect(page).toHaveURL(/pipeline/);
  });

  test("04 — intake form renders all required fields", async ({ page }) => {
    await page.goto(`${BASE}/intake`);
    await expect(
      page.locator('input[name="companyName"], input[placeholder*="company" i]')
    ).toBeVisible();
    await expect(
      page.locator(
        'input[name="contactName"], input[placeholder*="contact name" i], input[placeholder*="full name" i]'
      )
    ).toBeVisible();
    await expect(
      page.locator('input[name="contactEmail"], input[type="email"]')
    ).toBeVisible();
    await expect(
      page.locator('input[name="linkedinUrl"], input[placeholder*="linkedin" i]')
    ).toBeVisible();
    await expect(
      page.locator('button:has-text("Generate Pitch")')
    ).toBeVisible();
  });

  test("05 — intake form submits and shows loading progress page", async ({
    page,
  }) => {
    await page.goto(`${BASE}/intake`);
    // Throwaway data — avoids mutating the seeded BioNex/Mehta fixtures that
    // the seed-based tests (06/10/11/17) rely on being singular.
    await page.fill(
      'input[placeholder*="company" i], input[name="companyName"]',
      "Acme Biotech"
    );
    await page.fill(
      'input[placeholder*="website" i], input[name="websiteUrl"]',
      "https://acme-bio.example"
    );
    await page.fill(
      'input[placeholder*="full name" i], input[name="contactName"]',
      "Jane Doe"
    );
    await page.fill(
      'input[type="email"], input[name="contactEmail"]',
      "jane@acme.example"
    );
    await page.fill(
      'input[placeholder*="linkedin" i], input[name="linkedinUrl"]',
      "https://linkedin.com/in/janedoe"
    );
    await page.click('button:has-text("Generate Pitch")');
    await expect(page).toHaveURL(/sessions\/.*loading|loading/, {
      timeout: 5000,
    });
    await expect(
      page
        .locator("text=/scraping|fetching|analyzing|matching|generating/i")
        .first()
    ).toBeVisible();
  });

  test("06 — session results page renders both columns", async ({ page }) => {
    await page.goto(`${BASE}/sessions/sess-001`);
    await expect(page.locator("text=BioNex Therapeutics").first()).toBeVisible();
    await expect(page.locator("text=Dr. Priya Mehta").first()).toBeVisible();
    await expect(page.locator("text=5-Min Script")).toBeVisible();
    await expect(page.locator("text=Intro Email")).toBeVisible();
    await expect(page.locator("text=Cold Call Script")).toBeVisible();
  });

  test("07 — pitch tabs switch content correctly", async ({ page }) => {
    await page.goto(`${BASE}/sessions/sess-001`);
    await page.click("text=Intro Email");
    await expect(page.locator("text=/subject/i").first()).toBeVisible();
    await page.click("text=Cold Call Script");
    await expect(
      page.locator("textarea, [contenteditable]").first()
    ).toBeVisible();
    await page.click("text=5-Min Script");
    await expect(
      page.locator("textarea, [contenteditable]").first()
    ).toBeVisible();
  });

  test("08 — copy button exists on each pitch tab", async ({ page }) => {
    await page.goto(`${BASE}/sessions/sess-001`);
    await expect(page.locator('button:has-text("Copy")')).toBeVisible();
    await page.click("text=Intro Email");
    await expect(page.locator('button:has-text("Copy")')).toBeVisible();
    await page.click("text=Cold Call Script");
    await expect(page.locator('button:has-text("Copy")')).toBeVisible();
  });

  test("09 — engagement rail logs an interaction", async ({ page }) => {
    await page.goto(`${BASE}/sessions/sess-001`);
    // Disposition dropdown (the select containing the outcome options) + Log Interaction
    const select = page.locator('select:has(option[value="interested"])').first();
    await expect(select).toBeVisible();
    await select.selectOption("interested");
    await expect(
      page.locator('button:has-text("Log Interaction")')
    ).toBeVisible();
  });

  test("10 — customers list page renders with cards", async ({ page }) => {
    await page.goto(`${BASE}/customers`);
    // list is paginated newest-first; search to surface a known seeded account
    await page.getByPlaceholder("Search customers…").fill("BioNex");
    await expect(page.locator("text=BioNex Therapeutics")).toBeVisible();
    await expect(page.locator("text=/mid|small|large/i").first()).toBeVisible();
    // top bar + page both expose a search input; assert at least one is present
    await expect(
      page.locator('input[placeholder*="search" i]').first()
    ).toBeVisible();
  });

  test("11 — customer detail page renders correctly", async ({ page }) => {
    await page.goto(`${BASE}/customers/cust-001`);
    await expect(page.locator("text=BioNex Therapeutics").first()).toBeVisible();
    await expect(page.locator("text=Dr. Priya Mehta").first()).toBeVisible();
    await expect(
      page.locator("text=/in.progress|interested|meeting/i").first()
    ).toBeVisible();
    await expect(page.locator('button:has-text("Re-enrich")')).toBeVisible();
  });

  test("12 — contact detail page renders correctly", async ({ page }) => {
    await page.goto(`${BASE}/contacts/cont-001`);
    await expect(page.locator("text=Dr. Priya Mehta")).toBeVisible();
    await expect(page.locator("text=VP Regulatory Affairs").first()).toBeVisible();
    // skills chips render (e.g. "Regulatory Strategy")
    await expect(page.getByText("Regulatory Strategy").first()).toBeVisible();
  });

  test("13 — admin page shows KB status and re-crawl button", async ({
    page,
  }) => {
    await page.goto(`${BASE}/admin`);
    // heading scope avoids matching the sidebar "Knowledge Base" nav item
    await expect(
      page.getByRole("heading", { name: /knowledge base/i })
    ).toBeVisible();
    // getByRole with a regex name — :has-text(/regex/) is not valid CSS
    await expect(
      page.getByRole("button", { name: /re-?crawl/i })
    ).toBeVisible();
    await expect(
      page.locator("text=/api key|configured/i").first()
    ).toBeVisible();
  });

  test("14 — design spec: primary blue is #0071E3 not default Tailwind blue", async ({
    page,
  }) => {
    await page.goto(`${BASE}/dashboard`);
    const btn = page.locator('button:has-text("New Session")').first();
    await expect(btn).toBeVisible();
    const bgColor = await btn.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    );
    expect(bgColor).toBe("rgb(0, 113, 227)");
  });

  test("15 — design spec: page background is white not gray", async ({
    page,
  }) => {
    await page.goto(`${BASE}/dashboard`);
    const body = page.locator("body");
    const bg = await body.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    );
    expect(bg).toBe("rgb(255, 255, 255)");
  });

  test("16 — no console errors on any main page", async ({ page }) => {
    const pages = ["/dashboard", "/intake", "/customers", "/admin"];
    for (const path of pages) {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(`${path}: ${msg.text()}`);
      });
      await page.goto(`${BASE}${path}`);
      await page.waitForLoadState("networkidle");
      const realErrors = errors.filter(
        (e) => !e.includes("favicon") && !e.includes("404")
      );
      expect(realErrors, `Console errors on ${path}`).toHaveLength(0);
      page.removeAllListeners("console");
    }
  });

  test("17 — mock session exists and is accessible via direct URL", async ({
    page,
  }) => {
    await page.goto(`${BASE}/sessions/sess-001`);
    await expect(page).not.toHaveURL(/404|error/);
    await expect(page.locator("text=BioNex Therapeutics").first()).toBeVisible();
  });

  test("18 — loading page shows step progression with mock pipeline", async ({
    page,
  }) => {
    await page.goto(`${BASE}/sessions/sess-001/loading`);
    await expect(page.locator("text=/website/i").first()).toBeVisible();
    await expect(page.locator("text=/linkedin/i").first()).toBeVisible();
    await expect(page.locator("text=/analyz/i").first()).toBeVisible();
    await expect(page.locator("text=/match/i").first()).toBeVisible();
    await expect(page.locator("text=/generat/i").first()).toBeVisible();
  });

  // ---- Enterprise polish-pass conformance ----

  test("19 — consistent app shell: 240px sidebar + top bar on every page", async ({
    page,
  }) => {
    for (const path of ["/dashboard", "/customers", "/admin"]) {
      await page.goto(`${BASE}${path}`);
      const navW = await page
        .locator("nav")
        .first()
        .evaluate((el) => Math.round(el.getBoundingClientRect().width));
      // ~240px (allow sub-pixel rounding)
      expect(Math.abs(navW - 240)).toBeLessThanOrEqual(2);
      await expect(page.locator("header")).toBeVisible();
    }
  });

  test("20 — no warm/pink/lavender background tint on dashboard", async ({
    page,
  }) => {
    await page.goto(`${BASE}/dashboard`);
    const pink = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll("*").forEach((el) => {
        const b = getComputedStyle(el as Element).backgroundColor;
        const m = b.match(/(\d+), (\d+), (\d+)/);
        if (!m) return;
        const r = +m[1],
          g = +m[2],
          bl = +m[3];
        // warm/purple = red and blue both meaningfully above green
        if (r > g + 3 && bl > g + 3) out.push(b);
      });
      return out;
    });
    expect(pink).toHaveLength(0);
  });

  test("21 — inputs show a blue focus ring", async ({ page }) => {
    await page.goto(`${BASE}/intake`);
    const input = page.locator('input[name="companyName"]');
    await input.focus();
    // box-shadow animates in over 150ms — let it settle before reading
    await page.waitForTimeout(300);
    const shadow = await input.evaluate(
      (el) => getComputedStyle(el).boxShadow
    );
    expect(shadow).toContain("0, 113, 227");
  });

  test("22 — table rows stay compact and badges never wrap", async ({
    page,
  }) => {
    await page.goto(`${BASE}/dashboard`);
    const row = page.locator("table tbody tr").first();
    const h = await row.evaluate((el) =>
      Math.round(el.getBoundingClientRect().height)
    );
    // avatar + two-line-contact rows are roomier than a plain text table
    expect(h).toBeLessThanOrEqual(96);
    const badge = row.locator("span.inline-flex").first();
    if (await badge.count()) {
      const bh = await badge.evaluate((el) =>
        Math.round(el.getBoundingClientRect().height)
      );
      expect(bh).toBeLessThanOrEqual(26);
    }
  });

  test("23 — pipeline board renders stages and deals", async ({ page }) => {
    await page.goto(`${BASE}/pipeline`);
    await expect(page.locator("text=Qualified").first()).toBeVisible();
    await expect(page.locator("text=Meeting Booked").first()).toBeVisible();
    // a seeded deal card
    await expect(page.locator("text=Cortexa Biopharma").first()).toBeVisible();
  });

  test("24 — dashboard analytics toggle shows charts", async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.getByRole("button", { name: /analytics/i }).click();
    await expect(page.locator("text=Conversion Funnel")).toBeVisible();
    await expect(page.locator("text=Pipeline by Stage")).toBeVisible();
    await page.getByRole("button", { name: /overview/i }).click();
    await expect(page.locator("text=Active Leads")).toBeVisible();
  });

  test("25 — global search API returns records", async ({ request }) => {
    const res = await request.get(`${BASE}/api/search?q=bionex`);
    const data = await res.json();
    expect(data.results.length).toBeGreaterThan(0);
    expect(
      data.results.some((r: any) => /bionex/i.test(r.label))
    ).toBeTruthy();
  });

  test("26 — recordings workspace + call coach renders", async ({ page }) => {
    await page.goto(`${BASE}/recordings`);
    await expect(page.getByText("Call Coach")).toBeVisible();
    await expect(page.getByText("Key Moments")).toBeVisible();
    await expect(page.getByText("BioNex Therapeutics").first()).toBeVisible();
    await page.getByRole("tab", { name: "Quality", exact: true }).click();
    await expect(page.getByText("Call quality")).toBeVisible();
  });

  test("27 — analytics page renders charts + leaderboard", async ({ page }) => {
    await page.goto(`${BASE}/analytics`);
    await expect(page.getByText("Pipeline growth")).toBeVisible();
    await expect(page.getByText("Conversion Funnel")).toBeVisible();
    await expect(page.getByText("Rep performance")).toBeVisible();
  });

  test("28 — Analytics in the sidebar; Recordings in the account menu", async ({
    page,
  }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.click("nav >> text=Analytics");
    await expect(page).toHaveURL(/analytics/);
    // Recordings moved off the main nav into the top-right account menu.
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Recordings" }).click();
    await expect(page).toHaveURL(/recordings/);
  });

  test("29 — deal detail page renders with stage, value, KB version", async ({
    page,
  }) => {
    await page.goto(`${BASE}/deals/sess-001`);
    await expect(
      page.getByRole("heading", { name: "BioNex Therapeutics" })
    ).toBeVisible();
    await expect(page.getByText("Recommended Services")).toBeVisible();
    await expect(page.getByText(/KB v\d/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Open full session/ })
    ).toBeVisible();
  });

  test("30 — pitch workspace: objections + account-brief tabs, save/export", async ({
    page,
  }) => {
    await page.goto(`${BASE}/sessions/sess-001`);
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export", exact: true })).toBeVisible();
    await page.click("text=Objections");
    await expect(page.getByText(/already have a regulatory vendor/i)).toBeVisible();
    await page.click("text=Account Brief");
    await expect(page.getByText("Industry").first()).toBeVisible();
  });

  test("31 — service catalog: searchable + who-it's-for + add", async ({
    page,
  }) => {
    await page.goto(`${BASE}/services`);
    await expect(
      page.locator('input[placeholder*="Search services" i]')
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Add service/ })).toBeVisible();
    await page.fill('input[placeholder*="Search services" i]', "labeling");
    await expect(page.getByText(/Labeling/).first()).toBeVisible();
  });

  test("32 — admin shows crawled pages list", async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await expect(page.getByText(/Crawled Pages/)).toBeVisible();
  });

  test("33 — settings tabs: profile, team, notifications, integrations", async ({
    page,
  }) => {
    await page.goto(`${BASE}/settings`);
    const main = page.locator("main");
    await expect(
      main.getByRole("button", { name: "Save profile" })
    ).toBeVisible();
    await main.getByRole("tab", { name: "Team", exact: true }).click();
    await expect(page.getByText("Mark Miller")).toBeVisible();
    await main.getByRole("tab", { name: "Notifications", exact: true }).click();
    await expect(page.getByRole("switch").first()).toBeVisible();
    await main.getByRole("tab", { name: "Integrations", exact: true }).click();
    await expect(page.getByText(/Anthropic/).first()).toBeVisible();
  });

  test("34 — per-route page titles", async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await expect(page).toHaveTitle(/Dashboard/);
    await page.goto(`${BASE}/pipeline`);
    await expect(page).toHaveTitle(/Pipeline/);
  });

  test("35 — confirm modal guards a destructive delete", async ({ page }) => {
    await page.goto(`${BASE}/services`);
    await page.getByRole("button", { name: "Delete service" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/will be removed/i)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("36 — contact detail: quick actions, persona, multi-thread", async ({
    page,
  }) => {
    await page.goto(`${BASE}/contacts/cont-001`);
    await expect(page.getByRole("link", { name: /LinkedIn/ })).toBeVisible();
    await expect(page.getByText("How to engage")).toBeVisible();
    await expect(page.getByText("Buying style", { exact: true })).toBeVisible();
    await expect(page.getByText("Multi-thread map")).toBeVisible();
  });

  test("37 — dashboard date-range selector scopes the view", async ({
    page,
  }) => {
    await page.goto(`${BASE}/dashboard`);
    const main = page.locator("main");
    await expect(
      main.getByRole("button", { name: "30D", exact: true })
    ).toBeVisible();
    await main.getByRole("button", { name: "30D", exact: true }).click();
    await expect(page).toHaveURL(/range=30d/);
    await expect(
      main.getByRole("button", { name: "7D", exact: true })
    ).toBeVisible();
  });

  test("38 — dashboard pipeline chart shows a quota line", async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await expect(page.getByText("Quota", { exact: true })).toBeVisible();
  });

  test("39 — global New menu offers session / customer / contact", async ({
    page,
  }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.getByRole("button", { name: "Create new" }).click();
    await expect(
      page.getByRole("menuitem", { name: /Sales session/ })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /Contact/ })
    ).toBeVisible();
  });

  test("40 — pipeline: add a deal manually from the board", async ({
    page,
  }) => {
    await page.goto(`${BASE}/pipeline`);
    await page.getByRole("button", { name: "Add deal" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByPlaceholder("e.g. Northwind Bio").fill("Zephyr Genomics");
    await page.getByRole("button", { name: "Add to board" }).click();
    await expect(
      page.getByText("Zephyr Genomics", { exact: true })
    ).toBeVisible();
  });

  test("41 — pipeline: inline-edit a deal value", async ({ page }) => {
    await page.goto(`${BASE}/pipeline`);
    await page.getByRole("button", { name: "Edit deal value" }).first().click();
    const input = page.getByRole("textbox", { name: "Deal value" });
    await input.fill("999000");
    await input.press("Enter");
    await expect(page.getByText("$999K").first()).toBeVisible();
  });

  test("42 — pipeline: bulk select + move cards", async ({ page }) => {
    await page.goto(`${BASE}/pipeline`);
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page.getByRole("button", { name: "Select deal" }).first().click();
    await expect(page.getByText(/deal.* selected/)).toBeVisible();
    await expect(page.getByLabel("Bulk move stage")).toBeVisible();
    await page.getByRole("button", { name: "Move", exact: true }).click();
  });

  test("43 — dashboard period-over-period comparison toggle", async ({
    page,
  }) => {
    await page.goto(`${BASE}/dashboard?range=30d`);
    const t = page.getByRole("button", { name: "vs prev 30d" });
    await expect(t).toBeVisible();
    await expect(t).toHaveAttribute("aria-pressed", "true");
    await t.click();
    await expect(t).toHaveAttribute("aria-pressed", "false");
  });

  test("44 — dashboard: customize which KPIs show", async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.getByRole("button", { name: "Customize" }).click();
    await expect(
      page.getByRole("menu", { name: "Customize KPIs" })
    ).toBeVisible();
    const item = page.getByRole("menuitemcheckbox", { name: "Win Rate" });
    await expect(item).toHaveAttribute("aria-checked", "true");
    await item.click();
    await expect(item).toHaveAttribute("aria-checked", "false");
  });

  test("45 — dashboard: weekly digest preview modal", async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.getByRole("button", { name: "Digest" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/every Monday/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Send now" })).toBeVisible();
  });

  test("46 — account: assign owner + set competitor", async ({ page }) => {
    await page.goto(`${BASE}/customers/cust-001`);
    const owner = page.getByLabel("Account owner");
    await expect(owner).toBeVisible();
    await owner.selectOption("Mark Miller");
    await expect(owner).toHaveValue("Mark Miller");
    await page.getByRole("button", { name: "Edit competitor" }).click();
    const comp = page.getByLabel("Competitor", { exact: true });
    await comp.fill("Veeva");
    await page.getByRole("button", { name: "Save competitor" }).click();
    await expect(page.getByText("Veeva")).toBeVisible();
  });

  test("47 — account: add a note", async ({ page }) => {
    await page.goto(`${BASE}/customers/cust-001`);
    await page.locator("main").getByRole("tab", { name: "Notes" }).click();
    const text = `QBR scheduled ${Date.now()}`;
    await page.getByPlaceholder(/Log a call summary/).fill(text);
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText(text)).toBeVisible();
  });

  test("48 — customers list: pagination + total count", async ({ page }) => {
    await page.goto(`${BASE}/customers`);
    await expect(page.getByText(/of \d+ accounts/)).toBeVisible();
    const next = page.getByRole("button", { name: "Next" });
    await expect(next).toBeVisible();
    await next.click();
    await expect(page.getByText(/Page 2 of/)).toBeVisible();
  });

  test("49 — session: send to CRM / push to sequence (after approval)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/sessions/sess-001`);
    // compliance gate (#7): ensure approved regardless of current review state
    const submit = page.getByRole("button", { name: "Submit for review" });
    if (await submit.count()) {
      await submit.click();
      await page.getByRole("button", { name: "Approve" }).click();
    } else if (await page.getByRole("button", { name: "Approve" }).count()) {
      await page.getByRole("button", { name: "Approve" }).click();
    }
    await expect(page.getByText("Approved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Send to CRM" }).click();
    await expect(page.getByRole("menuitem", { name: "HubSpot" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Push to sequence" }).click();
    // assert the toast specifically (timeline entries also read "Pushed to …")
    await expect(
      page.getByText("Pushed to Outreach sequence", { exact: true })
    ).toBeVisible();
  });

  test("50 — session: pitch version history modal", async ({ page }) => {
    await page.goto(`${BASE}/sessions/sess-001`);
    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Pitch version history")).toBeVisible();
    await expect(
      page.getByText(/First generated|Saved edit|Regenerated/).first()
    ).toBeVisible();
  });

  test("51 — session: duplicate creates a new session", async ({ page }) => {
    await page.goto(`${BASE}/sessions/sess-001`);
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Duplicate session" }).click();
    await page.waitForURL(/\/sessions\/(?!sess-001)[\w-]+/);
    await expect(page).toHaveURL(/\/sessions\//);
  });

  test("52 — recordings: talk-to-listen ratio meter", async ({ page }) => {
    await page.goto(`${BASE}/recordings`);
    await expect(page.getByText("Talk ratio")).toBeVisible();
    await expect(page.getByText("Rep talking")).toBeVisible();
    await expect(page.getByText("Prospect talking")).toBeVisible();
  });

  test("53 — recordings: pin a timestamped coaching comment", async ({
    page,
  }) => {
    await page.goto(`${BASE}/recordings`);
    await page.getByRole("tab", { name: "Comments", exact: true }).click();
    const text = `Strong rapport ${Date.now()}`;
    await page.getByPlaceholder(/Great discovery question/).fill(text);
    await page.getByRole("button", { name: /Pin at/ }).click();
    await expect(page.getByText(text)).toBeVisible();
  });

  test("54 — recordings: upload / connect dialer modal", async ({ page }) => {
    await page.goto(`${BASE}/recordings`);
    await page.getByRole("button", { name: "Add recording" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Upload an audio file")).toBeVisible();
    await expect(page.getByRole("button", { name: "Aircall" })).toBeVisible();
  });

  test("55 — intake: auto-detect company + contact from URLs", async ({
    page,
  }) => {
    await page.goto(`${BASE}/intake`);
    await page.locator('input[name="websiteUrl"]').fill("https://acme-bio.com");
    await expect(page.locator('input[name="companyName"]')).toHaveValue("Acme Bio");
    await page
      .locator('input[name="linkedinUrl"]')
      .fill("https://linkedin.com/in/jane-doe");
    await expect(page.locator('input[name="contactName"]')).toHaveValue("Jane Doe");
  });

  test("56 — intake: recent prospects prefill the form", async ({ page }) => {
    await page.goto(`${BASE}/intake`);
    await expect(page.getByText("Recent prospects")).toBeVisible();
    await page.getByRole("button", { name: /Helix Biologics/ }).click();
    await expect(page.locator('input[name="companyName"]')).toHaveValue(
      "Helix Biologics"
    );
  });

  test("57 — intake: bulk paste-a-list queue", async ({ page }) => {
    await page.goto(`${BASE}/intake`);
    await page.getByRole("button", { name: "Paste a list" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByPlaceholder(/Acme Biotech, Jane Doe/)
      .fill("Acme Bio, Jane Doe, jane@acme.com\nZephyr Labs, Sam Lee, sam@zephyr.com");
    await expect(page.getByText(/2 prospects detected/)).toBeVisible();
    await page.getByRole("button", { name: /Add 2 to queue/ }).click();
    await expect(page.getByText(/Queued 2/)).toBeVisible();
  });

  test("58 — pipeline: team vs my-deals view switch", async ({ page }) => {
    await page.goto(`${BASE}/pipeline`);
    const myBtn = page.getByRole("button", { name: "My deals" });
    const teamBtn = page.getByRole("button", { name: "Team", exact: true });
    await expect(myBtn).toBeVisible();
    await myBtn.click();
    await expect(myBtn).toHaveAttribute("aria-pressed", "true");
    await teamBtn.click();
    await expect(teamBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("59 — pipeline: WIP limit + column reorder", async ({ page }) => {
    await page.goto(`${BASE}/pipeline`);
    const limit = page.getByLabel("WIP limit for Prospect");
    await expect(limit).toBeVisible();
    await limit.fill("3");
    await expect(limit).toHaveValue("3");
    // Prospect starts first (move-left disabled); moving right enables it
    const left = page.getByRole("button", { name: "Move Prospect left" });
    await expect(left).toBeDisabled();
    await page.getByRole("button", { name: "Move Prospect right" }).click();
    await expect(left).toBeEnabled();
  });

  test("60 — sidebar collapse persists across reload", async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(
      page.getByRole("button", { name: "Expand sidebar" })
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Expand sidebar" })
    ).toBeVisible();
  });

  test("61 — account: multiple deals per account + add deal", async ({
    page,
  }) => {
    await page.goto(`${BASE}/customers/cust-001`);
    await page.locator("main").getByRole("tab", { name: "Deals", exact: true }).click();
    await page.getByRole("button", { name: "New deal" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const name = `Renewal ${Date.now()}`;
    await page.getByPlaceholder(/EU MDR remediation/).fill(name);
    await page.getByRole("button", { name: "Add deal" }).click();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  });

  test("62 — account: re-enrich shows a diff", async ({ page }) => {
    await page.goto(`${BASE}/customers/cust-001`);
    await page.getByRole("button", { name: "Re-enrich" }).click();
    await expect(page.getByText("Re-enrichment complete")).toBeVisible();
    await expect(page.getByText("Employee count")).toBeVisible();
  });

  test("63 — settings: billing plan + usage + invoices", async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await page.locator("main").getByRole("tab", { name: "Billing", exact: true }).click();
    await expect(page.getByText("This month's usage")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Switch to Enterprise/ })
    ).toBeVisible();
  });

  test("64 — dark mode toggle themes the app and persists", async ({ page }) => {
    // Appearance control now lives in Settings (not on every screen's top bar).
    await page.goto(`${BASE}/settings`);
    // default is light
    const lightBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    expect(lightBg).toBe("rgb(255, 255, 255)");

    await page.getByRole("button", { name: "Toggle dark mode" }).click();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.classList.contains("dark"))
      )
      .toBe(true);
    const darkBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    expect(darkBg).not.toBe("rgb(255, 255, 255)");

    // persists across reload (no-flash head script re-applies it)
    await page.reload();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.classList.contains("dark"))
      )
      .toBe(true);
  });

  test("65 — a11y: skip link, main landmark, chart labels, tab roles", async ({
    page,
  }) => {
    await page.goto(`${BASE}/dashboard`);
    // bypass-blocks skip link + main landmark
    await expect(
      page.getByRole("link", { name: "Skip to content" })
    ).toHaveAttribute("href", "#main-content");
    await expect(page.locator("main#main-content")).toBeVisible();
    // charts expose an image role + textual summary to screen readers
    await expect(page.getByRole("img", { name: /chart/i }).first()).toBeVisible();
    // custom tab widget exposes proper ARIA roles
    await page.goto(`${BASE}/customers/cust-001`);
    await expect(
      page.getByRole("tablist", { name: "Account sections" })
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Overview" })
    ).toHaveAttribute("aria-selected", "true");
  });

  test("66 — global activity feed renders + filters", async ({ page }) => {
    await page.goto(`${BASE}/activity`);
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
    await expect(
      page.locator('input[placeholder*="Search activity" i]')
    ).toBeVisible();
    await expect(page.getByText(/\d+ events?/)).toBeVisible();
    // an outcome filter chip toggles
    const all = page.getByRole("button", { name: "All", exact: true });
    await expect(all).toBeVisible();
    await all.click();
  });

  test("67 — keyboard shortcuts help modal", async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/Open command palette/)).toBeVisible();
  });

  test("68 — compliance approval gates CRM send (V2)", async ({ page }) => {
    // start from a fresh duplicate so the review state is a clean "draft"
    await page.goto(`${BASE}/sessions/sess-001`);
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Duplicate session" }).click();
    await page.waitForURL(/\/sessions\/(?!sess-001)[\w-]+/);

    // draft → trying to send is blocked
    await page.getByRole("button", { name: "Send to CRM" }).click();
    await page.getByRole("menuitem", { name: "HubSpot" }).click();
    await expect(
      page.getByText("Needs compliance approval before sending")
    ).toBeVisible();

    // submit → approve → now it can send
    await page.getByRole("button", { name: "Submit for review" }).click();
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Send to CRM" }).click();
    await page.getByRole("menuitem", { name: "HubSpot" }).click();
    await expect(
      page.getByText("Pushed to HubSpot", { exact: true })
    ).toBeVisible();
  });

  test("69 — tasks inbox renders", async ({ page }) => {
    await page.goto(`${BASE}/tasks`);
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
    await expect(page.getByText("Awaiting compliance review")).toBeVisible();
    await expect(page.getByText("Upcoming follow-ups")).toBeVisible();
  });

  test("70 — sequences cadence library + enrollments (V2)", async ({ page }) => {
    await page.goto(`${BASE}/sequences`);
    await expect(page.getByRole("heading", { name: "Sequences" })).toBeVisible();
    await expect(page.getByText("Accounts enrolled")).toBeVisible();
    // default cadence shows its first step
    await expect(
      page.getByText(/Intro email — submission-timeline angle/).first()
    ).toBeVisible();
    // switch cadence
    await page.getByRole("button", { name: /Re-engagement/ }).click();
    await expect(page.getByText(/Pattern-interrupt email/).first()).toBeVisible();
  });

  test("71 — settings: CRM two-way sync card (V2)", async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await page.locator("main").getByRole("tab", { name: "Integrations" }).click();
    await expect(page.getByText("CRM sync — HubSpot")).toBeVisible();
    await page.getByRole("button", { name: "Sync now" }).click();
    await expect(page.getByText(/CRM synced/)).toBeVisible();
  });

  test("72 — settings: roles + SSO access controls (V2)", async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await page.locator("main").getByRole("tab", { name: "Access" }).click();
    await expect(page.getByText("Role permissions")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "SSO & security" })
    ).toBeVisible();
    // switch to Rep, then the Team invite is enforced as disabled
    await page.getByRole("button", { name: "Rep", exact: true }).click();
    await page.locator("main").getByRole("tab", { name: "Team" }).click();
    await expect(page.getByRole("button", { name: "Invite" })).toBeDisabled();
  });

  test("73 — pipeline: saved views (V2)", async ({ page }) => {
    await page.goto(`${BASE}/pipeline`);
    await page.getByRole("button", { name: "Views" }).click();
    await expect(page.getByRole("menu", { name: "Saved views" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Large deals" }).click();
    // save the current filter set as a named view
    await page.getByRole("button", { name: "Views" }).click();
    await page.getByRole("button", { name: /Save current view/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByPlaceholder(/large biotech/).fill("Test View 123");
    await page.getByRole("button", { name: "Save view" }).click();
    // it now appears in the Views menu
    await page.getByRole("button", { name: "Views" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Test View 123" })
    ).toBeVisible();
  });

  test("74 — compose & send email, gated on approval (V3)", async ({ page }) => {
    // fresh duplicate = clean draft
    await page.goto(`${BASE}/sessions/sess-001`);
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Duplicate session" }).click();
    await page.waitForURL(/\/sessions\/(?!sess-001)[\w-]+/);

    // draft → send blocked by compliance gate
    await page.getByRole("button", { name: "Send email" }).click();
    await expect(
      page.getByText("Needs compliance approval before sending")
    ).toBeVisible();

    // approve, then compose + send with a template
    await page.getByRole("button", { name: "Submit for review" }).click();
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Send email" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("Email template").selectOption("intro");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText(/Email sent to/)).toBeVisible();
  });

  test("75 — printable account report (V3)", async ({ page }) => {
    await page.goto(`${BASE}/customers/cust-001/report`);
    await expect(page.getByText(/Account Report/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "BioNex Therapeutics" })
    ).toBeVisible();
    await expect(page.getByText(/Buying committee/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Print/ })).toBeVisible();
    // renders chrome-free (no app sidebar)
    await expect(page.locator('nav[aria-label="Primary"]')).toHaveCount(0);
  });

  test("76 — dashboard getting-started checklist (V3)", async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await expect(page.getByText("Get started with Freyr")).toBeVisible();
    await page
      .getByRole("button", { name: /Mark .*Run your first pitch session.* done/ })
      .click();
    await expect(page.getByText("1 of 5 complete")).toBeVisible();
    await page.getByRole("button", { name: "Dismiss getting started" }).click();
    await expect(page.getByText("Get started with Freyr")).toHaveCount(0);
  });

  test("77 — analytics: per-rep drill-down + date range (V3)", async ({ page }) => {
    await page.goto(`${BASE}/analytics`);
    await expect(page.getByText("Rep performance")).toBeVisible();
    // drill into a rep
    await page.getByRole("button", { name: /Mark Miller/ }).click();
    await expect(page.getByText("Deals by stage")).toBeVisible();
    // date range scopes via ?range=
    await page.getByRole("button", { name: "30D", exact: true }).click();
    await expect(page).toHaveURL(/range=30d/);
  });

  test("78 — responsive: mobile sidebar drawer (V3)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`${BASE}/dashboard`);
    // hamburger appears on mobile
    const menu = page.getByRole("button", { name: "Open navigation" });
    await expect(menu).toBeVisible();
    // sidebar nav is off-canvas until opened
    const nav = page.locator('nav[aria-label="Primary"]');
    await expect(nav).not.toBeInViewport();
    await menu.click();
    await expect(nav).toBeInViewport();
  });

  test("79 — notifications center: filter + mark all read (V4)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/notifications`);
    await expect(
      page.getByRole("heading", { name: "Notifications" })
    ).toBeVisible();
    await expect(
      page
        .getByText(
          /New buying signal|Follow-up due|Deal going cold|Pitch awaiting your approval/
        )
        .first()
    ).toBeVisible();
    await page.getByRole("button", { name: /unread/i }).click();
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(page.getByText("You're all caught up")).toBeVisible();
  });

  test("80 — bell opens real notifications + view all (V4)", async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.getByRole("button", { name: "Notifications" }).click();
    const viewAll = page.getByText("View all notifications");
    await expect(viewAll).toBeVisible();
    await viewAll.click();
    await expect(page).toHaveURL(/\/notifications/);
  });

  test("81 — mobile: session 3-pane collapses to the workspace (V4)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`${BASE}/sessions/sess-001`);
    // center pane stays usable
    await expect(page.getByRole("tab", { name: "5-Min Script" })).toBeVisible();
    // side rails are hidden on mobile
    await expect(
      page.getByRole("button", { name: "Log Interaction" })
    ).toBeHidden();
  });

  test("82 — contacts: bulk select + export selected (V4)", async ({ page }) => {
    await page.goto(`${BASE}/contacts`);
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page.getByRole("button", { name: /^Select / }).first().click();
    await expect(page.getByText(/\d+ selected/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Export selected" })
    ).toBeVisible();
  });

  test("83 — customers: bulk select + assign owner (V4)", async ({ page }) => {
    await page.goto(`${BASE}/customers`);
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page.getByRole("button", { name: /^Select / }).first().click();
    await expect(page.getByText(/\d+ selected/)).toBeVisible();
    await expect(page.getByLabel("Bulk assign owner")).toBeVisible();
    await page.getByRole("button", { name: "Assign", exact: true }).click();
    await expect(page.getByText(/Assigned \d+ account/)).toBeVisible();
  });

  test("84 — settings: email send channel listed (V4)", async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await page.locator("main").getByRole("tab", { name: "Integrations" }).click();
    await expect(page.getByText(/Email — Resend/)).toBeVisible();
  });

  test("85 — customers: account health column + sort (V5)", async ({ page }) => {
    await page.goto(`${BASE}/customers`);
    await page.getByRole("button", { name: "Table view" }).click();
    await expect(page.getByText("Health", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/(Healthy|Watch|At risk)\s*\d/).first()
    ).toBeVisible();
    // sort by health is available (2nd select; 1st is the health filter)
    await page.locator("main select").nth(1).selectOption("health");
    await expect(
      page.getByText(/(Healthy|Watch|At risk)\s*\d/).first()
    ).toBeVisible();
  });

  test("86 — account detail shows a health score (V5)", async ({ page }) => {
    await page.goto(`${BASE}/customers/cust-001`);
    await expect(page.getByText("Account health")).toBeVisible();
    await expect(
      page.getByText(/Healthy|Watch|At risk/).first()
    ).toBeVisible();
  });

  test("89 — account health trend + factor breakdown (V5)", async ({ page }) => {
    await page.goto(`${BASE}/customers/cust-001`);
    await expect(page.getByText("Account health")).toBeVisible();
    await expect(page.getByText("Why")).toBeVisible();
    await expect(page.getByText(/pts · 4 wk/)).toBeVisible();
  });

  test("87 — dashboard Needs-Attention is health-driven (V5)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/dashboard`);
    await expect(page.getByText("Needs Attention")).toBeVisible();
    await expect(page.getByText(/At risk|Watch/).first()).toBeVisible();
  });

  test("88 — customers: filter by health band (V5)", async ({ page }) => {
    await page.goto(`${BASE}/customers`);
    await page.getByRole("button", { name: "Table view" }).click();
    await page.getByLabel("Filter by health").selectOption("healthy");
    await expect(page.getByText(/Healthy\s*\d/).first()).toBeVisible();
    await expect(page.getByText(/of \d+ accounts/)).toBeVisible();
  });

  test("90 — forecast page: quota attainment + breakdowns (V6)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/forecast`);
    await expect(page.getByRole("heading", { name: "Forecast" })).toBeVisible();
    await expect(page.getByText("Commit (weighted)")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Quota attainment" })
    ).toBeVisible();
    await expect(page.getByText("By stage")).toBeVisible();
    await expect(page.getByText("By rep")).toBeVisible();
  });

  test("91 — pipeline deal-velocity insights strip (V6)", async ({ page }) => {
    await page.goto(`${BASE}/pipeline`);
    await expect(page.getByText("Weighted forecast")).toBeVisible();
    await expect(page.getByText("Avg idle")).toBeVisible();
    await expect(page.getByText("Stalled (14d+)")).toBeVisible();
  });

  test("92 — full search results page (V6)", async ({ page }) => {
    await page.goto(`${BASE}/search?q=bio`);
    await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();
    await expect(page.getByText("BioNex Therapeutics").first()).toBeVisible();
  });

  test("93 — recently-viewed populates after a visit (V6)", async ({ page }) => {
    await page.goto(`${BASE}/customers/cust-001`);
    await page.waitForTimeout(400); // let the visit tracker write localStorage
    await page.goto(`${BASE}/search`);
    await expect(page.getByText("Recently viewed")).toBeVisible();
    await expect(page.getByText("BioNex Therapeutics").first()).toBeVisible();
  });

  test("94 — AI agent console: next-best-actions + goal bar (V7)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent/plan`);
    await expect(
      page.getByRole("heading", { name: "Goals", exact: true })
    ).toBeVisible();
    await page
      .getByPlaceholder(/Tell the agent a goal/)
      .fill("Re-engage stalled accounts");
    await page.getByRole("button", { name: "Run agent" }).click();
    await expect(page.getByText(/Plan for/)).toBeVisible();
  });

  test("95 — agent 'draft it for me' one-click (V7)", async ({ page }) => {
    await page.goto(`${BASE}/agent/inbox`);
    const handle = page
      .getByRole("button", { name: /Draft it for me/ })
      .first();
    await expect(handle).toBeVisible();
    await handle.click();
    await expect(page.getByText(/Drafted —/)).toBeVisible();
  });

  test("96 — account detail shows agent section (V7)", async ({ page }) => {
    await page.goto(`${BASE}/customers/cust-002`);
    await expect(page.getByRole("button", { name: "Run a play" })).toBeVisible();
  });

  test("97 — agent run with compliance gate → approve → complete (V7)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/customers/cust-001`);
    await page.getByRole("button", { name: "Run a play" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // the run advances and pauses at the compliance gate
    const approve = page.getByRole("button", { name: "Approve & send" });
    await expect(approve).toBeVisible({ timeout: 8000 });
    await approve.click();
    await expect(page.getByText(/Agent play complete/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
  });

  test("98 — agent autopilot works the queue + reports (V7)", async ({ page }) => {
    await page.goto(`${BASE}/agent/inbox`);
    await expect(
      page.getByRole("button", { name: "Run autopilot" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Run autopilot" }).click();
    await expect(page.getByText(/Drafted \d+/)).toBeVisible();
    await expect(page.getByText(/Waiting on you \d+/)).toBeVisible();
  });

  test("99 — agent goal → visible plan (V8)", async ({ page }) => {
    await page.goto(`${BASE}/agent/plan`);
    await page
      .getByPlaceholder(/Tell the agent a goal/)
      .fill("Re-engage stalled accounts");
    await page.getByRole("button", { name: "Run agent" }).click();
    await expect(page.getByText(/Plan for/)).toBeVisible();
    await expect(
      page.getByText(/Find accounts with no activity/)
    ).toBeVisible();
  });

  test("100 — agent run history records each run with step detail (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent/plan`);
    await expect(page.getByText("Recent activity")).toBeVisible();
    // a persisted run is present; expanding it reveals its step timeline
    const runBtn = page
      .getByRole("button", {
        name: /Ran a full outreach play for Helix Biologics/,
      })
      .first();
    await expect(runBtn).toBeVisible();
    if ((await runBtn.getAttribute("aria-expanded")) !== "true") {
      await runBtn.click();
    }
    await expect(page.getByText("Researched the account").first()).toBeVisible();
    // running autopilot (from the inbox) records a new run that shows on the home
    await page.goto(`${BASE}/agent/inbox`);
    await page.getByRole("button", { name: "Run autopilot" }).click();
    await expect(page.getByText(/Drafted \d+/)).toBeVisible();
    await page.goto(`${BASE}/agent/plan`);
    await expect(
      page.getByText("Autopilot drafted your queue").first()
    ).toBeVisible();
  });

  test("101 — per-account 'ask the agent' chat (V8)", async ({ page }) => {
    await page.goto(`${BASE}/customers/cust-001`);
    await page.locator("main").getByRole("tab", { name: "Ask Agent" }).click();
    await expect(page.getByText("Ask the agent")).toBeVisible();
    await page
      .getByRole("button", { name: "How healthy is this account?" })
      .click();
    await expect(page.getByText(/\/100/).first()).toBeVisible();
  });

  test("102 — agent runs API returns persisted runs with steps (V9)", async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/api/agent/runs`);
    const data = await res.json();
    expect(Array.isArray(data.runs)).toBeTruthy();
    expect(data.runs.length).toBeGreaterThan(0);
    const run = data.runs[0];
    expect(run.kind).toBeTruthy();
    expect(Array.isArray(run.steps)).toBeTruthy();
    expect(run.steps.length).toBeGreaterThan(0);
    expect(run.steps[0].label).toBeTruthy();
  });

  test("103 — dashboard leads with agent next-best-actions (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/dashboard`);
    await expect(page.getByText("Your agent recommends")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Open Agent/ })
    ).toBeVisible();
  });

  test("104 — per-account agent run history + replay (V9)", async ({ page }) => {
    await page.goto(`${BASE}/customers/cust-004`);
    await expect(page.getByText("Recent agent runs")).toBeVisible();
    const runBtn = page
      .getByRole("button", {
        name: /Ran a full outreach play for Helix Biologics/,
      })
      .first();
    await expect(runBtn).toBeVisible();
    if ((await runBtn.getAttribute("aria-expanded")) !== "true") {
      await runBtn.click();
    }
    await page.getByRole("button", { name: "Run again" }).first().click();
    await expect(page.getByText(/Re-ran the play/)).toBeVisible();
  });

  test("105 — deal detail leads with an agent next-best-action (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/deals/sess-005`);
    await expect(
      page.getByText("Agent — next best action for this deal")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Run a play/ }).first()
    ).toBeVisible();
  });

  test("106 — undo reverts an auto-handled agent run (V9)", async ({ page }) => {
    await page.goto(`${BASE}/agent/inbox`);
    await page.getByRole("button", { name: "Run autopilot" }).click();
    await expect(page.getByText(/Drafted \d+/)).toBeVisible();
    // the run shows in the home's Recent activity, where it can be undone
    await page.goto(`${BASE}/agent/plan`);
    const apRun = page
      .getByRole("button", { name: /Autopilot drafted your queue/ })
      .first();
    await expect(apRun).toBeVisible();
    if ((await apRun.getAttribute("aria-expanded")) !== "true") {
      await apRun.click();
    }
    await page.getByRole("button", { name: "Undo" }).first().click();
    await expect(page.getByText(/Reverted/).first()).toBeVisible();
  });

  test("107 — agent goal templates expand into a plan (V9)", async ({ page }) => {
    await page.goto(`${BASE}/agent/plan`);
    await expect(page.getByText("Goal templates")).toBeVisible();
    await page
      .getByRole("button", { name: /Save my at-risk accounts/ })
      .click();
    await expect(page.getByText(/Plan for/)).toBeVisible();
    await expect(
      page.getByText(/at-risk accounts|recovery play|account health/i).first()
    ).toBeVisible();
  });

  test("108 — pipeline leads with an agent surface (V9)", async ({ page }) => {
    await page.goto(`${BASE}/pipeline`);
    // the agent banner always renders (cooling count or healthy)
    await expect(
      page.getByText(/cooling|Pipeline looks healthy/).first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Open Agent/ }).first()
    ).toBeVisible();
    // per-card re-engage hint is present when a deal is cooling; exercise it then
    const hint = page
      .getByRole("button", { name: "Agent: re-engage this deal" })
      .first();
    if (await hint.count()) {
      await hint.click();
      await expect(
        page.getByText(/drafted re-engagement/).first()
      ).toBeVisible();
    }
  });

  test("109 — goal plan is executable end to end (V9)", async ({ page }) => {
    await page.goto(`${BASE}/agent/plan`);
    // "Work the whole pipeline" always has work (handle and/or approve), so the
    // plan is genuinely executable regardless of what earlier tests consumed.
    await page
      .getByRole("button", { name: /Work the whole pipeline/ })
      .click();
    await expect(page.getByText(/Plan for/)).toBeVisible();
    await page.getByRole("button", { name: "Execute plan" }).click();
    await expect(page.getByText(/Done —/).first()).toBeVisible();
    // the executed plan is recorded as a run
    await page.reload();
    await expect(
      page.getByText(/Worked on:/).first()
    ).toBeVisible();
  });

  test("110 — contact detail surfaces an agent next-best-action (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/contacts/cont-001`);
    await expect(page.getByText("Agent recommends")).toBeVisible();
    await page
      .getByRole("button", { name: /Draft it for me/ })
      .first()
      .click();
    await expect(page.getByText(/Drafted/).first()).toBeVisible();
  });

  test("111 — agent inbox splits approval vs auto-handle (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent/inbox`);
    await expect(
      page.getByRole("heading", { name: "Needs your approval" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Agent will handle" })
    ).toBeVisible();
    await expect(
      page.getByText(/Approve the pitch|Send the approved/).first()
    ).toBeVisible();
  });

  test("112 — console links to the agent inbox (V9)", async ({ page }) => {
    await page.goto(`${BASE}/agent/plan`);
    const card = page.getByRole("link", { name: /waiting for your approval/ });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(/\/agent\/inbox/);
    await expect(
      page.getByRole("heading", { name: "Needs your approval" })
    ).toBeVisible();
  });

  test("113 — inbox bulk approve clears compliance in one pass (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent/inbox`);
    const approveBtn = page.getByRole("button", { name: /Approve all/ });
    if (await approveBtn.count()) {
      await approveBtn.click();
      await expect(page.getByText(/Approved \d+ pitch/)).toBeVisible();
    }
    // after approving, the cleared pitches become send-ready
    await expect(
      page.getByRole("button", { name: /Send all approved/ })
    ).toBeVisible();
  });

  test("114 — inbox bulk send delivers approved pitches (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent/inbox`);
    const sendBtn = page.getByRole("button", { name: /Send all approved/ });
    if (await sendBtn.count()) {
      await sendBtn.click();
      await expect(page.getByText(/Sent \d+ approved/)).toBeVisible();
    } else {
      // queue already clear — the empty state holds
      await expect(page.getByText("Nothing waiting on you")).toBeVisible();
    }
  });

  test("115 — agent enrolls accounts into a sequence (V9)", async ({ page }) => {
    await page.goto(`${BASE}/sequences`);
    // the agent banner offers to enroll stalled accounts not in a cadence
    const enrollBtn = page.getByRole("button", { name: /Enroll \d+/ });
    if (await enrollBtn.count()) {
      await enrollBtn.click();
      await expect(page.getByText(/Agent enrolled \d+ account/)).toBeVisible();
    }
    // the Re-engagement cadence shows agent-enrolled accounts (seeded + any new)
    await page.getByRole("button", { name: /Re-engagement/ }).click();
    await expect(
      page.getByText("Aether Medical Devices").first()
    ).toBeVisible();
  });

  test("116 — agent advances an enrolled account through the cadence (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/sequences`);
    await page.getByRole("button", { name: /Re-engagement/ }).click();
    // a managed enrollment exposes an "Advance" control
    const advanceBtn = page
      .getByRole("button", { name: "Advance", exact: true })
      .first();
    await expect(advanceBtn).toBeVisible();
    await advanceBtn.click();
    await expect(page.getByText(/advanced/i).first()).toBeVisible();
  });

  test("117 — agent runs a cadence end to end (enroll + advance) (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/sequences`);
    const runBtn = page.getByRole("button", { name: /Prep these steps/ });
    if (await runBtn.count()) {
      await runBtn.click();
      await expect(
        page.getByText(/enrolled \d+ · advanced \d+/i).first()
      ).toBeVisible();
    } else {
      // sequence already up to date
      await expect(page.getByText(/plan is up to date/i)).toBeVisible();
    }
  });

  test("118 — inbox keyboard triage approves with 'A' (V9)", async ({ page }) => {
    await page.goto(`${BASE}/agent/inbox`);
    if (await page.getByRole("button", { name: /Approve all/ }).count()) {
      await page.keyboard.press("a");
      await expect(page.getByText(/Approved \d+ pitch/)).toBeVisible();
    } else if (await page.getByRole("button", { name: /Send all/ }).count()) {
      await page.keyboard.press("s");
      await expect(page.getByText(/Sent \d+ approved/)).toBeVisible();
    } else {
      await expect(page.getByText("Nothing waiting on you")).toBeVisible();
    }
  });

  test("119 — ⌘K command palette exposes agent commands (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.getByRole("button", { name: /Search companies, contacts/ }).click();
    await expect(
      page.getByText("Run re-engagement cadence")
    ).toBeVisible();
    await page.getByRole("button", { name: "Open Agent Inbox" }).click();
    await expect(page).toHaveURL(/\/agent\/inbox/);
  });

  test("120 — palette goal deep-link auto-runs a plan (V9)", async ({ page }) => {
    await page.goto(`${BASE}/agent/plan?goal=${encodeURIComponent("Re-engage stalled accounts")}`);
    await expect(page.getByText(/Plan for/)).toBeVisible();
    await expect(
      page.getByText(/Find accounts with no activity/)
    ).toBeVisible();
  });

  test("121 — agent digest briefing on the console (V9)", async ({ page }) => {
    await page.goto(`${BASE}/agent/plan`);
    await expect(page.getByText("Agent digest")).toBeVisible();
    await expect(
      page.getByText(/I've run|haven't run anything/).first()
    ).toBeVisible();
    await expect(page.getByText("What needs you")).toBeVisible();
    await expect(page.getByText("Watch list")).toBeVisible();
  });

  test("122 — palette arrow-key nav + Enter runs the selected command (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.getByRole("button", { name: /Search companies, contacts/ }).click();
    await page.keyboard.type("agent inbox");
    await page.waitForTimeout(300);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/agent\/inbox/);
  });

  test("123 — agent preferences card persists a toggle (V9)", async ({ page }) => {
    await page.goto(`${BASE}/agent/settings`);
    await expect(page.getByText("Agent preferences")).toBeVisible();
    await page
      .getByRole("switch", { name: /stabilize at-risk/i })
      .click();
    await expect(page.getByText(/preferences saved/i)).toBeVisible();
  });

  test("124 — autopilot respects the focus-industry preference (V9)", async ({
    request,
  }) => {
    // an industry no account has → every action is out of focus and escalated
    await request.put(`${BASE}/api/agent/prefs`, {
      data: {
        focus_industry: "Aerospace",
        autopilot_reengage: true,
        autopilot_stabilize: true,
      },
    });
    const res = await request.post(`${BASE}/api/agent/autopilot`);
    const data = await res.json();
    expect(data.handled).toBe(0);
    expect(data.escalated).toBeGreaterThan(0);
    // reset so other surfaces see the default
    await request.put(`${BASE}/api/agent/prefs`, {
      data: { focus_industry: null },
    });
  });

  test("125 — focus-industry filters the whole recommendation queue (V9)", async ({
    request,
  }) => {
    // an industry no account has → the inbox queue empties everywhere
    await request.put(`${BASE}/api/agent/prefs`, {
      data: { focus_industry: "Aerospace" },
    });
    const data = await (await request.get(`${BASE}/api/agent/inbox`)).json();
    expect(data.needsApproval).toBe(0);
    expect(data.canHandle).toBe(0);
    await request.put(`${BASE}/api/agent/prefs`, {
      data: { focus_industry: null },
    });
  });

  test("126 — inbox shows the focus-industry lens (V9)", async ({ page }) => {
    await page.request.put(`${BASE}/api/agent/prefs`, {
      data: { focus_industry: "Pharmaceutical" },
    });
    await page.goto(`${BASE}/agent/inbox`);
    await expect(
      page.getByText(/Lens: Pharmaceutical/).first()
    ).toBeVisible();
    await page.request.put(`${BASE}/api/agent/prefs`, {
      data: { focus_industry: null },
    });
  });

  test("127 — 'my accounts' lens narrows the recommendation queue (V9)", async ({
    request,
  }) => {
    await request.put(`${BASE}/api/agent/prefs`, {
      data: { only_mine: false, focus_industry: null },
    });
    const all = await (await request.get(`${BASE}/api/agent/inbox`)).json();
    const allTotal = all.needsApproval + all.canHandle;
    await request.put(`${BASE}/api/agent/prefs`, { data: { only_mine: true } });
    const mine = await (await request.get(`${BASE}/api/agent/inbox`)).json();
    const mineTotal = mine.needsApproval + mine.canHandle;
    expect(mineTotal).toBeLessThanOrEqual(allTotal);
    if (allTotal > 1) expect(mineTotal).toBeLessThan(allTotal);
    await request.put(`${BASE}/api/agent/prefs`, { data: { only_mine: false } });
  });

  test("128 — agent preferences: 'my accounts' toggle persists (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent/settings`);
    await page
      .getByRole("switch", { name: /only act on my accounts/i })
      .click();
    await expect(page.getByText(/preferences saved/i)).toBeVisible();
    await page.request.put(`${BASE}/api/agent/prefs`, {
      data: { only_mine: false },
    });
  });

  test("129 — ask route answers grounded in context, key-ready (V9)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/ask`, {
      data: {
        question: "How healthy is this account?",
        context: {
          company: "BioNex Therapeutics",
          healthLabel: "Watch",
          healthScore: 62,
          openValue: "$120K",
          dealCount: 1,
          contactCount: 1,
          topAction: "Re-engage BioNex",
        },
      },
    });
    const data = await res.json();
    expect(data.answer).toMatch(/\/100/); // grounded in the score
    // mock fallback without a key; would be "claude" with ANTHROPIC_API_KEY
    expect(["mock", "claude"]).toContain(data.source);
  });

  test("130 — account chat is Claude-ready (V9)", async ({ page }) => {
    await page.goto(`${BASE}/customers/cust-001`);
    await page.locator("main").getByRole("tab", { name: "Ask Agent" }).click();
    await expect(
      page.getByText(/Powered by Claude when a key is set/i)
    ).toBeVisible();
    await page
      .getByRole("button", { name: "What should I do next?" })
      .click();
    // an answer arrives via the ask route (fallback or Claude)
    await expect(
      page.getByText(/next step|nurturing|no urgent/i).first()
    ).toBeVisible();
  });

  test("131 — plan-steps route drafts a plan, key-ready (V9)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/plan-steps`, {
      data: { goal: "Re-engage stalled accounts" },
    });
    const data = await res.json();
    expect(Array.isArray(data.steps)).toBeTruthy();
    expect(data.steps.length).toBeGreaterThan(1);
    expect(["mock", "claude"]).toContain(data.source);
  });

  test("132 — one-tap lens preset on the agent preferences (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent/settings`);
    await page.getByRole("button", { name: "My pharma" }).click();
    await expect(page.getByText(/preferences saved/i)).toBeVisible();
    // the inbox queue picks up the preset's lens
    await page.goto(`${BASE}/agent/inbox`);
    await expect(
      page.getByText(/Lens: Pharmaceutical · My accounts/).first()
    ).toBeVisible();
    // reset to the whole book
    await page.request.put(`${BASE}/api/agent/prefs`, {
      data: { focus_industry: null, only_mine: false },
    });
  });

  test("133 — agent home is framed as a human-led assistant (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent/plan`);
    // No internal jargon; clear that the human approves everything.
    await expect(
      page.getByText(/review and approve everything/i)
    ).toBeVisible();
    await expect(page.getByText(/Deterministic/)).toHaveCount(0);
  });

  test("134 — agent digest is sendable (key-ready narration) (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent/plan`);
    await page.getByRole("button", { name: /Send to me/ }).click();
    await expect(page.getByText(/Digest sent to you/i)).toBeVisible();
  });

  test("135 — agent draft route returns reviewable outreach (V9)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/draft`, {
      data: { customerId: "cust-001" },
    });
    const data = await res.json();
    expect(data.subject).toBeTruthy();
    expect(data.body.length).toBeGreaterThan(20);
    expect(["mock", "claude"]).toContain(data.source);
  });

  test("136 — the play shows the drafted email at the compliance gate (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/customers/cust-001`);
    await page.getByRole("button", { name: "Run a play" }).click();
    await expect(
      page.getByText("Drafted email — edit before it sends")
    ).toBeVisible({ timeout: 8000 });
    await expect(
      page.getByRole("button", { name: /Approve & send/ })
    ).toBeVisible();
  });

  test("137 — rep can edit the agent's draft before send (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/customers/cust-001`);
    await page.getByRole("button", { name: "Run a play" }).click();
    const subj = page.getByLabel("Draft subject");
    await expect(subj).toBeVisible({ timeout: 8000 });
    await subj.fill("Edited subject ABC123");
    await page.getByRole("button", { name: /Approve & send/ }).click();
    await expect(page.getByText(/Agent play complete/)).toBeVisible();
    // the recorded run reflects the rep-edited subject
    const data = await (
      await page.request.get(`${BASE}/api/agent/runs`)
    ).json();
    expect(JSON.stringify(data.runs)).toContain("Edited subject ABC123");
  });

  test("138 — top-right account menu opens with working links (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.getByRole("button", { name: "Account menu" }).click();
    const settings = page.getByRole("menuitem", { name: "Settings", exact: true });
    await expect(settings).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Agent settings" })
    ).toBeVisible();
    await settings.click();
    await expect(page).toHaveURL(/\/settings/);
  });

  test("139 — rewrite gives the rep a different draft (V9)", async ({ page }) => {
    await page.goto(`${BASE}/customers/cust-001`);
    await page.getByRole("button", { name: "Run a play" }).click();
    const subj = page.getByLabel("Draft subject");
    await expect(subj).toBeVisible({ timeout: 8000 });
    const first = await subj.inputValue();
    await page.getByRole("button", { name: /Rewrite/ }).click();
    await expect(subj).not.toHaveValue(first, { timeout: 8000 });
  });

  test("140 — draft variants are distinct (V9)", async ({ request }) => {
    const v0 = await (
      await request.post(`${BASE}/api/agent/draft`, {
        data: { customerId: "cust-001", variant: 0 },
      })
    ).json();
    const v1 = await (
      await request.post(`${BASE}/api/agent/draft`, {
        data: { customerId: "cust-001", variant: 1 },
      })
    ).json();
    expect(v1.subject).not.toBe(v0.subject);
    expect(v1.body).not.toBe(v0.body);
  });

  test("141 — draft tone changes the email (V9)", async ({ request }) => {
    const formal = await (
      await request.post(`${BASE}/api/agent/draft`, {
        data: { customerId: "cust-001", tone: "formal" },
      })
    ).json();
    const brief = await (
      await request.post(`${BASE}/api/agent/draft`, {
        data: { customerId: "cust-001", tone: "brief" },
      })
    ).json();
    expect(formal.body).not.toBe(brief.body);
    expect(formal.body).toMatch(/Dear|Kind regards/);
  });

  test("142 — tone chips restyle the draft in the play (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/customers/cust-001`);
    await page.getByRole("button", { name: "Run a play" }).click();
    const bodyEl = page.getByLabel("Draft body");
    await expect(bodyEl).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /^formal$/i }).click();
    await expect(bodyEl).toHaveValue(/Dear Priya|Kind regards/, {
      timeout: 8000,
    });
  });

  test("143 — default-tone preference drives the draft (V9)", async ({
    request,
  }) => {
    await request.put(`${BASE}/api/agent/prefs`, {
      data: { draft_tone: "formal" },
    });
    const d = await (
      await request.post(`${BASE}/api/agent/draft`, {
        data: { customerId: "cust-001" }, // no explicit tone → uses the pref
      })
    ).json();
    expect(d.tone).toBe("formal");
    expect(d.body).toMatch(/Dear|Kind regards/);
    await request.put(`${BASE}/api/agent/prefs`, {
      data: { draft_tone: "warm" },
    });
  });

  test("144 — default draft tone is settable in preferences (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent/settings`);
    await page.getByRole("button", { name: /^formal$/i }).click();
    await expect(page.getByText(/preferences saved/i)).toBeVisible();
    await page.request.put(`${BASE}/api/agent/prefs`, {
      data: { draft_tone: "warm" },
    });
  });

  test("145 — scheduled autopilot surfaces a due run + runs it (V9)", async ({
    page,
  }) => {
    await page.request.put(`${BASE}/api/agent/prefs`, {
      data: { autopilot_cadence: "daily", autopilot_last_run: null },
    });
    await page.goto(`${BASE}/agent/plan`);
    await expect(page.getByText(/autopilot run is due/i)).toBeVisible();
    await page.getByRole("button", { name: "Run now" }).click();
    await expect(page.getByText(/Scheduled autopilot ran/i)).toBeVisible();
    // last-run stamped → no longer due after refresh
    await expect(page.getByText(/autopilot run is due/i)).toHaveCount(0);
    await page.request.put(`${BASE}/api/agent/prefs`, {
      data: { autopilot_cadence: "off", autopilot_last_run: null },
    });
  });

  test("146 — autopilot schedule is settable in preferences (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent/settings`);
    await page.getByRole("button", { name: "Autopilot schedule daily" }).click();
    await expect(page.getByText(/preferences saved/i)).toBeVisible();
    await page.request.put(`${BASE}/api/agent/prefs`, {
      data: { autopilot_cadence: "off", autopilot_last_run: null },
    });
  });

  test("147 — scheduled digest surfaces a due briefing + sends it (V9)", async ({
    page,
  }) => {
    await page.request.put(`${BASE}/api/agent/prefs`, {
      data: { digest_cadence: "daily", digest_last_sent: null },
    });
    await page.goto(`${BASE}/agent/plan`);
    await expect(page.getByText(/digest is ready/i)).toBeVisible();
    await page
      .getByRole("button", { name: "Send to me" })
      .first()
      .click();
    await expect(page.getByText(/Digest sent to you/i)).toBeVisible();
    await page.request.put(`${BASE}/api/agent/prefs`, {
      data: { digest_cadence: "off", digest_last_sent: null },
    });
  });

  test("148 — digest schedule is settable in preferences (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent/settings`);
    await page.getByRole("button", { name: "Digest schedule weekly" }).click();
    await expect(page.getByText(/preferences saved/i)).toBeVisible();
    await page.request.put(`${BASE}/api/agent/prefs`, {
      data: { digest_cadence: "off", digest_last_sent: null },
    });
  });

  test("149 — draft snippet library API (list + create) (V9)", async ({
    request,
  }) => {
    const list = await (await request.get(`${BASE}/api/agent/snippets`)).json();
    expect(Array.isArray(list.snippets)).toBeTruthy();
    expect(list.snippets.length).toBeGreaterThan(0);
    const created = await (
      await request.post(`${BASE}/api/agent/snippets`, {
        data: { subject: "Test snippet", body: "Reusable body content." },
      })
    ).json();
    expect(created.ok).toBeTruthy();
    expect(created.snippet.title).toBeTruthy();
  });

  test("150 — save + insert a snippet in the play (V9)", async ({ page }) => {
    await page.goto(`${BASE}/customers/cust-001`);
    await page.getByRole("button", { name: "Run a play" }).click();
    const bodyEl = page.getByLabel("Draft body");
    await expect(bodyEl).toBeVisible({ timeout: 8000 });
    // save the current draft to the library
    await page.getByRole("button", { name: /Save as snippet/ }).click();
    await expect(page.getByText(/Saved to your snippet library/i)).toBeVisible();
    // insert the seeded snippet → the body changes
    const before = await bodyEl.inputValue();
    await page
      .getByLabel("Insert snippet")
      .selectOption({ label: "Submission-timeline intro" });
    await expect(bodyEl).not.toHaveValue(before, { timeout: 8000 });
  });

  test("152 — agent weekly review rolls up the week (V9)", async ({ page }) => {
    await page.goto(`${BASE}/agent/review`);
    await expect(
      page.getByRole("heading", { name: "Weekly review" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "What's at stake" })
    ).toBeVisible();
    await expect(
      page.getByText("Open at stake", { exact: true })
    ).toBeVisible();
    await expect(page.getByText("Agent actions")).toBeVisible();
  });

  test("153 — console links to the weekly review (V9)", async ({ page }) => {
    await page.goto(`${BASE}/agent/plan`);
    await page
      .getByRole("link", { name: /Weekly review/ })
      .click();
    await expect(page).toHaveURL(/\/agent\/review/);
  });

  test("151 — snippet library lists + deletes snippets (V9)", async ({
    page,
  }) => {
    // create a known snippet (title distinct from subject) for determinism
    await page.request.post(`${BASE}/api/agent/snippets`, {
      data: { title: "LibTest snippet", subject: "Lib subject", body: "x" },
    });
    await page.goto(`${BASE}/agent/settings`);
    await expect(
      page.getByRole("heading", { name: "Snippet library" })
    ).toBeVisible();
    const del = page
      .getByRole("button", { name: /Delete snippet LibTest snippet/ })
      .first();
    await expect(del).toBeVisible();
    await del.click();
    await expect(page.getByText(/Snippet deleted/i)).toBeVisible();
  });

  test("156 — per-account agent chat persists (API) (V9)", async ({
    request,
  }) => {
    const cid = "cust-005";
    await request.post(`${BASE}/api/agent/chat`, {
      data: {
        customerId: cid,
        question: "Who are the contacts?",
        context: {
          company: "Solvance Pharma",
          healthLabel: "Healthy",
          healthScore: 90,
          openValue: "$800K",
          dealCount: 1,
          contactCount: 1,
        },
      },
    });
    const data = await (
      await request.get(`${BASE}/api/agent/chat?customerId=${cid}`)
    ).json();
    expect(data.messages.length).toBeGreaterThanOrEqual(2);
    expect(data.messages.some((m: { role: string }) => m.role === "me")).toBeTruthy();
    expect(
      data.messages.some((m: { role: string }) => m.role === "agent")
    ).toBeTruthy();
  });

  test("157 — account chat thread survives a reload (V9)", async ({ page }) => {
    await page.goto(`${BASE}/customers/cust-012`);
    await page.locator("main").getByRole("tab", { name: "Ask Agent" }).click();
    await page
      .getByRole("button", { name: "How healthy is this account?" })
      .click();
    await expect(page.getByText(/\/100/).first()).toBeVisible();
    // reload → the persisted answer is restored without re-asking
    await page.reload();
    await page.locator("main").getByRole("tab", { name: "Ask Agent" }).click();
    await expect(page.getByText(/\/100/).first()).toBeVisible();
  });

  test("158 — account chat thread can be cleared (V9)", async ({ request }) => {
    const cid = "cust-006";
    await request.post(`${BASE}/api/agent/chat`, {
      data: {
        customerId: cid,
        question: "Quick question",
        context: {
          company: "NovaGene",
          healthLabel: "Watch",
          healthScore: 55,
          openValue: "$200K",
          dealCount: 1,
          contactCount: 1,
        },
      },
    });
    let d = await (
      await request.get(`${BASE}/api/agent/chat?customerId=${cid}`)
    ).json();
    expect(d.messages.length).toBeGreaterThan(0);
    await request.delete(`${BASE}/api/agent/chat`, { data: { customerId: cid } });
    d = await (
      await request.get(`${BASE}/api/agent/chat?customerId=${cid}`)
    ).json();
    expect(d.messages.length).toBe(0);
  });

  test("159 — snippet usage count increments on use (V9)", async ({
    request,
  }) => {
    const created = await (
      await request.post(`${BASE}/api/agent/snippets`, {
        data: { subject: "UseTest", body: "x" },
      })
    ).json();
    const id = created.snippet.id;
    expect(created.snippet.uses).toBe(0);
    await request.post(`${BASE}/api/agent/snippets/use`, { data: { id } });
    const list = await (await request.get(`${BASE}/api/agent/snippets`)).json();
    const found = list.snippets.find((s: { id: string }) => s.id === id);
    expect(found.uses).toBe(1);
  });

  test("161 — snippet library search filters (V9)", async ({ page, request }) => {
    // ensure >3 snippets incl. a unique title so the search box shows
    for (const t of ["ZebraSnippet", "Alpha one", "Beta two", "Gamma three"]) {
      await request.post(`${BASE}/api/agent/snippets`, {
        data: { title: t, subject: `${t} subject`, body: "x" },
      });
    }
    await page.goto(`${BASE}/agent/settings`);
    await page.getByLabel("Search snippets").fill("ZebraSnippet");
    await expect(page.getByText("ZebraSnippet").first()).toBeVisible();
    await expect(page.getByText("Alpha one")).toHaveCount(0);
  });

  test("160 — account chat 'Clear' resets the thread (V9)", async ({ page }) => {
    await page.goto(`${BASE}/customers/cust-008`);
    await page.locator("main").getByRole("tab", { name: "Ask Agent" }).click();
    await page
      .getByRole("button", { name: "How healthy is this account?" })
      .click();
    await expect(page.getByText(/\/100/).first()).toBeVisible();
    await page.getByRole("button", { name: /Clear/ }).click();
    await expect(page.getByText(/Ask me anything about/)).toBeVisible();
    await expect(page.getByText(/\/100/)).toHaveCount(0);
  });

  test("155 — weekly review is exportable (print + share) (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent/review`);
    await expect(
      page.getByRole("button", { name: /Print \/ PDF/ })
    ).toBeVisible();
    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.getByText(/Weekly review shared/i)).toBeVisible();
  });

  test("154 — snippet can be renamed in the library (V9)", async ({ page }) => {
    await page.request.post(`${BASE}/api/agent/snippets`, {
      data: { title: "RenameTest", subject: "sub body", body: "x" },
    });
    await page.goto(`${BASE}/agent/settings`);
    await page
      .getByRole("button", { name: "Rename snippet RenameTest" })
      .first()
      .click();
    const input = page.getByLabel("Snippet title");
    await input.fill("RenameTest Updated");
    await input.press("Enter");
    await expect(page.getByText(/Snippet renamed/i)).toBeVisible();
    await expect(page.getByText("RenameTest Updated")).toBeVisible();
  });

  test("162 — agent run detail page deep-links a full step timeline (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent/runs/run-seed-001`);
    // Header + summary
    await expect(
      page.getByRole("heading", {
        name: "Ran a full outreach play for Helix Biologics",
      })
    ).toBeVisible();
    // The full step timeline is rendered
    await expect(
      page.getByRole("heading", { name: "Step timeline" })
    ).toBeVisible();
    await expect(page.getByText("Researched the account")).toBeVisible();
    await expect(page.getByText("Compliance approval")).toBeVisible();
    await expect(page.getByText("Awaited your approval")).toBeVisible();
    // Deep-links to the account
    await expect(
      page.getByRole("link", { name: /Helix Biologics/ })
    ).toBeVisible();
  });

  test("163 — 'Open run' from history navigates to the run detail (V9)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent/plan`);
    // The first run is expanded by default; click its "Open run" deep-link.
    await page.getByRole("link", { name: "Open run" }).first().click();
    await expect(page).toHaveURL(/\/agent\/runs\//);
    await expect(
      page.getByRole("heading", { name: "Step timeline" })
    ).toBeVisible();
  });

  test("164 — run detail surfaces the timeline entries it logged (V9 #52)", async ({
    page,
    request,
  }) => {
    // An auto-handle writes a real interaction and records it on the run.
    await request.post(`${BASE}/api/agent/act`, {
      data: { kind: "reengage", customerId: "cust-004" },
    });
    const res = await request.get(`${BASE}/api/agent/runs`);
    const { runs } = await res.json();
    const act = runs.find(
      (r: any) => r.kind === "act" && (r.interaction_ids?.length ?? 0) > 0
    );
    expect(act).toBeTruthy();
    await page.goto(`${BASE}/agent/runs/${act.id}`);
    await expect(
      page.getByRole("heading", { name: "What it logged" })
    ).toBeVisible();
    // The logged entry deep-links to the account it touched + names the author.
    await expect(
      page.getByRole("link", { name: /Helix Biologics/ }).first()
    ).toBeVisible();
    await expect(page.getByText("Logged by Freyr Agent").first()).toBeVisible();
  });

  test("165 — agent run history filters by kind (V9 #53)", async ({
    page,
    request,
  }) => {
    // Guarantee multiple kinds exist so the filter is offered.
    await request.post(`${BASE}/api/agent/act`, {
      data: { kind: "reengage", customerId: "cust-004" },
    });
    await request.post(`${BASE}/api/agent/act`, {
      data: { kind: "stabilize", customerId: "cust-004" },
    });
    await page.goto(`${BASE}/agent/plan`);
    const kindFilter = page.getByLabel("Filter runs by kind");
    await expect(kindFilter).toBeVisible();
    await kindFilter.selectOption("autopilot");
    // Only autopilot runs remain — the seeded play drops out.
    await expect(
      page.getByText("Autopilot drafted your queue").first()
    ).toBeVisible();
    await expect(
      page.getByText("Ran a full outreach play for Helix Biologics")
    ).toHaveCount(0);
  });

  test("166 — weekly review groups agent activity by account (V9 #55)", async ({
    page,
    request,
  }) => {
    // An account-scoped run gives the per-account rollup something to show.
    await request.post(`${BASE}/api/agent/act`, {
      data: { kind: "reengage", customerId: "cust-004" },
    });
    await page.goto(`${BASE}/agent/review`);
    await expect(
      page.getByRole("heading", { name: "Agent activity by account" })
    ).toBeVisible();
    // The worked account is listed and deep-links to its record.
    await expect(
      page.locator('a[href="/customers/cust-004"]').first()
    ).toBeVisible();
  });

  test("167 — run detail page can re-run a play and undo a run (V9 #54)", async ({
    page,
    request,
  }) => {
    // A play exposes "Run again".
    await page.goto(`${BASE}/agent/runs/run-seed-001`);
    await expect(
      page.getByRole("button", { name: "Run again" })
    ).toBeVisible();
    // An auto-handled run exposes "Undo" and reverting it works.
    await request.post(`${BASE}/api/agent/act`, {
      data: { kind: "reengage", customerId: "cust-004" },
    });
    const res = await request.get(`${BASE}/api/agent/runs`);
    const act = (await res.json()).runs.find(
      (r: any) =>
        r.kind === "act" &&
        (r.interaction_ids?.length ?? 0) > 0 &&
        !r.reverted
    );
    expect(act).toBeTruthy();
    await page.goto(`${BASE}/agent/runs/${act.id}`);
    const undoBtn = page.getByRole("button", { name: "Undo" });
    await expect(undoBtn).toBeVisible();
    await undoBtn.click();
    // Durable post-condition (survives the refresh): the run reads as reverted.
    await expect(page.getByText(/This run was reverted/)).toBeVisible();
  });

  test("168 — agent impact leaderboard ranks worked accounts (V9 #57)", async ({
    page,
    request,
  }) => {
    await request.post(`${BASE}/api/agent/act`, {
      data: { kind: "reengage", customerId: "cust-004" },
    });
    // Reachable from the console.
    await page.goto(`${BASE}/agent/plan`);
    await page.getByRole("link", { name: "Agent impact" }).click();
    await expect(page).toHaveURL(/\/agent\/impact/);
    await expect(
      page.getByRole("heading", { name: "Agent impact" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Most-worked accounts" })
    ).toBeVisible();
    // The worked account is ranked and deep-links to its record.
    await expect(
      page.locator('a[href="/customers/cust-004"]').first()
    ).toBeVisible();
  });

  test("169 — account rail shows the week's agent outcome summary (V9 #56)", async ({
    page,
  }) => {
    // cust-004 has a seeded agent run this week.
    await page.goto(`${BASE}/customers/cust-004`);
    await expect(page.getByText("This week:")).toBeVisible();
  });

  test("170 — agent impact page has a working time-window toggle (V9 #58)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent/impact`);
    await expect(page.getByText("Runs this quarter")).toBeVisible();
    await page.getByRole("link", { name: "This week" }).click();
    await expect(page).toHaveURL(/window=week/);
    await expect(page.getByText("Runs this week")).toBeVisible();
    await page.getByRole("link", { name: "All time" }).click();
    await expect(page).toHaveURL(/window=all/);
    await expect(page.getByText("Runs all time")).toBeVisible();
  });

  test("171 — agent impact page charts runs over time (V9 #59)", async ({
    page,
    request,
  }) => {
    await request.post(`${BASE}/api/agent/act`, {
      data: { kind: "reengage", customerId: "cust-004" },
    });
    await page.goto(`${BASE}/agent/impact?window=week`);
    await expect(
      page.getByRole("heading", { name: "Agent runs over time" })
    ).toBeVisible();
    await expect(page.getByRole("img", { name: /Bar chart:/ })).toBeVisible();
  });

  test("172 — goal plan preview is a non-mutating dry run (V9 #62)", async ({
    request,
  }) => {
    const before = (await (await request.get(`${BASE}/api/agent/runs`)).json())
      .runs.length;
    const res = await request.post(`${BASE}/api/agent/plan`, {
      data: {
        goal: "Find the highest-leverage moves across my pipeline",
        preview: true,
      },
    });
    const data = await res.json();
    expect(data.preview).toBe(true);
    expect(Array.isArray(data.willHandle)).toBe(true);
    expect(Array.isArray(data.willEscalate)).toBe(true);
    // A preview must never create a run.
    const after = (await (await request.get(`${BASE}/api/agent/runs`)).json())
      .runs.length;
    expect(after).toBe(before);
  });

  test("173 — goal bar surfaces the plan preview before executing (V9 #62)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent/plan`);
    await page
      .getByRole("button", { name: /Work the whole pipeline/ })
      .click();
    await expect(page.getByText(/Plan for/)).toBeVisible();
    // The dry-run preview wires through to the execute helper.
    await expect(
      page.getByText(/Will draft \d+ for you · \d+ need your approval/)
    ).toBeVisible();
  });

  test("174 — partial plan execution handles only the selected actions (V9 #63)", async ({
    request,
  }) => {
    const goal = "Find the highest-leverage moves across my pipeline";
    const pdata = await (
      await request.post(`${BASE}/api/agent/plan`, {
        data: { goal, preview: true },
      })
    ).json();
    const ids: string[] = (pdata.willHandle || []).map((x: any) => x.id);
    // Keep the first half selected; the rest must be skipped, not handled.
    const sel = ids.slice(0, Math.ceil(ids.length / 2));
    const edata = await (
      await request.post(`${BASE}/api/agent/plan`, {
        data: { goal, selectedIds: sel },
      })
    ).json();
    expect(edata.ok).toBe(true);
    expect(edata.handled).toBe(sel.length);
    expect(edata.skipped).toBe(ids.length - sel.length);
  });

  test("175 — rep can deselect a plan action in the preview (V9 #63)", async ({
    page,
  }) => {
    // Mock the preview so the deselection mechanic is tested deterministically,
    // independent of volatile pipeline state.
    await page.route("**/api/agent/plan", async (route) => {
      const body = route.request().postDataJSON();
      if (body && body.preview) {
        await route.fulfill({
          json: {
            ok: true,
            preview: true,
            willHandle: [
              { id: "a1", title: "Re-engage Acme", company: "Acme", customerId: "c1", href: "/customers/c1", kind: "reengage" },
              { id: "a2", title: "Re-engage Globex", company: "Globex", customerId: "c2", href: "/customers/c2", kind: "reengage" },
            ],
            willEscalate: [],
          },
        });
      } else {
        await route.continue();
      }
    });
    await page.goto(`${BASE}/agent/plan`);
    await page.getByRole("button", { name: /Work the whole pipeline/ }).click();
    await expect(
      page.getByText("Will draft for you (2/2)")
    ).toBeVisible();
    await expect(
      page.getByText("Will draft 2 for you · 0 need your approval")
    ).toBeVisible();
    // Deselect one action — the counts drop.
    await page.getByRole("button", { name: "Deselect Re-engage Acme" }).click();
    await expect(
      page.getByText("Will draft for you (1/2)")
    ).toBeVisible();
    await expect(
      page.getByText("Will draft 1 for you · 0 need your approval")
    ).toBeVisible();
  });

  test("176 — inbox can approve or decline a pitch in review (V9 #65)", async ({
    page,
    request,
  }) => {
    // Clean lens + a guaranteed pitch in compliance review.
    await request.put(`${BASE}/api/agent/prefs`, {
      data: { focus_industry: null, only_mine: false },
    });
    await request.post(`${BASE}/api/sessions/sess-003/review`, {
      data: { action: "submit" },
    });
    await page.goto(`${BASE}/agent/inbox`);
    // The approval item now exposes an inline human gate: Approve + Decline.
    await expect(
      page.getByRole("button", { name: /^Approve Approve the pitch for/ }).first()
    ).toBeVisible();
    const decline = page
      .getByRole("button", { name: /^Decline Approve the pitch for/ })
      .first();
    await expect(decline).toBeVisible();
    // Decline opens a reason editor (#66); sending back routes it to a tracked
    // rework lane with the reason (#67).
    await decline.click();
    const reason = page.getByLabel("Why send it back?");
    await expect(reason).toBeVisible();
    await reason.fill("Soften the pricing claim; cite the 2024 study.");
    await page.getByRole("button", { name: "Send back" }).click();
    await expect(
      page.getByRole("heading", { name: "Sent back for changes" })
    ).toBeVisible();
    await expect(
      page.getByText("Soften the pricing claim; cite the 2024 study.")
    ).toBeVisible();
  });

  test("177 — declining can be cancelled without sending back (V9 #66)", async ({
    page,
    request,
  }) => {
    await request.put(`${BASE}/api/agent/prefs`, {
      data: { focus_industry: null, only_mine: false },
    });
    await request.post(`${BASE}/api/sessions/sess-003/review`, {
      data: { action: "submit" },
    });
    await page.goto(`${BASE}/agent/inbox`);
    await page
      .getByRole("button", { name: /^Decline Approve the pitch for/ })
      .first()
      .click();
    await expect(page.getByLabel("Why send it back?")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    // Editor closes and the pitch is still awaiting approval (not sent back).
    await expect(page.getByLabel("Why send it back?")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Approve Approve the pitch for/ }).first()
    ).toBeVisible();
  });

  test("178 — rework can be re-submitted for review in one click (V9 #68)", async ({
    page,
    request,
  }) => {
    await request.put(`${BASE}/api/agent/prefs`, {
      data: { focus_industry: null, only_mine: false },
    });
    // Put the pitch in the rework lane.
    await request.post(`${BASE}/api/sessions/sess-003/review`, {
      data: { action: "request_changes", note: "Tighten the ROI section." },
    });
    await page.goto(`${BASE}/agent/inbox`);
    await expect(
      page.getByRole("heading", { name: "Sent back for changes" })
    ).toBeVisible();
    await page
      .getByRole("button", { name: /^Re-submit .* for review/ })
      .first()
      .click();
    // Round-trips back to the approval lane; the rework lane empties.
    await expect(
      page.getByRole("heading", { name: "Sent back for changes" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Approve Approve the pitch for/ }).first()
    ).toBeVisible();
  });

  test("179 — sent-back pitches count toward the inbox total (V9 #69)", async ({
    request,
  }) => {
    await request.put(`${BASE}/api/agent/prefs`, {
      data: { focus_industry: null, only_mine: false },
    });
    // Ensure the pitch is awaiting approval first.
    await request.post(`${BASE}/api/sessions/sess-003/review`, {
      data: { action: "submit" },
    });
    const before = await (
      await request.get(`${BASE}/api/agent/inbox`)
    ).json();
    await request.post(`${BASE}/api/sessions/sess-003/review`, {
      data: { action: "request_changes", note: "Needs work." },
    });
    const after = await (await request.get(`${BASE}/api/agent/inbox`)).json();
    // A decline moves one item from approvals to reworks; both feed the badge.
    expect(after.reworks).toBe(before.reworks + 1);
    expect(after.needsApproval).toBe(before.needsApproval - 1);
  });

  test("180 — agent account briefing synthesizes a research read (V9 #71)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/briefing`, {
      data: {
        context: {
          company: "Test Co",
          healthLabel: "At risk",
          healthScore: 40,
          openValue: "$500K",
          dealCount: 1,
          contactCount: 1,
          topAction: "Re-engage Test Co",
        },
      },
    });
    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(d.briefing.reads.length).toBeGreaterThanOrEqual(4);
    expect(d.briefing.recommendation).toContain("Re-engage Test Co");
    expect(typeof d.narrative).toBe("string");
    expect(d.narrative.length).toBeGreaterThan(20);
  });

  test("181 — account overview shows the agent briefing (V9 #71)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/customers/cust-004`);
    await expect(page.getByText("Agent briefing")).toBeVisible();
    await expect(page.getByText(/^Recommended:/).first()).toBeVisible();
  });

  test("182 — deal detail shows a pre-call briefing (V9 #73)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/deals/sess-001`);
    await expect(page.getByText("Pre-call brief")).toBeVisible();
    await expect(page.getByText(/win probability/).first()).toBeVisible();
    await expect(page.getByText(/^Recommended:/).first()).toBeVisible();
  });

  test("183 — account briefing can be re-briefed and copied (V9 #72)", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-write"]);
    await page.goto(`${BASE}/customers/cust-004`);
    await expect(page.getByText("Agent briefing")).toBeVisible();
    await page.getByRole("button", { name: "Brief me again" }).click();
    // Re-briefing keeps the card present.
    await expect(page.getByText("Agent briefing")).toBeVisible();
    await page.getByRole("button", { name: "Copy briefing" }).click();
    await expect(page.getByText(/copied to clipboard/i)).toBeVisible();
  });

  test("184 — high-value guardrail escalates big accounts (V9 #75)", async ({
    request,
  }) => {
    const goal = "Find the highest-leverage moves across my pipeline";
    const preview = async () =>
      (
        await (
          await request.post(`${BASE}/api/agent/plan`, {
            data: { goal, preview: true },
          })
        ).json()
      ) as { willHandle: any[]; willEscalate: any[] };

    await request.put(`${BASE}/api/agent/prefs`, {
      data: { autopilot_max_value: null },
    });
    const off = await preview();
    // A $1 ceiling forces every account with open pipeline to escalate.
    await request.put(`${BASE}/api/agent/prefs`, {
      data: { autopilot_max_value: 1 },
    });
    const on = await preview();
    await request.put(`${BASE}/api/agent/prefs`, {
      data: { autopilot_max_value: null },
    });

    // Total actions are conserved — the ceiling only reclassifies handle→escalate.
    expect(on.willHandle.length + on.willEscalate.length).toBe(
      off.willHandle.length + off.willEscalate.length
    );
    expect(on.willHandle.length).toBeLessThanOrEqual(off.willHandle.length);
    // If anything was auto-handleable, the ceiling must push it to approval.
    if (off.willHandle.length > 0) {
      expect(on.willEscalate.length).toBeGreaterThan(off.willEscalate.length);
    }
  });

  test("185 — high-value guardrail is settable in preferences (V9 #75)", async ({
    page,
    request,
  }) => {
    await request.put(`${BASE}/api/agent/prefs`, {
      data: { autopilot_max_value: null },
    });
    await page.goto(`${BASE}/agent/settings`);
    const sel = page.getByLabel("High-value guardrail");
    await expect(sel).toBeVisible();
    await sel.selectOption("250000");
    await expect(
      page.getByText(/always kept for your sign-off/i)
    ).toBeVisible();
    await expect
      .poll(async () => {
        const p = await (
          await request.get(`${BASE}/api/agent/prefs`)
        ).json();
        return p.prefs.autopilot_max_value;
      })
      .toBe(250000);
    await request.put(`${BASE}/api/agent/prefs`, {
      data: { autopilot_max_value: null },
    });
  });

  test("186 — plan preview reports the value-ceiling hold count (V9 #76)", async ({
    request,
  }) => {
    const goal = "Find the highest-leverage moves across my pipeline";
    const preview = async () =>
      (await (
        await request.post(`${BASE}/api/agent/plan`, {
          data: { goal, preview: true },
        })
      ).json()) as { willHandle: any[]; heldForValue: number; ceiling: number | null };

    await request.put(`${BASE}/api/agent/prefs`, {
      data: { autopilot_max_value: null },
    });
    const off = await preview();
    await request.put(`${BASE}/api/agent/prefs`, {
      data: { autopilot_max_value: 1 },
    });
    const on = await preview();
    await request.put(`${BASE}/api/agent/prefs`, {
      data: { autopilot_max_value: null },
    });

    expect(on.ceiling).toBe(1);
    // heldForValue is exactly the auto-handles the ceiling pushed to approval.
    expect(on.heldForValue).toBe(off.willHandle.length - on.willHandle.length);
  });

  test("187 — autopilot report flags value-ceiling holds (V9 #76)", async ({
    page,
  }) => {
    // Mock the autopilot result so the banner is tested deterministically.
    await page.route("**/api/agent/autopilot", async (route) => {
      await route.fulfill({
        json: {
          ok: true,
          handled: 2,
          escalated: 3,
          heldForValue: 2,
          ceiling: 250000,
          handledItems: ["Follow up with A", "Follow up with B"],
          escalatedItems: ["Re-engage C", "Re-engage D", "Approve E"],
        },
      });
    });
    await page.goto(`${BASE}/agent/inbox`);
    await page.getByRole("button", { name: "Run autopilot" }).click();
    await expect(page.getByText(/held for your sign-off/i)).toBeVisible();
    await expect(page.getByText(/\$250K/).first()).toBeVisible();
  });

  test("188 — contact detail shows a pre-call briefing (V9 #74)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/contacts/cont-001`);
    await expect(page.getByText("Pre-call brief")).toBeVisible();
    await expect(page.getByText(/^Recommended:/).first()).toBeVisible();
  });

  test("189 — a plan steer is recorded on the run (V9 #64)", async ({
    request,
  }) => {
    const steer = "mention our new FDA fast-track service";
    await request.post(`${BASE}/api/agent/plan`, {
      data: {
        goal: "Find the highest-leverage moves across my pipeline",
        instruction: steer,
      },
    });
    const runs = (await (await request.get(`${BASE}/api/agent/runs`)).json())
      .runs;
    const plan = runs.find(
      (r: any) => r.kind === "plan" && (r.summary || "").includes("Steer:")
    );
    expect(plan).toBeTruthy();
    expect(plan.summary).toContain(steer);
  });

  test("190 — the goal plan offers a draft steer before executing (V9 #64)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent/plan`);
    await page
      .getByRole("button", { name: /Work the whole pipeline/ })
      .click();
    await expect(page.getByText(/Plan for/)).toBeVisible();
    await expect(
      page.getByLabel("Steer the drafts (optional)")
    ).toBeVisible();
  });

  test("191 — dashboard controls are real, not mock (export + view all)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/dashboard`);
    // Export is a real CSV download.
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    expect((await download).suggestedFilename()).toBe(
      "freyr-dashboard-sessions.csv"
    );
    // The Recent Sessions header's link is real (replaced the two dead icons).
    await page.getByRole("link", { name: "View all sessions" }).click();
    await expect(page).toHaveURL(/\/sessions/);
  });

  test("192 — agent is a chat that answers a grounded question (V10)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent`);
    await expect(page.getByText(/what do you want to work on/i)).toBeVisible();
    await page
      .getByRole("button", { name: "What's my open pipeline worth?" })
      .click();
    // The question is echoed and the agent replies (wording may be AI-generated).
    await expect(
      page.getByText("What's my open pipeline worth?").first()
    ).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("Agent", { exact: true }).first()).toBeVisible({
      timeout: 12000,
    });
  });

  test("193 — agent chat composer sends a typed message (V10)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent`);
    const box = page.getByLabel("Message the agent");
    await box.click();
    await page.keyboard.type("which deals are cooling?");
    await page.getByRole("button", { name: "Send" }).click();
    // The message sends and an agent reply renders, regardless of phrasing.
    await expect(
      page.getByText("which deals are cooling?").first()
    ).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("Agent", { exact: true }).first()).toBeVisible({
      timeout: 12000,
    });
  });

  test("194 — chat refines a draft using conversation context (V10)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: {
        mock: true,
        message: "make it shorter",
        history: [
          { role: "user", text: "draft an email to Helix Biologics" },
          {
            role: "agent",
            text: "Here's a draft for Helix Biologics. Want me to make it shorter or change the tone?",
          },
        ],
      },
    });
    const d = await res.json();
    // It resolves the account from history and returns a tightened draft.
    expect(d.reply.toLowerCase()).toContain("helix");
    expect(d.reply.toLowerCase()).toMatch(/tighten|shorter|quick call|subject/);
  });

  test("195 — agent actually SAVES a draft (real action, not just talk) (V11)", async ({
    request,
  }) => {
    const save = await request.post(`${BASE}/api/agent/converse`, {
      data: {
        mock: true,
        message: "save it",
        history: [
          { role: "user", text: "draft an email to Helix Biologics" },
          {
            role: "agent",
            text: "Here's a draft for Helix Biologics — review before it goes out:\n\nSubject: A quick idea for your upcoming milestones\n\nHi there, Freyr helps clinical-stage teams hit FDA/EMA timelines. Worth a 20-minute call?\n\nBest,\nSarah",
          },
        ],
      },
    });
    const sd = await save.json();
    expect(sd.source).toBe("action");
    expect(sd.did).toBe("save_draft");
    expect(sd.reply.toLowerCase()).toMatch(/saved/);
    expect(sd.reply.toLowerCase()).toContain("helix");

    // And the work is durable: it shows up in recent activity.
    const recent = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "what did you do recently?", history: [] },
    });
    const rd = await recent.json();
    expect(rd.reply.toLowerCase()).toContain("saved a draft");
  });

  test("196 — agent sets a real follow-up reminder (V11)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "set a follow-up with Helix Biologics next week", history: [] },
    });
    const d = await res.json();
    expect(d.source).toBe("action");
    expect(d.did).toBe("set_followup");
    expect(d.reply.toLowerCase()).toMatch(/set|radar/);
    expect(d.reply.toLowerCase()).toContain("helix");
  });

  test("197 — agent logs a call as a real touch (V11)", async ({ request }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "log a call with Helix Biologics", history: [] },
    });
    const d = await res.json();
    expect(d.source).toBe("action");
    expect(d.did).toBe("log_touch");
    expect(d.reply.toLowerCase()).toMatch(/logged/);
  });

  test("198 — agent doesn't give the same canned line twice (V11)", async ({
    request,
  }) => {
    const first = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "whats up", history: [] },
    });
    const r1 = (await first.json()).reply;
    const second = await request.post(`${BASE}/api/agent/converse`, {
      data: {
        mock: true,
        message: "whats up",
        history: [
          { role: "user", text: "whats up" },
          { role: "agent", text: r1 },
        ],
      },
    });
    const r2 = (await second.json()).reply;
    expect(r1.trim().length).toBeGreaterThan(0);
    expect(r2.trim()).not.toBe(r1.trim());
  });

  test("199 — agent pulls up a real, account-tailored pitch (V11)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "show me the pitch for Cortexa Biopharma", history: [] },
    });
    const d = await res.json();
    expect(d.source).toBe("pitch");
    expect(d.did).toBe("show_pitch");
    // Tailored to THIS account/contact, not a reused canned pitch.
    expect(d.reply).toContain("Cortexa Biopharma");
    expect(d.reply).toContain("Marcus Thorne");
    expect(d.reply.toLowerCase()).toContain("subject:");
  });

  test("200 — agent NAMES pending pitches instead of blanking (V12)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "what are the 2 pending pitches", history: [] },
    });
    const d = await res.json();
    // The reported bug: it used to punt ("I don't have the details, check the
    // app yourself"). It must give a substantive approvals answer instead.
    expect(d.reply.toLowerCase()).not.toMatch(
      /don'?t have (the )?details|you'?d need to check|check the .*(queue|app) (directly|yourself)|don'?t have .* in my .* data/
    );
    expect(d.reply.toLowerCase()).toMatch(/pitch|approv|waiting|all clear/);
  });

  test("201 — agent parses a written-number follow-up date (V13)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: {
        mock: true,
        message: "set a follow-up with Helix Biologics in two weeks",
        history: [],
      },
    });
    const d = await res.json();
    expect(d.did).toBe("set_followup");
    // "two weeks" must be understood as 2 weeks — not silently defaulted to next week.
    expect(d.reply.toLowerCase()).toContain("in 2 weeks");
  });

  test("202 — agent logs a touch reported in passing, but not a future one (V13)", async ({
    request,
  }) => {
    // Reported in passing (no word "log") → logged.
    const logged = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "spoke with Cortexa Biopharma, they are interested", history: [] },
    });
    const a = await logged.json();
    expect(a.did).toBe("log_touch");
    expect(a.reply.toLowerCase()).toMatch(/logged/);
    // A future intent must NOT be logged as a past touch.
    const future = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "I should call Helix Biologics tomorrow", history: [] },
    });
    const b = await future.json();
    expect(b.did).not.toBe("log_touch");
  });

  test("203 — agent sets a follow-up on an explicit calendar date (V13)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: {
        mock: true,
        message: "set a follow-up with Helix Biologics on June 30",
        history: [],
      },
    });
    const d = await res.json();
    expect(d.did).toBe("set_followup");
    // The named date must be honored, not defaulted to "next week".
    expect(d.reply.toLowerCase()).toContain("jun 30");
  });

  test("204 — agent refuses to send on the rep's behalf, human-led (V13)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: {
        mock: true,
        message: "go ahead and send it",
        history: [
          { role: "user", text: "draft an email to Helix Biologics" },
          { role: "agent", text: "Subject: A quick idea\n\nHi there...\n\nSuren Dheen · Freyr" },
        ],
      },
    });
    const d = await res.json();
    // Never sends outward; hands control back to the rep.
    expect(d.reply.toLowerCase()).toMatch(/can'?t send|final say|stay in control|on your behalf/);
    expect(d.did).not.toBe("save_draft");
  });

  test("205 — agent flags an unknown account instead of ignoring it (V13)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "draft an email to Globex Corporation", history: [] },
    });
    const d = await res.json();
    expect(d.reply.toLowerCase()).toMatch(/don'?t see .*globex|globex.*your accounts/);
    // A real account must still draft normally (the guard didn't over-fire).
    const ok = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "draft an email to Helix Biologics", history: [] },
    });
    const e = await ok.json();
    expect(e.reply.toLowerCase()).toContain("helix");
    expect(e.reply.toLowerCase()).toMatch(/draft|subject/);
  });

  test("206 — agent drafts for a described account, not just a named one (V13)", async ({
    request,
  }) => {
    // Criterion targeting ("a cooling account", "my biggest deal") must resolve to
    // a real account and draft, instead of punting with "which account?". Uses the
    // value-based criterion so it's stable regardless of test ordering.
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "draft an email to my biggest deal", history: [] },
    });
    const d = await res.json();
    expect(d.reply.toLowerCase()).toMatch(/going with|subject:/);
    expect(d.reply.toLowerCase()).not.toMatch(/which account is it for/);
  });

  test("207 — agent sets a follow-up on a described account (V13)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "set a follow-up with my biggest deal on Friday", history: [] },
    });
    const d = await res.json();
    expect(d.did).toBe("set_followup");
    expect(d.reply.toLowerCase()).toMatch(/friday|fri,/);
    expect(d.reply.toLowerCase()).not.toMatch(/who should i set/);
  });

  test("208 — chat action reply deep-links to the account (V13)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent`);
    const box = page.getByLabel("Message the agent");
    await box.click();
    await page.keyboard.type("log a call with Helix Biologics");
    await page.getByRole("button", { name: "Send" }).click();
    // The action confirmation renders a clickable link into the account record.
    await expect(
      page.locator('a[href^="/customers/"]').first()
    ).toBeVisible({ timeout: 12000 });
  });

  test("209 — answer lists deep-link the accounts they name (V13)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "what are my biggest deals", history: [] },
    });
    const d = await res.json();
    // Each listed account is a clickable deep-link, not dead text.
    expect(d.reply).toMatch(/\]\(\/customers\//);
  });

  test("210 — fallback brain answers 'which is most urgent' with the single top item (V13)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "which is most urgent?", history: [] },
    });
    const d = await res.json();
    expect(d.reply.toLowerCase()).toContain("most urgent:");
    // Not the whole focus list.
    expect(d.reply.toLowerCase()).not.toContain("here's where i'd start");
  });

  test("212 — agent summary endpoint returns the rep's workload (V13)", async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/api/agent/summary`);
    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(typeof d.needsApproval).toBe("number");
    expect(typeof d.cooling).toBe("number");
    expect(typeof d.atRisk).toBe("number");
    expect(typeof d.openValueLabel).toBe("string");
  });

  test("211 — fallback brain drafts for 'that one' using conversation context (V13)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: {
        mock: true,
        message: "ok draft something for that one",
        history: [
          { role: "user", text: "tell me about Helix Biologics" },
          { role: "agent", text: "Helix Biologics — healthy health..." },
        ],
      },
    });
    const d = await res.json();
    expect(d.reply.toLowerCase()).toContain("helix");
    expect(d.reply.toLowerCase()).toMatch(/draft|subject/);
  });

  // -------------------------------------------------------------------------
  // 213–232 — agent "tell me more about X" follow-ups (V14). Reported bug: a
  // natural follow-up that names a just-listed account ("tell me more about
  // bionex") fell through to the generic catch-all instead of summarizing the
  // account. These lock down the fix across phrasings, partial names, and
  // context-only references. Each must return a real account summary
  // (`health (NN/100)`), name the account, and NOT hit the fallback.
  // -------------------------------------------------------------------------
  const FALLBACK_RE =
    /not sure i caught that|i can dig into your pipeline or take an action/i;
  const SUMMARY_RE = /health \(\d+\/100\)/i;
  const atRiskHist = [
    { role: "user", text: "Which accounts are at-risk?" },
    {
      role: "agent",
      text: "4 accounts are at-risk:\n• Northwind Biosciences — $125K open\n• Meridian Pharmaceuticals — $0 open\n• Indavel Pharma — $0 open\n• BioNex Therapeutics — $250K open\n\nWant me to draft re-engagement for the top one?",
    },
  ];
  const oneAcctHist = (name: string) => [
    { role: "user", text: `tell me about ${name}` },
    {
      role: "agent",
      text: `${name} — healthy health (78/100). 1 open deal worth $250K.`,
    },
  ];

  const followupCases: [number, string, any[], string][] = [
    [213, "tell me more about bionex", atRiskHist, "BioNex Therapeutics"],
    [214, "tell me more about BioNex Therapeutics", [], "BioNex Therapeutics"],
    [215, "what about northwind?", atRiskHist, "Northwind Biosciences"],
    [216, "more on Indavel Pharma", [], "Indavel Pharma"],
    [217, "how's helix doing?", [], "Helix Biologics"],
    [218, "give me the rundown on Cortexa", [], "Cortexa Biopharma"],
    [219, "fill me in on Quantum Oncology", [], "Quantum Oncology"],
    [220, "who's the contact at Solara Consumer Health?", [], "Solara Consumer Health"],
    [221, "what stage is BioNex at?", [], "BioNex Therapeutics"],
    [222, "how big is the Helix deal?", [], "Helix Biologics"],
    [223, "anything on Orion Vaccines?", [], "Orion Vaccines"],
    [224, "what's going on with NovaGene?", [], "NovaGene Therapeutics"],
    [225, "summarize Northwind", [], "Northwind Biosciences"],
    [226, "is BioNex at risk?", [], "BioNex Therapeutics"],
    [227, "and Meridian?", atRiskHist, "Meridian Pharmaceuticals"],
    [228, "what's the latest on BioNex?", [], "BioNex Therapeutics"],
    [229, "give me an overview of Aether Medical Devices", [], "Aether Medical Devices"],
    [230, "tell me more about Solvance Pharma", [], "Solvance Pharma"],
    [231, "tell me more", oneAcctHist("Helix Biologics"), "Helix Biologics"],
    [232, "what about them?", oneAcctHist("Cortexa Biopharma"), "Cortexa Biopharma"],
  ];

  for (const [n, message, history, expectName] of followupCases) {
    test(`${n} — agent follow-up summarizes "${message}" (V14)`, async ({
      request,
    }) => {
      const res = await request.post(`${BASE}/api/agent/converse`, {
        data: { mock: true, message, history },
      });
      const reply = (await res.json()).reply as string;
      expect(reply).not.toMatch(FALLBACK_RE);
      expect(reply.toLowerCase()).toContain(expectName.toLowerCase());
      expect(reply).toMatch(SUMMARY_RE);
    });
  }

  // 233–234 — routing guardrails: broadening the detail intent must NOT steal
  // pipeline / at-risk-list questions and turn them into a single-account
  // summary. These pin the boundary the V14 fix had to respect.
  test("233 — 'pipeline worth' still answers pipeline, not an account summary (V14)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "what's my open pipeline worth?", history: [] },
    });
    const reply = (await res.json()).reply as string;
    expect(reply.toLowerCase()).toContain("weighted");
    expect(reply).not.toMatch(SUMMARY_RE);
  });

  test("234 — 'which accounts are at-risk' still lists, not a single summary (V14)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "which accounts are at-risk?", history: [] },
    });
    const reply = (await res.json()).reply as string;
    expect(reply.toLowerCase()).toMatch(/at-risk/);
    expect(reply).not.toMatch(SUMMARY_RE);
  });

  // -------------------------------------------------------------------------
  // 235–240 — Offerings repository (Suren video requirement #1, see
  // SUREN-VIDEO-REVIEW.md): new nav item, visualization, filtering, detail with
  // sales materials, entry, and customer-type/market definitions.
  // -------------------------------------------------------------------------
  test("235 — Offerings is in the nav and the repository renders (V15)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.click("nav >> text=Offerings");
    await expect(page).toHaveURL(/offerings/);
    await expect(page.getByRole("heading", { name: "Offerings" })).toBeVisible();
    await expect(page.getByText("Freya Register").first()).toBeVisible();
    await expect(page.getByLabel("Filter by customer type")).toBeVisible();
    await expect(page.getByLabel("Filter by market")).toBeVisible();
  });

  test("236 — Offerings search filters the visualization (V15)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/offerings`);
    await page.getByLabel("Search offerings").fill("Omni");
    await expect(page.getByText("Omni Object").first()).toBeVisible();
    await expect(page.getByText("Freya Label")).toHaveCount(0);
  });

  test("237 — Offering detail shows availability, types, markets, materials (V15)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/offerings/of-003`);
    await expect(
      page.getByText("Freya Register + Pia, Mia and Via Agents")
    ).toBeVisible();
    await expect(page.getByText(/V3 is available in July 2026/)).toBeVisible();
    // customer types are grouped by family on the detail page
    await expect(
      page.getByText("Bio Pharmaceutical", { exact: true })
    ).toBeVisible();
    await expect(page.getByText("Korea", { exact: true })).toBeVisible();
    // sales material is a real, clickable external link
    await expect(
      page.locator('a[target="_blank"][rel="noopener noreferrer"]').first()
    ).toBeVisible();
  });

  test("238 — Customer types page shows the definitions, grouped by family (V15)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/offerings/customer-types`);
    await expect(
      page.getByRole("heading", { name: /Customer types & markets/ })
    ).toBeVisible();
    // family group headers
    await expect(
      page.getByRole("heading", { name: "Pharmaceutical", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Bio Pharmaceutical", exact: true })
    ).toBeVisible();
    // a size row + a definition value (revenue band from Suren's sheet)
    await expect(page.getByText("Mid size").first()).toBeVisible();
    await expect(page.getByText("Under $500M").first()).toBeVisible();
  });

  test("239 — Offerings API: list is seeded and create works (V15)", async ({
    request,
  }) => {
    const list = await request.get(`${BASE}/api/offerings`);
    const ld = await list.json();
    expect(Array.isArray(ld.offerings)).toBe(true);
    expect(ld.offerings.length).toBeGreaterThanOrEqual(14);
    // each offering carries hydrated customer types + markets
    expect(ld.offerings[0]).toHaveProperty("customerTypes");
    expect(ld.offerings[0]).toHaveProperty("markets");

    const created = await request.post(`${BASE}/api/offerings`, {
      data: {
        offering_name: "QA — Test Offering",
        offering_type: "Freya Module",
        customer_type_ids: ["ct-pharma-l"],
        market_ids: ["mkt-usa"],
      },
    });
    const cd = await created.json();
    expect(cd.ok).toBe(true);
    expect(cd.offering.offering_name).toBe("QA — Test Offering");
  });

  test("240 — Customer-types & markets APIs return the seeded reference data (V15)", async ({
    request,
  }) => {
    const ct = await (await request.get(`${BASE}/api/customer-types`)).json();
    expect(ct.customerTypes.length).toBeGreaterThanOrEqual(9);
    expect(ct.customerTypes.some((c: any) => c.name === "Pharmaceutical - Small")).toBe(
      true
    );
    const mk = await (await request.get(`${BASE}/api/markets`)).json();
    const names = mk.markets.map((m: any) => m.name);
    for (const m of ["USA", "Europe", "Japan", "China", "Korea"])
      expect(names).toContain(m);
  });

  test("241 — an existing offering can be edited (maintainable repository) (V16)", async ({
    page,
    request,
  }) => {
    // Detail page exposes an Edit affordance...
    await page.goto(`${BASE}/offerings/of-009`);
    await expect(page.getByRole("link", { name: /Edit offering/ })).toBeVisible();
    // ...the edit route renders the form pre-filled with the offering's name...
    await page.goto(`${BASE}/offerings/of-009/edit`);
    await expect(
      page.getByRole("heading", { name: "Edit offering" })
    ).toBeVisible();
    await expect(page.locator('input[value="Freya Docs"]')).toBeVisible();
    // ...and PATCH actually persists a mapping (material gets a server id).
    const res = await request.patch(`${BASE}/api/offerings/of-009`, {
      data: {
        customer_type_ids: ["ct-pharma-l"],
        market_ids: ["mkt-europe"],
        materials: [{ kind: "video", label: "Docs demo", url: "https://youtu.be/x" }],
      },
    });
    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(d.offering.customer_type_ids).toContain("ct-pharma-l");
    expect(d.offering.materials[0].id).toBeTruthy();
  });

  test("242 — market/type chips deep-link into a filtered offerings view (V16)", async ({
    page,
  }) => {
    // A ?market= deep link pre-filters the list to that market.
    await page.goto(`${BASE}/offerings?market=mkt-europe`);
    await page.waitForTimeout(400);
    await expect(
      page.getByText("Freya GRI + Freya chat", { exact: true })
    ).toBeVisible(); // of-005 carries Europe
    await expect(page.getByText("Freya Submit")).toHaveCount(0); // of-008 has no market
    // A market chip on an offering links into that filtered view.
    await page.goto(`${BASE}/offerings/of-003`);
    await page.getByRole("link", { name: "Japan", exact: true }).click();
    await expect(page).toHaveURL(/market=mkt-japan/);
  });

  test("243 — an offering can be duplicated into an editable copy (V17)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/offerings/of-001`);
    await page.getByRole("button", { name: /Duplicate/ }).click();
    // Lands in the editor for the new copy...
    await page.waitForURL(/\/offerings\/of-[a-z0-9]+\/edit/, { timeout: 8000 });
    await expect(
      page.getByRole("heading", { name: "Edit offering" })
    ).toBeVisible();
    // ...pre-filled with the "(copy)" name.
    await expect(
      page.locator('input[value="Freya Register (copy)"]')
    ).toBeVisible();
  });

  test("244 — 'still to map' opens an actionable unmapped worklist (V17)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/offerings`);
    await page.getByRole("link", { name: /still to map/ }).click();
    await page.waitForURL(/status=unmapped/, { timeout: 8000 });
    await expect(page.getByText("Needs mapping")).toBeVisible();
    // an unmapped offering shows; a mapped one is excluded
    await expect(page.getByText("Freya Label")).toBeVisible();
    await expect(
      page.getByText("Freya GRI + Freya chat", { exact: true })
    ).toHaveCount(0);
  });

  test("245 — an offering can be deleted from the edit screen (V18)", async ({
    page,
    request,
  }) => {
    // Throwaway offering so we don't disturb the seeded catalog.
    const created = await request.post(`${BASE}/api/offerings`, {
      data: { offering_name: "Delete Me QA", offering_type: "Freya Module" },
    });
    const id = (await created.json()).offering.id;

    await page.goto(`${BASE}/offerings/${id}/edit`);
    await page.getByRole("button", { name: /Delete offering/ }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.waitForURL((u) => u.pathname === "/offerings", { timeout: 8000 });

    // It's gone.
    const after = await request.get(`${BASE}/api/offerings/${id}`);
    expect(after.status()).toBe(404);
  });

  test("246 — a market can be added and removed (V18)", async ({
    page,
    request,
  }) => {
    const created = await request.post(`${BASE}/api/markets`, {
      data: { name: "Brazil QA" },
    });
    const mid = (await created.json()).market.id;

    await page.goto(`${BASE}/offerings/customer-types`);
    await expect(page.getByText("Brazil QA")).toBeVisible();
    await page.getByRole("button", { name: "Remove Brazil QA" }).click();
    await expect(page.getByText("Brazil QA")).toHaveCount(0);

    // Gone from the data layer too.
    const mk = await (await request.get(`${BASE}/api/markets`)).json();
    expect(mk.markets.some((m: any) => m.id === mid)).toBe(false);
  });

  test("247 — the offerings view exports to CSV (V19)", async ({ page }) => {
    await page.goto(`${BASE}/offerings`);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Export CSV/ }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("freyr-offerings.csv");

    // Content is well-formed: exact column header + comma-bearing names quoted.
    const csv = await readFile(await download.path(), "utf8");
    const [header, ...rows] = csv.split("\n");
    expect(header).toBe(
      "Offering Type,Offering,Description,Current Availability,Future Availability,Customer Types,Markets,Sales Materials"
    );
    expect(rows.length).toBeGreaterThanOrEqual(14);
    expect(csv).toContain('"Freya Register + Pia, Mia and Via Agents"');

    // Filtered exports are named by their filter (Excel-friendly).
    await page.goto(`${BASE}/offerings?market=mkt-europe`);
    const [dl2] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Export CSV/ }).click(),
    ]);
    expect(dl2.suggestedFilename()).toBe("freyr-offerings-europe.csv");
  });

  // -------------------------------------------------------------------------
  // 248–251 — the agent is factually aware of the Offerings repository (V20).
  // Grounded, read-only lookups (no fuzzy account matching); runs in the
  // deterministic path so production gets it without a key.
  // -------------------------------------------------------------------------
  test("248 — agent gives an offerings overview (V20)", async ({ request }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "what offerings do we have?" },
    });
    const d = await res.json();
    expect(d.source).toBe("offerings");
    expect(d.reply).toMatch(/offerings? across \d+ type/i);
  });

  test("249 — agent describes a specific offering with a deep link (V20)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "tell me about Freya Register" },
    });
    const d = await res.json();
    expect(d.source).toBe("offerings");
    expect(d.reply).toContain("Freya Register");
    expect(d.reply).toMatch(/\/offerings\/of-/);
  });

  test("250 — agent lists offerings by market (V20)", async ({ request }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "which offerings are available in Europe?" },
    });
    const d = await res.json();
    expect(d.source).toBe("offerings");
    expect(d.reply.toLowerCase()).toContain("europe");
    expect(d.reply).toContain("Freya GRI + Freya chat");
  });

  test("251 — offerings answers don't hijack normal pipeline questions (V20)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/agent/converse`, {
      data: { mock: true, message: "which deals are cooling?" },
    });
    const d = await res.json();
    // The point of the control: a pipeline question is NOT routed to the
    // offerings responder (it stays on the normal brain).
    expect(d.source).not.toBe("offerings");
    expect((d.reply || "").length).toBeGreaterThan(0);
  });

  test("252 — agent empty state surfaces the offerings starter (V20)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/agent`);
    const chip = page.getByRole("button", {
      name: "What offerings do we have?",
    });
    await expect(chip).toBeVisible({ timeout: 8000 });
    await chip.click();
    // The agent replies with the grounded offerings overview.
    await expect(
      page.getByText(/offerings? across \d+ type/i).first()
    ).toBeVisible({ timeout: 12000 });
  });

  test("253 — offerings are findable in global search (V20)", async ({
    request,
  }) => {
    const r = await (
      await request.get(`${BASE}/api/search?q=${encodeURIComponent("Freya Register")}`)
    ).json();
    expect(
      r.results.some(
        (x: any) => x.type === "Offering" && /Freya Register/.test(x.label)
      )
    ).toBe(true);
    // existing customer/contact search didn't regress
    const r2 = await (await request.get(`${BASE}/api/search?q=Helix`)).json();
    expect(r2.results.some((x: any) => x.type === "Customer")).toBe(true);
  });

  test("254 — agent answers offerings by availability (V21)", async ({
    request,
  }) => {
    const now = await (
      await request.post(`${BASE}/api/agent/converse`, {
        data: { mock: true, message: "which offerings are available now?" },
      })
    ).json();
    expect(now.source).toBe("offerings");
    expect(now.reply.toLowerCase()).toContain("available now");

    const soon = await (
      await request.post(`${BASE}/api/agent/converse`, {
        data: { mock: true, message: "what offerings are coming soon?" },
      })
    ).json();
    expect(soon.source).toBe("offerings");
    expect(soon.reply.toLowerCase()).toContain("coming up");
  });

  test("255 — agent answers offerings by sales material (V22)", async ({
    request,
  }) => {
    const vid = await (
      await request.post(`${BASE}/api/agent/converse`, {
        data: { mock: true, message: "which offerings have a demo video?" },
      })
    ).json();
    expect(vid.source).toBe("offerings");
    expect(vid.reply.toLowerCase()).toContain("video");

    const mat = await (
      await request.post(`${BASE}/api/agent/converse`, {
        data: { mock: true, message: "which offerings have sales materials?" },
      })
    ).json();
    expect(mat.source).toBe("offerings");
    expect(mat.reply.toLowerCase()).toContain("sales materials");
  });

  test("256 — offerings sort is deep-linkable (V23)", async ({ page }) => {
    const sortSel = 'select[aria-label="Sort offerings"]';
    await page.goto(`${BASE}/offerings?sort=name`);
    await expect(page.locator(sortSel)).toHaveValue("name");
    await page.goto(`${BASE}/offerings?sort=type`);
    await expect(page.locator(sortSel)).toHaveValue("type");
    // an unknown sort value falls back to catalog order
    await page.goto(`${BASE}/offerings?sort=bogus`);
    await expect(page.locator(sortSel)).toHaveValue("default");
  });

  test("257 — offering detail shows mapping status at a glance (V24)", async ({
    page,
  }) => {
    // of-001 (Freya Register) is seeded unmapped → badge present
    await page.goto(`${BASE}/offerings/of-001`);
    await expect(page.getByText("Not yet mapped")).toBeVisible();
    // of-003 is fully mapped → no badge
    await page.goto(`${BASE}/offerings/of-003`);
    await expect(page.getByText("Not yet mapped")).toHaveCount(0);
  });

  test("258 — Markets stat deep-links to the markets section (V25)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/offerings`);
    await expect(
      page.locator('a[href="/offerings/customer-types#markets"]')
    ).toBeVisible();
    // the anchor target exists on the management page
    await page.goto(`${BASE}/offerings/customer-types`);
    await expect(page.locator("#markets")).toBeVisible();
    await expect(
      page.locator("#markets").getByText(/Markets \(\d+\)/)
    ).toBeVisible();
  });

  test("259 — agent offerings suggestions never dead-end (V26)", async ({
    request,
  }) => {
    const overview = await (
      await request.post(`${BASE}/api/agent/converse`, {
        data: { mock: true, message: "what offerings do we have?" },
      })
    ).json();
    expect(overview.source).toBe("offerings");
    expect(overview.suggestions.length).toBeGreaterThan(0);
    // every suggested follow-up must itself be an answerable offerings query
    for (const s of overview.suggestions) {
      const r = await (
        await request.post(`${BASE}/api/agent/converse`, {
          data: { mock: true, message: s },
        })
      ).json();
      expect(r.source, `suggestion "${s}" should be answerable`).toBe(
        "offerings"
      );
    }
  });

  test("260 — bad links land on a branded 404 (V27)", async ({ page }) => {
    // Detail routes stream via loading.tsx, so notFound() renders the branded
    // page with a 200 (same as customers/contacts) — what matters is that the
    // user sees the branded not-found content and a way back, not Next's bare
    // default 404.
    await page.goto(`${BASE}/offerings/does-not-exist-xyz`);
    await expect(page.getByText(/We couldn.t find that page/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Back to dashboard/ })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Browse offerings/ })
    ).toBeVisible();
  });

  test("261 — new-offering form focuses the name field on empty submit (V28)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/offerings/new`);
    await page.getByRole("button", { name: /Save offering/i }).click();
    // submit is blocked and the required name field is focused so the user
    // knows exactly what to fix
    await expect(page).toHaveURL(/\/offerings\/new/);
    await expect(
      page.locator('input[placeholder="e.g. Freya Register"]')
    ).toBeFocused();
  });

  test("262 — half-filled material row blocks save instead of vanishing (V29)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/offerings/new`);
    await page
      .locator('input[placeholder="e.g. Freya Register"]')
      .fill("QA Material Guard");
    await page.getByRole("button", { name: /Add material/i }).click();
    await page.getByPlaceholder("Label").first().fill("Pricing deck");
    // URL intentionally left blank — must be flagged, not silently dropped
    await page.getByRole("button", { name: /Save offering/i }).click();
    await expect(page).toHaveURL(/\/offerings\/new/);
    await expect(page.getByText(/Add a link for/i)).toBeVisible();
  });

  test("263 — bare-domain material links get an https scheme (V30)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/offerings/new`);
    await page
      .locator('input[placeholder="e.g. Freya Register"]')
      .fill("QA URL Normalize");
    await page.getByRole("button", { name: /Add material/i }).click();
    await page.getByPlaceholder("Label").first().fill("Pricing deck");
    // bare domain, no scheme — must be saved as an absolute https link
    await page.getByPlaceholder("https://…").first().fill("example.com/pricing.pdf");
    await page.getByRole("button", { name: /Save offering/i }).click();
    await expect(page).toHaveURL(/\/offerings\/of-/);
    await expect(
      page.locator('a[href="https://example.com/pricing.pdf"]')
    ).toBeVisible();
  });

  test("264 — re-adding a customer type refines it, never duplicates (V31)", async ({
    request,
  }) => {
    const before = (
      await (await request.get(`${BASE}/api/customer-types`)).json()
    ).customerTypes;
    const res = await (
      await request.post(`${BASE}/api/customer-types`, {
        data: {
          family: "Pharmaceutical",
          size: "Small",
          operational_focus: "Refined by test",
        },
      })
    ).json();
    expect(res.ok).toBe(true);
    const after = (
      await (await request.get(`${BASE}/api/customer-types`)).json()
    ).customerTypes;
    // no duplicate row, and the existing definition was refined
    expect(after.length).toBe(before.length);
    const pharmaSmall = after.filter(
      (c: any) => c.name === "Pharmaceutical - Small"
    );
    expect(pharmaSmall.length).toBe(1);
    expect(pharmaSmall[0].operational_focus).toBe("Refined by test");
  });

  test("265 — removing an in-use market asks first (V32)", async ({ page }) => {
    await page.goto(`${BASE}/offerings/customer-types`);
    // Europe is mapped to offerings → X opens an inline confirm, nothing deleted
    await page.getByRole("button", { name: "Remove Europe" }).click();
    await expect(page.getByText(/Remove Europe\?/)).toBeVisible();
    await page.getByRole("button", { name: /^Keep$/ }).click();
    await expect(page.getByText(/Remove Europe\?/)).toHaveCount(0);
    const markets = (
      await (await page.request.get(`${BASE}/api/markets`)).json()
    ).markets;
    expect(markets.some((m: any) => m.name === "Europe")).toBe(true);
  });

  test("266 — offerings search reaches markets and customer types (V33)", async ({
    page,
  }) => {
    // "Europe" isn't in any offering name/type/description — only as a mapped
    // market — so a non-zero result proves search reaches the mapping, not just
    // the text fields (the false-negative that read as "search is broken").
    await page.goto(`${BASE}/offerings?q=Europe`);
    expect(
      await page.locator('a[href^="/offerings/of-"]').count()
    ).toBeGreaterThanOrEqual(3);
    // a genuine non-match still shows the empty state
    await page.goto(`${BASE}/offerings?q=zzznope`);
    await expect(page.locator('a[href^="/offerings/of-"]')).toHaveCount(0);
    await expect(page.getByText(/No offerings match/i)).toBeVisible();
  });

  test("267 — global search finds offerings by mapped market (V34)", async ({
    request,
  }) => {
    // "Europe" only appears as a mapped market, so offering hits prove global
    // search matches the mapping — consistent with the in-page offerings search.
    const r = await (await request.get(`${BASE}/api/search?q=Europe`)).json();
    const offerings = r.results.filter((x: any) => x.type === "Offering");
    expect(offerings.length).toBeGreaterThanOrEqual(3);
    // existing customer search by name still works (no regression)
    const helix = await (await request.get(`${BASE}/api/search?q=Helix`)).json();
    expect(helix.results.some((x: any) => x.type === "Customer")).toBe(true);
  });
});
