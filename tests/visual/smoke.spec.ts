import { test, expect } from "@playwright/test";

test("home page renders primary UI", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#scene")).toBeVisible();
  await expect(page.locator("#planetNav")).toBeVisible();
  await expect(page.locator("#uiControlsPanel")).toBeVisible();
});
