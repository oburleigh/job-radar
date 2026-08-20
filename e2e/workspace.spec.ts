import AxeBuilder from "@axe-core/playwright";
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

test("resolves semantic colour tokens in light and dark themes", async ({ page }) => {
  await page.goto("/");

  const light = await resolvedThemeColours(page);
  await page.getByRole("button", { name: /Theme: system/i }).click();
  await page.getByRole("button", { name: /Theme: light/i }).click();
  const dark = await resolvedThemeColours(page);

  expect(light.canvas).toMatch(/^(?:oklch|rgb)a?\(/);
  expect(light.text).toMatch(/^(?:oklch|rgb)a?\(/);
  expect(dark.canvas).not.toBe(light.canvas);
  expect(dark.text).not.toBe(light.text);
});

for (const theme of ["light", "dark"] as const) {
  test(`has no automated accessibility violations in ${theme} mode`, async ({ page }) => {
    await page.addInitScript((selectedTheme) => {
      window.localStorage.setItem("job-radar-theme", selectedTheme);
    }, theme);
    await page.goto("/");

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
}

async function resolvedThemeColours(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.background = "var(--jr-color-canvas)";
    probe.style.color = "var(--jr-color-text)";
    document.body.appendChild(probe);
    const styles = getComputedStyle(probe);
    const colours = { canvas: styles.backgroundColor, text: styles.color };
    probe.remove();
    return colours;
  });
}
