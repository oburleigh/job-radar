import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("keeps personal and system controls in the masthead without crowding primary navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  await expect(page.getByText("Local workspace", { exact: true })).toHaveCount(0);
  const profileMenu = page.getByRole("button", { name: "Search profiles" });
  const activity = page.getByRole("link", { name: "Activity" });
  const settings = page.getByRole("link", { name: "System settings" });
  await expect(profileMenu).toBeVisible();
  await expect(settings).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link"),
  ).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Opportunities", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Recruiter Search" })).toBeVisible();
  await expect(activity).toBeVisible();
  await activity.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Activity");
  await activity.focus();
  await expect(page.getByRole("tooltip")).toHaveText("Activity");
  await page.screenshot({ path: "test-results/ui-review/activity-tooltip-desktop.png" });
  await expect(page.getByRole("link", { name: "Source coverage" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Discovery runs" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Recruiter research" })).toHaveCount(0);

  await profileMenu.click();
  const profileLink = page.getByRole("menuitem", { name: "Search profiles" });
  await expect(profileLink).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(profileLink).toHaveCount(0);
  await expect(activity).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(settings).toBeFocused();

  await profileMenu.click();
  await expect(profileLink).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(profileMenu).toBeFocused();

  await profileMenu.press("Enter");
  await profileLink.click();
  await expect(page).toHaveURL("/profiles");
  await expect(page.getByRole("heading", { level: 1, name: "Search profiles" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Profiles", exact: true })).toHaveCount(
    0,
  );
  await expect(profileMenu).toHaveAttribute("aria-current", "page");

  await settings.click();
  await expect(page).toHaveURL("/settings/opportunities");
  await expect(settings).toHaveAttribute("aria-current", "page");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link"),
  ).toHaveCount(2);
  await expect(profileMenu).toBeVisible();
  await expect(settings).toBeVisible();
});

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
  await expect(page.getByRole("link", { name: "Recruiter Search" })).toBeVisible();
  const profileSelect = page.getByRole("combobox", { name: "Search profile" });
  const profileName = await profileSelect.locator("option:checked").textContent();
  if (!profileName) {
    throw new Error("The selected search profile must have a visible name.");
  }
  await expect(page.getByText(profileName, { exact: true })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 2, name: "Matches" })).toBeVisible();
  await expect(page.getByText("Matched roles", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Personal shortlist", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Application tracker", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Active coverage", { exact: true })).toHaveCount(0);

  await page.getByRole("combobox", { name: "Web search provider" }).selectOption("serpapi");
  await expect(page.getByText("Company boards will run without web search.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Configure Google via SerpAPI" })).toBeVisible();
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
  const mobileMatches = await page
    .getByRole("heading", { level: 2, name: "Matches" })
    .boundingBox();
  if (!mobileMatches) {
    throw new Error("The mobile result heading must be measurable.");
  }
  /*
   * Measured against the navigation rather than the viewport. `776` was a bare number calibrated
   * to a denser layout, and the viewport height is not the contract either: the fixed bar covers
   * the last bar-height of it, so a heading sitting entirely behind the bar is inside the
   * viewport and still unreadable.
   */
  const mobileNavigation = await page
    .getByRole("navigation", { name: "Primary navigation" })
    .boundingBox();
  if (!mobileNavigation) {
    throw new Error("The fixed mobile navigation must be measurable.");
  }
  expect(mobileMatches.y + mobileMatches.height).toBeLessThanOrEqual(mobileNavigation.y);
  await page.screenshot({ path: "test-results/opportunities-mobile.png", fullPage: true });
});

test("keeps the workspace aligned when routes gain or lose a vertical scrollbar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/settings/recruiter-search/public-search");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.locator("html")).toHaveCSS("scrollbar-gutter", "stable");
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
  ).toBe(true);
  const shortPage = await page.locator(".page").boundingBox();

  await page.goto("/settings/adapters/source-coverage");
  await expect(page.getByRole("heading", { level: 2, name: "Source Coverage" })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight),
  ).toBe(true);
  const longPage = await page.locator(".page").boundingBox();

  if (!shortPage || !longPage) {
    throw new Error("Both workspace layouts must be measurable.");
  }
  expect(Math.abs(longPage.x - shortPage.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(longPage.width - shortPage.width)).toBeLessThanOrEqual(1);
});

test("opens the ATS integration editor where the action is presented", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/settings/adapters/ats-registry");

  await expect(page.getByText("SQLite backed", { exact: true })).toHaveCount(0);
  await expect(page.getByText("No restart required", { exact: true })).toHaveCount(0);
  await expect(page.locator(".jr-page-header").getByRole("link")).toHaveCount(0);
  await page.screenshot({ path: "test-results/settings-actions-desktop.png", fullPage: true });

  const addIntegration = page.getByRole("link", { name: "Add integration" });
  await addIntegration.click();

  await expect(page).toHaveURL(/\/settings\/adapters\/ats-registry\?new=1#ats-integration-editor$/);
  const integrationId = page.getByRole("textbox", { name: /^Integration ID\b/ });
  await expect(integrationId).toBeFocused();
  await expect(integrationId).toBeInViewport();
  await page.screenshot({
    path: "test-results/settings-integration-editor-desktop.png",
    fullPage: true,
  });
});

test("keeps settings in stable sections without carrying opportunity selection", async ({
  page,
}) => {
  await page.goto("/?profile=1&provider=serper");
  await page.getByRole("link", { name: "System settings" }).click();

  await expect(page).toHaveURL("/settings/opportunities");
  const settingsNavigation = page.getByRole("navigation", { name: "Settings", exact: true });
  await expect(settingsNavigation.getByRole("link")).toHaveCount(3);
  await expect(page.getByRole("heading", { level: 2, name: "Opportunity settings" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Recruiter Search settings" }),
  ).toHaveCount(0);
  const [desktopSettingsNavigation, desktopOpportunitySettings] = await Promise.all([
    settingsNavigation.boundingBox(),
    page.getByRole("heading", { level: 2, name: "Opportunity settings" }).boundingBox(),
  ]);
  if (!desktopSettingsNavigation || !desktopOpportunitySettings) {
    throw new Error("Settings navigation and section heading must be measurable.");
  }
  expect(desktopOpportunitySettings.y).toBeGreaterThanOrEqual(
    desktopSettingsNavigation.y + desktopSettingsNavigation.height,
  );

  await settingsNavigation.getByRole("link", { name: "Recruiter Search" }).click();
  await expect(page).toHaveURL("/settings/recruiter-search/research-criteria");
  await expect(
    page.getByRole("heading", { level: 2, name: "Recruiter Search settings" }),
  ).toBeVisible();
  const recruiterSettingsNavigation = page.getByRole("navigation", {
    name: "Recruiter Search settings",
  });
  await expect(recruiterSettingsNavigation.getByRole("link")).toHaveCount(4);
  await expect(
    recruiterSettingsNavigation.getByRole("link", { name: "Research execution" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Research criteria" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save public search settings" })).toHaveCount(0);

  await settingsNavigation.getByRole("link", { name: "Adapters" }).click();
  await expect(page).toHaveURL("/settings/adapters/source-coverage");
  await expect(settingsNavigation.getByRole("link", { name: "Adapters" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("link", { name: "Source Coverage" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("heading", { level: 2, name: "Source Coverage" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ATS Registry" })).toBeVisible();
  const adapterNavigation = page.getByRole("navigation", { name: "Adapter settings" });
  await expect(adapterNavigation.getByRole("link")).toHaveCount(2);

  await adapterNavigation.getByRole("link", { name: "ATS Registry" }).click();
  await expect(page).toHaveURL("/settings/adapters/ats-registry");
  await expect(page.getByRole("heading", { level: 2, name: "ATS Registry" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const [mobileSettingsNavigation, mobileAdapterSettings] = await Promise.all([
    settingsNavigation.boundingBox(),
    page.getByRole("heading", { level: 2, name: "ATS Registry" }).boundingBox(),
  ]);
  if (!mobileSettingsNavigation || !mobileAdapterSettings) {
    throw new Error("Mobile settings navigation and section heading must be measurable.");
  }
  expect(mobileSettingsNavigation.x).toBeGreaterThanOrEqual(0);
  expect(mobileSettingsNavigation.x + mobileSettingsNavigation.width).toBeLessThanOrEqual(390);
  expect(mobileAdapterSettings.y).toBeGreaterThanOrEqual(
    mobileSettingsNavigation.y + mobileSettingsNavigation.height,
  );
});

test("captures primary route review evidence at desktop and mobile widths", async ({ page }) => {
  const routes = [
    ["/", "Opportunities", "opportunities"],
    ["/profiles", "Search profiles", "profiles"],
    ["/activity", "Activity", "activity"],
    ["/recruiter-search", "Recruiter Search", "recruiter-search"],
    ["/settings/opportunities", "Settings", "settings"],
    ["/settings/recruiter-search", "Settings", "recruiter-settings"],
    ["/settings/recruiter-search/execution", "Settings", "recruiter-execution-settings"],
    ["/settings/adapters/source-coverage", "Settings", "source-coverage"],
    ["/settings/adapters/ats-registry", "Settings", "ats-registry"],
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
  await page.goto("/settings/opportunities");
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
  for (const [path, heading, slug] of routes) {
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
  await page.goto("/settings/opportunities");
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
  await page.goto("/settings/opportunities");
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

/**
 * Every primary route, not three of them. A hand-written contrast table measures the pairs its
 * author thought of; axe measures what the page actually painted, and it is what found
 * `accent-strong` on `accent-subtle` failing across 67 elements after the token table reported
 * green.
 *
 * One navigation per distinct surface, with both themes analysed in place. `/settings/recruiter-search`
 * is absent because its index redirects to the research-criteria route already listed, so
 * scanning both scanned one rendered page twice. The final URL is asserted so a future redirect
 * cannot quietly reintroduce that.
 */
const primaryRoutes = [
  "/",
  "/profiles",
  "/activity",
  "/recruiter-search",
  "/settings/opportunities",
  "/settings/recruiter-search/research-criteria",
  "/settings/recruiter-search/public-search",
  "/settings/recruiter-search/directory-ranking",
  "/settings/recruiter-search/execution",
  "/settings/adapters/source-coverage",
  "/settings/adapters/ats-registry",
] as const;

test("has no automated accessibility violations on any route in either theme", async ({ page }) => {
  const offenders: string[] = [];

  for (const route of primaryRoutes) {
    await page.goto(route);
    expect(new URL(page.url()).pathname, `${route} must not redirect`).toBe(route);

    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((selected) => {
        document.documentElement.dataset.theme = selected;
      }, theme);
      const { violations } = await new AxeBuilder({ page }).analyze();
      for (const violation of violations) {
        offenders.push(`${route} ${theme}: ${violation.id} (${violation.nodes.length} nodes)`);
      }
    }
  }

  expect(offenders).toEqual([]);
});

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

test("names each destination the same at every width", async ({ page }) => {
  await page.goto("/");

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });

    await expect(
      page.getByRole("link", { name: "Opportunities", exact: true }),
      `Opportunities is not named at ${width}px`,
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Recruiter Search", exact: true }),
      `Recruiter Search is not named at ${width}px`,
    ).toBeVisible();

    // The narrow layout used to carry its own shorter names, so a reader who learned the product
    // on a desktop met two different words for the same two destinations on a phone.
    await expect(
      page.getByRole("link", { name: "Jobs", exact: true }),
      `the rejected alias "Jobs" is still shown at ${width}px`,
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Recruiters", exact: true }),
      `the rejected alias "Recruiters" is still shown at ${width}px`,
    ).toHaveCount(0);
  }
});
