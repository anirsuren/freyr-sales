import { test, expect } from "@playwright/test";

/**
 * THE TOP-BAR SEARCH IS A DOORWAY TO THE AGENT.
 *
 * Type a question, press Enter, land in a NEW agent chat with that question
 * already asked (Anir: "like Gemini"). This regressed silently: the palette
 * stripped its entire Agent section whenever the workspace ran in the
 * offerings-only release, even after /agent shipped with the second rollout —
 * so on production the row simply was not there.
 *
 * The assertion is deliberately on the TOP BAR (the ⌘K field), not the
 * offerings page's own filter box. Both carry a "Search…" placeholder, and the
 * first version of this test typed into the wrong one and failed for the wrong
 * reason.
 */
test("top-bar search offers Ask the agent and Enter seeds the chat", async ({
  page,
}) => {
  await page.goto("/offerings");

  // The top bar is a BUTTON that opens the command palette; the palette then
  // renders its own input. (The offerings page also has a filter box with a
  // "Search…" placeholder, so a bare placeholder selector picks the wrong one.)
  // Scope to the input the palette AUTOFOCUSES. Selecting by placeholder is a
  // trap here: in the offerings-only release the palette and the offerings
  // page's own filter box carry the same "Search offerings…" text, and an
  // earlier version of this test typed into the filter behind the dropdown and
  // then asserted against a palette that had never seen the query.
  await page.getByRole("button", { name: /Search/i }).first().click();
  const palette = page.locator("input:focus");
  await expect(palette).toBeVisible({ timeout: 5000 });
  await palette.fill("tell me about the offerings");

  const ask = page.getByText(/Ask the agent/i).first();
  await expect(ask).toBeVisible({ timeout: 8000 });

  await ask.click();
  await page.waitForURL(/\/agent\?ask=/, { timeout: 8000 });

  // The question must actually be asked, not merely carried in the URL.
  await expect(
    page.getByText("tell me about the offerings").first()
  ).toBeVisible({ timeout: 15000 });
});
