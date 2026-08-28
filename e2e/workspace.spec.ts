import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("loads the opportunity workspace with its visible page header and without decorative numbering", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  const opportunitiesHeading = page.getByRole("heading", { level: 1, name: "Opportunities" });
  await expect(opportunitiesHeading).toBeVisible();
  await expect(page.getByText("The roles worth your attention", { exact: true })).toHaveCount(0);
  await expect(
    page.locator(
      ".jr-page-index, .nav-index, .filter-index, .section-index, .job-record-index, .source-record-index, .form-step",
    ),
  ).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Source coverage/i })).toBeVisible();
  const [pageHeader, toolbar] = await Promise.all([
    page.locator(".jr-page-header").boundingBox(),
    page.locator(".opportunity-toolbar").boundingBox(),
  ]);
  if (!pageHeader || !toolbar) {
    throw new Error("The Opportunities header and controls must be measurable.");
  }
  expect(toolbar.y).toBeGreaterThanOrEqual(pageHeader.y + pageHeader.height);
  await page.screenshot({ path: "test-results/opportunities-desktop.png", fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(opportunitiesHeading).toBeVisible();
  await page.screenshot({ path: "test-results/opportunities-desktop-dark.png", fullPage: true });
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(opportunitiesHeading).toBeVisible();
  await page.screenshot({ path: "test-results/opportunities-mobile.png", fullPage: true });
});

test("captures primary route review evidence at desktop and mobile widths", async ({ page }) => {
  const routes = [
    ["/", "Opportunities", "opportunities"],
    ["/profiles", "Profiles", "profiles"],
    ["/sources", "Sources and company boards", "sources"],
    ["/runs", "Discovery history", "runs"],
    ["/recruiter-research", "Recruiter research", "recruiter-research"],
    ["/settings", "Settings", "settings"],
  ] as const;

  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [path, heading, slug] of routes) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await page.screenshot({ path: `test-results/ui-review/${slug}-desktop.png`, fullPage: true });
  }

  await page.goto("/profiles");
  await page.locator(".profile-list").screenshot({
    path: "test-results/ui-review/profiles-action-rail-desktop.png",
  });
  await page.goto("/");
  await page.locator(".jr-page-header").screenshot({
    path: "test-results/ui-review/opportunities-header-desktop.png",
  });
  await page.goto("/settings");
  await page.getByLabel("Market vocabulary (JSON)").screenshot({
    path: "test-results/ui-review/settings-market-desktop.png",
  });
  await page.getByRole("group", { name: "Provider execution" }).screenshot({
    path: "test-results/ui-review/settings-provider-desktop.png",
  });
  await page
    .locator(".settings-text-grid")
    .filter({ has: page.getByLabel("Structured verification source IDs") })
    .screenshot({
      path: "test-results/ui-review/settings-verification-desktop.png",
    });

  await page.emulateMedia({ colorScheme: "dark" });
  for (const [path, heading, slug] of routes.filter(([, , slug]) =>
    ["opportunities", "profiles", "settings"].includes(slug),
  )) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await page.screenshot({
      path: `test-results/ui-review/${slug}-desktop-dark.png`,
      fullPage: true,
    });
  }
  await page.goto("/profiles");
  await page.locator(".profile-list").screenshot({
    path: "test-results/ui-review/profiles-action-rail-desktop-dark.png",
  });
  await page.goto("/");
  await page.locator(".jr-page-header").screenshot({
    path: "test-results/ui-review/opportunities-header-desktop-dark.png",
  });
  await page.goto("/settings");
  await page.getByLabel("Market vocabulary (JSON)").screenshot({
    path: "test-results/ui-review/settings-market-desktop-dark.png",
  });
  await page.getByRole("group", { name: "Provider execution" }).screenshot({
    path: "test-results/ui-review/settings-provider-desktop-dark.png",
  });
  await page
    .locator(".settings-text-grid")
    .filter({ has: page.getByLabel("Structured verification source IDs") })
    .screenshot({
      path: "test-results/ui-review/settings-verification-desktop-dark.png",
    });

  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, heading, slug] of routes) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await page.screenshot({ path: `test-results/ui-review/${slug}-mobile.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 1200 });
  await page.goto("/profiles");
  await page.locator(".profile-list").screenshot({
    path: "test-results/ui-review/profiles-action-rail-mobile.png",
  });
  await page.goto("/");
  await page.locator(".jr-page-header").screenshot({
    path: "test-results/ui-review/opportunities-header-mobile.png",
  });
  await page.goto("/settings");
  await page.getByLabel("Market vocabulary (JSON)").screenshot({
    path: "test-results/ui-review/settings-market-mobile.png",
  });
  await page.getByRole("group", { name: "Provider execution" }).screenshot({
    path: "test-results/ui-review/settings-provider-mobile.png",
  });
  await page
    .locator(".settings-text-grid")
    .filter({ has: page.getByLabel("Structured verification source IDs") })
    .screenshot({
      path: "test-results/ui-review/settings-verification-mobile.png",
    });
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
