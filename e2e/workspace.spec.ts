import { expect, test } from "@playwright/test";

test("loads the opportunity workspace and route index", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "The roles worth your attention" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Source coverage/i })).toBeVisible();
});

test("cycles the local theme preference without changing workspace data", async ({ page }) => {
  await page.goto("/");

  const themeToggle = page.getByRole("button", { name: /Theme: system/i });
  await themeToggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: /Theme: light/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
