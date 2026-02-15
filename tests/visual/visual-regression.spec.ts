import { test, expect } from "@playwright/test";

const VIEWPORT = { width: 1440, height: 900 };

test.describe("visual regression", () => {
  test.use({ viewport: VIEWPORT });

  test("inner system view", async ({ page }) => {
    await page.goto("/?seed=123456&quality=medium&autorotate=off&staticFrame=1&ciVisual=1&workerClouds=off");
    await page.waitForTimeout(1200);
    await expect(page).toHaveScreenshot("inner-system.png", {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    });
  });

  test("galaxy view", async ({ page }) => {
    await page.goto("/?view=galaxy&seed=123456&quality=medium&autorotate=off&staticFrame=1&ciVisual=1&workerClouds=off");
    await page.waitForTimeout(1200);
    await expect(page).toHaveScreenshot("galaxy-view.png", {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    });
  });

  test("universe view", async ({ page }) => {
    await page.goto("/?view=universe&seed=123456&quality=medium&autorotate=off&staticFrame=1&ciVisual=1&workerClouds=off");
    await page.waitForTimeout(1200);
    await expect(page).toHaveScreenshot("universe-view.png", {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    });
  });
});
