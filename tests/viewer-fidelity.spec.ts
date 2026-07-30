import { test, expect } from "@playwright/test";
const BASE = `http://127.0.0.1:${process.env.PORT || 3001}`;

// Runs against the LIVE-mode dev server (:3001) where Eswar's real files are.
test("a docx renders as a document and a pptx renders as slides", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`${BASE}/offerings/of-001`);

  // Word: docx-preview emits .docx-wrapper containing real <section> pages.
  await page.getByText("RIMS Product Brief").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const docxPages = dialog.locator(".docx-wrapper section, .docx-wrapper .docx");
  await expect(docxPages.first()).toBeVisible({ timeout: 60_000 });
  console.log("docx page elements rendered:", await docxPages.count());
  // Real images/tables from the file, not plain text.
  console.log("  images:", await dialog.locator(".docx-wrapper img").count(),
              "| tables:", await dialog.locator(".docx-wrapper table").count());
  await page.keyboard.press("Escape");

  // PowerPoint: pptx-preview draws slide containers with positioned content.
  await page.getByText("Sales Deck - Short").first().click();
  const deck = page.getByRole("dialog");
  await expect(deck).toBeVisible();
  const canvasish = deck.locator(".material-pptx div, .material-pptx canvas, .material-pptx svg");
  await expect(canvasish.first()).toBeVisible({ timeout: 60_000 });
  console.log("pptx rendered nodes:", await canvasish.count());
});
