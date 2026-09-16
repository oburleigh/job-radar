import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, type Request, test } from "@playwright/test";

async function setDocumentVisibility(page: Page, state: "hidden" | "visible"): Promise<void> {
  await page.evaluate((visibilityState) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

const fixtureUrl = "http://127.0.0.1:3200";

async function captureCommandCenter(page: Page, surface: string): Promise<void> {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const { violations } = await new AxeBuilder({ page })
        .include("main")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        violations.map(({ id }) => id),
        `${surface} ${width} ${theme}`,
      ).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      await page.screenshot({
        path: `reports/adm440-visual/${surface}-${width}-${theme}.png`,
        fullPage: true,
      });
      await page
        .getByRole("main")
        .screenshot({ path: `reports/adm440-visual/${surface}-${width}-${theme}-content.png` });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
}

async function requestAdvisorWithFeedback(
  page: Page,
  region: Locator,
  input: {
    intent: string;
    button: string;
    pendingButton: string;
    message: string;
  },
): Promise<void> {
  const pattern = `**${new URL(page.url()).pathname}*`;
  let release = () => {};
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(pattern, async (route) => {
    if (route.request().method() === "POST" && route.request().postData()?.includes(input.intent))
      await paused;
    await route.continue();
  });
  const response = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      Boolean(response.request().postData()?.includes(input.intent)),
  );
  try {
    await region.getByRole("button", { name: input.button, exact: true }).click();
    const button = region.getByRole("button", { name: input.pendingButton, exact: true });
    await expect(button).toBeDisabled();
    const status = button.locator("..").getByRole("status");
    await expect(status).toHaveText(input.message);
    const [statusBox, buttonBox] = await Promise.all([status.boundingBox(), button.boundingBox()]);
    if (!statusBox || !buttonBox) throw new Error("Advisor feedback must have visible geometry");
    expect(statusBox.y + statusBox.height).toBeLessThanOrEqual(buttonBox.y);
  } finally {
    release();
    await response;
    await page.unroute(pattern);
  }
}

async function captureRegion(page: Page, region: Locator, surface: string): Promise<void> {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      await region.scrollIntoViewIfNeeded();
      const box = await region.boundingBox();
      if (!box) throw new Error(`Missing ${surface} geometry`);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await region.screenshot({
        path: `reports/adm440-visual/${surface}-${width}-${theme}-region.png`,
      });
      await page.screenshot({
        path: `reports/adm440-visual/${surface}-${width}-${theme}-viewport.png`,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
}

test.use({
  launchOptions: {
    args: ["--host-resolver-rules=MAP job-radar.test 127.0.0.1", "--no-proxy-server"],
  },
});

test("completes discovery and triage while profile editing remains responsive", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  expect((await request.post(`${fixtureUrl}/control/reset-success`)).ok()).toBe(true);
  await configureDiscoveryFixtures(page);
  await disableAllKnownBoards(page);
  const otherProfile = await createProfile(page);
  const { id: profileId, name: profileName } = await createProfile(page);

  await page.goto("/opportunities");
  await expect(page).toHaveURL(/[?&]profile=\d+.*[?&]provider=[^&]+/);

  await page.goto("/?profile=999999&provider=missing");
  const canonicalUrl = new URL(page.url());
  await expect(page.getByRole("combobox", { name: "Search profile" })).toHaveValue(
    canonicalUrl.searchParams.get("profile") ?? "",
  );
  await expect(page.getByRole("combobox", { name: "Web search provider" })).toHaveValue(
    canonicalUrl.searchParams.get("provider") ?? "",
  );
  expect(canonicalUrl.searchParams.get("profile")).not.toBe("999999");
  expect(canonicalUrl.searchParams.get("provider")).not.toBe("missing");

  await page.goto(`/opportunities?profile=${profileId}&provider=serper`);
  const discoveryControls = page.getByRole("region", {
    name: "Discovery controls",
  });
  const controlBoxes = await Promise.all([
    discoveryControls.getByLabel("Search profile").boundingBox(),
    discoveryControls.getByLabel("Web search provider").boundingBox(),
    discoveryControls.getByRole("button", { name: "Run discovery" }).boundingBox(),
  ]);
  if (controlBoxes.some((box) => box === null)) {
    throw new Error("Discovery controls must be measurable.");
  }
  const controlCenters = controlBoxes.map((box) => (box?.y ?? 0) + (box?.height ?? 0) / 2);
  expect(Math.max(...controlCenters) - Math.min(...controlCenters)).toBeLessThanOrEqual(2);
  await page.screenshot({
    animations: "disabled",
    caret: "hide",
    fullPage: true,
    path: "test-results/opportunities-discovery-controls.png",
  });

  let releaseProviderNavigation = () => {};
  let providerNavigationIntercepted = false;
  const providerNavigationGate = new Promise<void>((resolve) => {
    releaseProviderNavigation = resolve;
  });
  await page.route("**/*provider=brave*", async (route) => {
    if (route.request().resourceType() !== "fetch") {
      await route.continue();
      return;
    }
    providerNavigationIntercepted = true;
    await providerNavigationGate;
    await route.continue();
  });
  const selectBrave = page.getByLabel("Web search provider").selectOption("brave");
  try {
    await expect.poll(() => providerNavigationIntercepted).toBe(true);
    await expect(page.getByRole("button", { name: "Run discovery" })).toBeDisabled();
  } finally {
    releaseProviderNavigation();
  }
  await selectBrave;
  await page.unroute("**/*provider=brave*");
  await expect(page).toHaveURL(new RegExp(`[?&]profile=${profileId}(?:&|$).*provider=brave`));
  await page.getByLabel("Web search provider").selectOption("serpapi");
  await expect(page.getByRole("button", { name: "Run discovery" })).toBeDisabled();
  await expect(
    discoveryControls.getByRole("link", { name: "Enable a company board" }),
  ).toHaveAttribute("href", "/settings/adapters/source-coverage");
  await page.getByLabel("Web search provider").selectOption("serper");
  await expect(page).toHaveURL(new RegExp(`[?&]profile=${profileId}(?:&|$).*provider=serper`));
  await page
    .getByRole("combobox", { name: "Search profile" })
    .selectOption(String(otherProfile.id));
  await expect(page).toHaveURL(
    new RegExp(`[?&]profile=${otherProfile.id}(?:&|$).*provider=serper`),
  );
  await page.getByRole("combobox", { name: "Search profile" }).selectOption(String(profileId));
  await expect(page).toHaveURL(new RegExp(`[?&]profile=${profileId}(?:&|$).*provider=serper`));

  await configureSerperEndpoint(page, `${fixtureUrl}/serper/success`);
  await page.goto("/settings/adapters/ats-registry?ats=greenhouse");
  await page.getByRole("link", { name: /Greenhouse/ }).click();
  await expect(page).toHaveURL("/settings/adapters/ats-registry?ats=greenhouse");

  await page.getByRole("link", { name: "Add integration" }).click();
  await expect(page).toHaveURL(/\/settings\/adapters\/ats-registry\?new=1/);
  const integrationId = `e2e-${crypto.randomUUID().slice(0, 8)}`;
  const integrationHost = `${integrationId}.example.com`;
  await page.getByRole("textbox", { name: /^Integration ID\b/ }).fill(integrationId);
  await page.getByLabel("Display name").fill(`E2E ${integrationId}`);
  await page.getByLabel("Source patterns, one per line").fill(integrationHost);
  await page.getByLabel("Exact hostnames").fill(integrationHost);
  await page.getByRole("button", { name: "Add integration" }).click();
  await expect(page).toHaveURL(`/settings/adapters/ats-registry?ats=${integrationId}`);
  await expect(
    page.getByRole("heading", { level: 3, name: `E2E ${integrationId}` }).first(),
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Opportunities", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Search profile" }).selectOption(String(profileId));
  await page.getByLabel("Web search provider").selectOption("serper");
  await expect(page).toHaveURL(new RegExp(`[?&]profile=${profileId}(?:&|$).*provider=serper`));
  await expect(page.getByRole("combobox", { name: "Web search provider" })).toHaveValue("serper");

  const startedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/discovery-runs",
  );
  const startedRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" && new URL(request.url()).pathname === "/api/discovery-runs",
  );
  let releaseStartRequest = () => {};
  const startRequestGate = new Promise<void>((resolve) => {
    releaseStartRequest = resolve;
  });
  await page.route("**/api/discovery-runs", async (route) => {
    if (route.request().method() === "POST") {
      await startRequestGate;
    }
    await route.continue();
  });
  const runningNotice = page.getByRole("status").filter({ hasText: "Discovery running" });
  const startDiscovery = page.getByRole("button", { name: "Run discovery" }).click();
  const noticeStartedAt = Date.now();
  try {
    await expect(runningNotice).toContainText(profileName, { timeout: 500 });
  } finally {
    releaseStartRequest();
  }
  await startDiscovery;
  await page.unroute("**/api/discovery-runs");
  expect((await startedRequest).postDataJSON()).toEqual({
    profileId,
    provider: "serper",
  });
  const response = await startedResponse;
  expect(response.status()).toBe(202);
  const started = (await response.json()) as { runId: number };

  await expect(runningNotice).toContainText(profileName);
  const runningToast = page.locator("[data-sonner-toast]").filter({ has: runningNotice });
  await expect(runningToast).toHaveCSS("animation-delay", "3s");
  await expect(runningToast).toHaveCSS("animation-duration", "0.3s");
  await expect(runningToast).toHaveCSS("animation-name", "discovery-notice-exit");
  const activeActivity = page.getByRole("link", { name: "Activity, 1 active run" });
  await expect(activeActivity).toBeVisible();
  const [activityIconBox, activityBadgeBox] = await Promise.all([
    activeActivity.locator("svg").boundingBox(),
    activeActivity.locator(".jr-notification-badge").boundingBox(),
  ]);
  if (!activityIconBox || !activityBadgeBox) {
    throw new Error("The Activity icon and notification badge must be measurable.");
  }
  expect(activityBadgeBox.width).toBeLessThan(activityIconBox.width);
  expect(activityBadgeBox.height).toBeLessThan(activityIconBox.height);
  expect(activityBadgeBox.x).toBeGreaterThan(activityIconBox.x + activityIconBox.width / 2);
  expect(activityBadgeBox.y).toBeLessThan(activityIconBox.y + activityIconBox.height / 2);
  await page.screenshot({ path: "test-results/ui-review/discovery-running-desktop.png" });
  await expect(runningNotice).toHaveCount(0, { timeout: 4_500 });
  expect(Date.now() - noticeStartedAt).toBeGreaterThanOrEqual(3_000);

  await activeActivity.click();
  const activeCard = page.getByRole("article", { name: `Discovery Run #${started.runId}` });
  const runningLink = page.getByRole("link", {
    name: `Run #${started.runId} Running`,
    exact: true,
  });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(runningLink).toBeVisible();
      await expect(runningLink).toHaveCSS("border-radius", "6px");
      const colours = await runningLink.evaluate((element) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--jr-color-text-muted)";
        element.append(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return { actual: getComputedStyle(element).color, expected };
      });
      expect(colours.actual).toBe(colours.expected);
      await expect(activeCard).toHaveCSS("border-radius", "12px");
      await expect(activeCard).toHaveCSS("border-width", "1px");
      await expect(activeCard).toHaveCSS("border-style", "solid");
      const borderColours = await activeCard.evaluate((element) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--jr-color-border-strong)";
        element.append(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return { actual: getComputedStyle(element).borderColor, expected };
      });
      expect(borderColours.actual).toBe(borderColours.expected);
      const box = await activeCard.boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: `test-results/ui-review/activity-running-${width}-${theme}.png`,
        fullPage: true,
      });
      await activeCard.screenshot({
        path: `test-results/ui-review/active-card-${width}-${theme}.png`,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await page.goto(`/opportunities?profile=${profileId}&provider=serper`);

  await expect(
    page.getByRole("button", { name: `Cancel discovery #${started.runId}` }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Search profiles" }).click();
  await page.getByRole("menuitem", { name: "Search profiles" }).click();
  await page.getByLabel("Required job keywords, one per line").fill("platform");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Cancel discovery #${started.runId}` }),
  ).toHaveCount(0);
  expect((await request.post(`${fixtureUrl}/control/release-success`)).ok()).toBe(true);

  const completedNotice = page.getByRole("status").filter({ hasText: "Discovery completed" });
  await expect(completedNotice).toContainText(
    `${profileName}: 0 boards completed, 2 jobs changed, web coverage completed, and 1 current profile match`,
    { timeout: 30_000 },
  );
  await completedNotice.getByRole("link", { name: "View results" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Head of Engineering" })).toBeVisible();
  await expect(page.getByText("Live listing", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Ranked opportunities").getByText("Greenhouse", { exact: true }),
  ).toBeVisible();
  const opportunityCards = page
    .getByRole("region", { name: "Ranked opportunities" })
    .getByRole("article");
  const opportunityCount = await opportunityCards.count();
  expect(opportunityCount).toBeGreaterThan(0);
  for (let index = 0; index < opportunityCount; index += 1) {
    const opportunityCard = opportunityCards.nth(index);
    await expect(
      opportunityCard.getByRole("link", { name: "Start Application", exact: true }),
    ).toHaveAttribute("href", /^\/applications\/new\?searchProfileId=\d+&jobListingId=\d+$/);
    await expect(
      opportunityCard.getByRole("button", { name: "Mark as applied", exact: true }),
    ).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Dismiss discovery notification" }).click();

  const opportunityReviewPath = await opportunityCards
    .first()
    .getByRole("link", { name: "Review Opportunity" })
    .getAttribute("href");
  if (!opportunityReviewPath) throw new Error("Expected the Opportunity detail link");
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Today", exact: true })
    .click();
  const prioritySection = page.getByRole("region", { name: "Priority Opportunities" });
  await expect(
    prioritySection.getByRole("link", { name: "Head of Engineering" }).first(),
  ).toBeVisible();
  await captureCommandCenter(page, "today-priorities");
  await prioritySection.locator(`a[href="${opportunityReviewPath}"]`).click();
  await expect(page.getByRole("heading", { name: "Opportunity facts" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Job description", exact: true })).toContainText(
    "Lead the platform engineering organisation.",
  );
  await expect(page.getByRole("link", { name: "Enable Advisor in Settings" })).toBeVisible();
  await captureCommandCenter(page, "opportunity-detail");
  await page.goto("/settings/opportunities");
  await page.getByRole("checkbox", { name: "Enable local Advisor" }).check();
  await page.getByLabel("Advisor model", { exact: false }).fill("fixture-advisor-failure");
  await page.getByRole("button", { name: "Save Advisor settings", exact: true }).click();
  await expect(page.getByText("Advisor settings saved.", { exact: true })).toBeVisible();
  await page.goto(opportunityReviewPath);
  await requestAdvisorWithFeedback(
    page,
    page.getByRole("region", { name: "Opportunity assessment", exact: true }),
    {
      intent: "assess-opportunity",
      button: "Request assessment",
      pendingButton: "Assessing Opportunity",
      message: "Assessing Opportunity with the local Advisor.",
    },
  );
  await expect(page.getByRole("alert")).toContainText("Fixture Advisor unavailable.");
  await page.goto("/activity");
  await expect(page.getByRole("row").filter({ hasText: "fixture-advisor-failure" })).toContainText(
    "Failed",
  );
  await page.goto("/settings/opportunities");
  await page.getByLabel("Advisor model", { exact: false }).fill("fixture-advisor-success");
  await page.getByRole("button", { name: "Save Advisor settings", exact: true }).click();
  await expect(page.getByText("Advisor settings saved.", { exact: true })).toBeVisible();
  await page.goto(opportunityReviewPath);
  await requestAdvisorWithFeedback(
    page,
    page.getByRole("region", { name: "Opportunity assessment", exact: true }),
    {
      intent: "assess-opportunity",
      button: "Request assessment",
      pendingButton: "Assessing Opportunity",
      message: "Assessing Opportunity with the local Advisor.",
    },
  );
  await expect(page.getByText("Opportunity assessment completed.", { exact: true })).toBeVisible();
  const summary = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Advisor summary", exact: true }) })
    .last();
  await expect(
    summary.getByText("The listing advertises an engineering leadership role.", { exact: true }),
  ).toBeVisible();
  await expect
    .soft(summary.getByRole("link", { name: "Open supporting evidence" }))
    .toHaveAttribute("href", "https://boards.greenhouse.io/acme-fixture/jobs/12345");
  for (const title of ["Strengths", "Gaps to resolve"]) {
    const section = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
      .last();
    await expect(section.getByRole("link", { name: "Open supporting evidence" })).toHaveAttribute(
      "href",
      "https://boards.greenhouse.io/acme-fixture/jobs/12345",
    );
  }
  await captureCommandCenter(page, "opportunity-assessed");
  await captureRegion(
    page,
    page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "Advisor summary", exact: true }) }),
    "assessment",
  );
  await page.goto("/activity");
  const assessmentAttempt = page.getByRole("row").filter({ hasText: "fixture-advisor-success" });
  await expect(assessmentAttempt).toContainText("Completed");
  await expect(assessmentAttempt.getByRole("link", { name: /^Retry of #/ })).toHaveAttribute(
    "href",
    /#advisor-\d+$/,
  );
  await captureRegion(page, page.getByRole("region", { name: "Run history" }), "advisor-history");
  await page.goto("/settings/opportunities");
  await page.getByRole("checkbox", { name: "Enable local Advisor" }).uncheck();
  await page.getByRole("button", { name: "Save Advisor settings", exact: true }).click();
  await expect(page.getByText("Advisor settings saved.", { exact: true })).toBeVisible();

  await page.goto(`/opportunities?profile=${profileId}&provider=serper`);

  await opportunityCards
    .first()
    .getByRole("link", { name: "Start Application", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/applications/new\\?searchProfileId=${profileId}&jobListingId=\\d+$`),
  );
  await expect(page.getByRole("heading", { level: 1, name: "Start Application" })).toBeVisible();
  await expect(
    page.getByText("Head of Engineering at Acme Fixture", { exact: true }),
  ).toBeVisible();
  const opportunitySnapshotHeading = page.getByRole("heading", {
    level: 2,
    name: "Opportunity snapshot",
  });
  const applicationStartHeading = page.getByRole("heading", {
    level: 2,
    name: "Application start",
  });
  const [desktopSnapshot, desktopDecision] = await Promise.all([
    opportunitySnapshotHeading.boundingBox(),
    applicationStartHeading.boundingBox(),
  ]);
  if (!desktopSnapshot || !desktopDecision) {
    throw new Error("The desktop Application start layout must be measurable.");
  }
  expect(Math.abs(desktopSnapshot.y - desktopDecision.y)).toBeLessThanOrEqual(24);
  expect(desktopSnapshot.x + desktopSnapshot.width).toBeLessThan(desktopDecision.x);

  await page.setViewportSize({ width: 390, height: 844 });
  const startApplicationButton = page.getByRole("button", {
    name: "Start Application",
    exact: true,
  });
  await startApplicationButton.scrollIntoViewIfNeeded();
  const [mobileSnapshot, mobileDecision, mobileSubmit, mobileNavigation] = await Promise.all([
    opportunitySnapshotHeading.boundingBox(),
    applicationStartHeading.boundingBox(),
    startApplicationButton.boundingBox(),
    page.getByRole("navigation", { name: "Primary navigation" }).boundingBox(),
  ]);
  if (!mobileSnapshot || !mobileDecision || !mobileSubmit || !mobileNavigation) {
    throw new Error("The mobile Application start layout must be measurable.");
  }
  expect(mobileDecision.y).toBeGreaterThanOrEqual(mobileSnapshot.y + mobileSnapshot.height);
  expect(mobileSubmit.y).toBeGreaterThanOrEqual(mobileDecision.y + mobileDecision.height);
  expect(mobileSubmit.y + mobileSubmit.height).toBeLessThanOrEqual(mobileNavigation.y);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("radio", { name: "Preparing" }).check();
  await expect(page.getByRole("textbox", { name: /Next action/i })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /reason/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Start Application", exact: true }).click();

  await expect(page).toHaveURL(/\/applications\/\d+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Head of Engineering" })).toBeVisible();
  await expect(page.locator(".ats-badge").filter({ hasText: /^Preparing$/ })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Next actions" })).toBeVisible();
  await expect(page.getByText("Tailor the application", { exact: true })).toBeVisible();
  const firstNextAction = page.getByRole("article").filter({ hasText: "Tailor the application" });
  const [desktopActionHeading, desktopActionButton] = await Promise.all([
    firstNextAction.getByRole("heading", { name: "Tailor the application" }).boundingBox(),
    firstNextAction.getByRole("button", { name: "Complete" }).boundingBox(),
  ]);
  if (!desktopActionHeading || !desktopActionButton) {
    throw new Error("The desktop workflow card must be measurable.");
  }
  expect(desktopActionHeading.x + desktopActionHeading.width).toBeLessThan(desktopActionButton.x);

  await page.setViewportSize({ width: 390, height: 844 });
  const completeNextActionButton = firstNextAction.getByRole("button", { name: "Complete" });
  await completeNextActionButton.scrollIntoViewIfNeeded();
  const [mobileActionHeading, mobileActionButton, applicationNavigation] = await Promise.all([
    firstNextAction.getByRole("heading", { name: "Tailor the application" }).boundingBox(),
    completeNextActionButton.boundingBox(),
    page.getByRole("navigation", { name: "Primary navigation" }).boundingBox(),
  ]);
  if (!mobileActionHeading || !mobileActionButton || !applicationNavigation) {
    throw new Error("The mobile workflow card must be measurable.");
  }
  expect(mobileActionButton.y).toBeGreaterThanOrEqual(
    mobileActionHeading.y + mobileActionHeading.height,
  );
  expect(mobileActionButton.y + mobileActionButton.height).toBeLessThanOrEqual(
    applicationNavigation.y,
  );

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("heading", { level: 2, name: "Application timeline" })).toBeVisible();
  await expect(page.getByText("Application started", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Relationship plan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No Relationship plan yet" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request Relationship plan", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Enable Advisor in Settings", exact: true }),
  ).toHaveAttribute("href", "/settings/opportunities");
  await page.getByRole("button", { name: "Move to Applied", exact: true }).click();
  await expect(
    page.getByText("Application stage changed to Applied.", { exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "New Next action (required)", exact: true })
    .fill("Prepare interview examples");
  await page
    .getByRole("textbox", { name: "New Next action reason (required)", exact: true })
    .fill("The Application has moved forward.");
  await page.getByRole("button", { name: "Add Next action", exact: true }).click();
  await expect(page.getByText("Prepare interview examples", { exact: true })).toBeVisible();
  await expect(page.getByText("Next action created.", { exact: true })).toHaveCount(1);
  await page
    .getByRole("article")
    .filter({ hasText: "Tailor the application" })
    .getByRole("button", { name: "Complete", exact: true })
    .click();
  await expect(page.getByText("Next action completed.", { exact: true })).toHaveCount(1);
  const completedAction = page.getByRole("article").filter({ hasText: "Tailor the application" });
  await completedAction.getByRole("button", { name: "Reopen", exact: true }).click();
  await expect(completedAction.getByText("Open Next action", { exact: true })).toBeVisible();
  await completedAction.getByLabel("Defer until (required)").fill("2026-09-20T09:00");
  await completedAction.getByRole("button", { name: "Defer", exact: true }).click();
  await expect(completedAction.getByText("Deferred Next action", { exact: true })).toBeVisible();
  await completedAction.getByRole("button", { name: "Reopen", exact: true }).click();
  await completedAction.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(completedAction.getByText("Dismissed Next action", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Correct Application stage" }).selectOption("preparing");
  await page.getByRole("button", { name: "Correct stage", exact: true }).click();
  await expect(page.getByText("Stage corrected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Move to Applied", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Correct Application stage" })).toHaveValue(
    "applied",
  );

  const applicationPath = new URL(page.url()).pathname;
  await page.goto("/settings/opportunities");
  await page.getByRole("checkbox", { name: "Enable local Advisor" }).check();
  await page.getByRole("button", { name: "Save Advisor settings", exact: true }).click();
  await expect(page.getByText("Advisor settings saved.", { exact: true })).toBeVisible();
  await page.goto(applicationPath);
  const relationship = page.getByRole("region", { name: "Relationship plan", exact: true });
  await requestAdvisorWithFeedback(page, relationship, {
    intent: "plan-relationship",
    button: "Request Relationship plan",
    pendingButton: "Planning Relationship",
    message: "Planning a relationship path with the local Advisor.",
  });
  await expect(
    relationship.getByText("Review the listing before choosing a relationship path.", {
      exact: true,
    }),
  ).toBeVisible();
  const acceptedRecommendation = relationship
    .getByRole("article")
    .filter({ hasText: "Review the employer listing" });
  const dismissedRecommendation = relationship
    .getByRole("article")
    .filter({ hasText: "Prepare a role question" });
  for (const [card, intent, buttonName, message, otherCard] of [
    [
      acceptedRecommendation,
      "accept-recommendation",
      "Accept as Next action",
      "Recommendation accepted as a Next action.",
      dismissedRecommendation,
    ],
    [
      dismissedRecommendation,
      "dismiss-recommendation",
      "Dismiss",
      "Recommendation dismissed.",
      acceptedRecommendation,
    ],
  ] as const) {
    let release = () => {};
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**${applicationPath}*`, async (route) => {
      if (route.request().method() === "POST" && route.request().postData()?.includes(intent))
        await paused;
      await route.continue();
    });
    try {
      await card.getByRole("button", { name: buttonName, exact: true }).click();
      await expect
        .soft(card.getByRole("status"))
        .toHaveText("Saving your Recommendation decision.");
      await expect.soft(otherCard.locator('[aria-busy="true"]')).toHaveCount(0);
    } finally {
      release();
    }
    await expect(
      card.getByText(
        intent === "accept-recommendation"
          ? "Accepted as a Next action."
          : "Dismissed. No Application facts changed.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect.soft(card.getByRole("status")).toHaveText(message);
    await captureRegion(page, card, intent);
    await page.unroute(`**${applicationPath}*`);
  }
  await expect(
    page
      .getByRole("region", { name: "Next actions", exact: true })
      .getByRole("heading", { name: "Review the employer listing", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Next actions", exact: true })
      .getByRole("heading", { name: "Prepare a role question", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("combobox", { name: "Correct Application stage" }).selectOption("closed");
  await page.getByRole("button", { name: "Correct stage", exact: true }).click();
  await expect(page.locator(".ats-badge").filter({ hasText: /^Closed$/ })).toBeVisible();
  await expect
    .soft(page.getByText("Application stage changed to Closed.", { exact: true }))
    .toBeVisible();
  await page.getByRole("combobox", { name: "Correct Application stage" }).selectOption("applied");
  await page.getByRole("button", { name: "Correct stage", exact: true }).click();
  await expect(page.locator(".ats-badge").filter({ hasText: /^Applied$/ })).toBeVisible();
  await page.goto("/settings/opportunities");
  await page.getByRole("checkbox", { name: "Enable local Advisor" }).uncheck();
  await page.getByRole("button", { name: "Save Advisor settings", exact: true }).click();
  await expect(page.getByText("Advisor settings saved.", { exact: true })).toBeVisible();
  await page.goto(applicationPath);
  await captureCommandCenter(page, "application-detail");

  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Today", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  await expect(page.getByText("Tailor the application", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Prepare interview examples", { exact: true })).toBeVisible();
  await expect(page.getByText("The Application has moved forward.", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Priority Opportunities" })
      .locator(`a[href="${opportunityReviewPath}"]`),
  ).toHaveCount(0);
  await expect(page.getByText("No due date", { exact: true })).toHaveCount(2);
  await expect(
    page
      .getByRole("region", { name: "Applications", exact: true })
      .getByRole("link", { name: "Head of Engineering", exact: true }),
  ).toBeVisible();
  await captureCommandCenter(page, "today-actions");

  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Applications", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Applications" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Head of Engineering" })).toBeVisible();
  await expect(page.getByText("Application stage: Applied", { exact: true })).toBeVisible();
  await captureCommandCenter(page, "applications");
  await page.getByRole("combobox", { name: "Application stage" }).selectOption("preparing");
  await page.getByRole("button", { name: "Filter Applications", exact: true }).click();
  await expect(page).toHaveURL("/applications?stage=preparing");
  await expect(page.getByRole("link", { name: "Head of Engineering" })).toHaveCount(0);
  await expect(page.getByText("No Applications at this stage.", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Application stage" }).selectOption("applied");
  await page.getByRole("button", { name: "Filter Applications", exact: true }).click();
  await expect(page).toHaveURL("/applications?stage=applied");
  await expect(page.getByRole("link", { name: "Head of Engineering" })).toBeVisible();

  await page.goto(`/opportunities?profile=${profileId}&provider=serper`);
  await verifyJobActionsVisualLayout(page);
  await page.getByRole("button", { name: "Save job" }).click();
  await expect(page.getByRole("button", { name: "Remove saved status" })).toBeVisible();

  await page.getByRole("link", { name: "Activity" }).click();
  await page.getByRole("link", { name: new RegExp(`^Run #${started.runId} `) }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: `Run #${started.runId}` }),
  ).toBeVisible();
  const completedOutcome = page.getByRole("region", { name: "Discovery completed" });
  await expect(completedOutcome).toBeVisible();
  await expect(completedOutcome.getByText("Completed", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Run outcome", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Discovery funnel" })).toBeVisible();
  await expect(page.getByText("1 unique search hits")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Requests by market and lane" })).toBeVisible();
  const requestEvidence = page.getByRole("table", { name: "Discovery request evidence" });
  await expect(requestEvidence.getByRole("columnheader", { name: "Market" })).toBeVisible();
  await expect(requestEvidence.getByRole("columnheader", { name: "Locale" })).toBeVisible();
  await expect(requestEvidence.getByRole("columnheader", { name: "Lane" })).toBeVisible();
  await expect(requestEvidence.getByRole("columnheader", { name: "Strategy" })).toBeVisible();
  await expect(requestEvidence.getByRole("columnheader", { name: "Source" })).toBeVisible();
  await expect(requestEvidence.getByRole("columnheader", { name: "Page" })).toBeVisible();
  await expect(requestEvidence.getByRole("columnheader", { name: "Requests" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Head of Engineering" }).first()).toBeVisible();
  await captureRunStateMatrix(page, "completed");

  await addKnownBoard(page, {
    companyName: "Acme Fixture",
    url: "https://boards.greenhouse.io/acme-fixture/jobs/12345",
  });
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Opportunities", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Search profile", exact: true })
    .selectOption(String(profileId));
  await page.getByLabel("Web search provider").selectOption("serpapi");
  await expect(page.getByRole("button", { name: "Run discovery" })).toBeEnabled();
  const boardOnlyResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      new URL(candidate.url()).pathname === "/api/discovery-runs",
  );
  const boardOnlyRequest = page.waitForRequest(
    (candidate) =>
      candidate.method() === "POST" && new URL(candidate.url()).pathname === "/api/discovery-runs",
  );
  await page.getByRole("button", { name: "Run discovery" }).click();
  expect((await boardOnlyRequest).postDataJSON()).toEqual({ profileId, provider: "serpapi" });
  const boardOnlyStarted = (await (await boardOnlyResponse).json()) as { runId: number };
  await page.getByRole("link", { name: "Activity" }).click();
  const boardOnlyRun = page.getByRole("link", {
    name: `Run #${boardOnlyStarted.runId} Completed`,
  });
  await expect(boardOnlyRun).toBeVisible({ timeout: 30_000 });
  await boardOnlyRun.click();
  const boardOnlyOutcome = page.getByRole("region", { name: "Discovery completed" });
  await expect(boardOnlyOutcome).toBeVisible();
  await expect(boardOnlyOutcome.getByText("Completed", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Web coverage skipped/)).toBeVisible();

  await configureSerperEndpoint(page, `${fixtureUrl}/serper/failure`);
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Opportunities", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Search profile", exact: true })
    .selectOption(String(profileId));
  await page.getByLabel("Web search provider").selectOption("serper");

  const failedResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      new URL(candidate.url()).pathname === "/api/discovery-runs",
  );
  await page.getByRole("button", { name: "Run discovery" }).click();
  const failedStartResponse = await failedResponse;
  expect(failedStartResponse.status()).toBe(202);
  const failedStart = (await failedStartResponse.json()) as { runId: number };

  const partialNotice = page
    .getByRole("alert")
    .filter({ hasText: "Discovery partially completed" });
  await expect(partialNotice).toContainText(
    "Serper.dev was unavailable after 3 attempts. Try again later or choose another provider.",
    { timeout: 30_000 },
  );
  await partialNotice.getByRole("link", { name: `View run #${failedStart.runId}` }).click();
  await partialNotice.getByRole("button", { name: "Dismiss discovery notification" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: `Run #${failedStart.runId}` }),
  ).toBeVisible();
  const partialOutcome = page.getByRole("region", { name: "Discovery partially completed" });
  await expect(partialOutcome).toBeVisible();
  await expect(partialOutcome.getByText("Partial", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText(/serper transient server-error after 3 attempts; skipped \d+ queries/),
  ).toBeVisible();
  await expect(page.getByText("failed", { exact: true }).first()).toBeVisible();
  await captureRunStateMatrix(page, "partial");

  await disableAllKnownBoards(page);
  await addKnownBoard(page, {
    companyName: "Failure Evidence",
    url: `https://boards.greenhouse.io/failure-${crypto.randomUUID().slice(0, 8)}/jobs/99999`,
  });
  await page.goto(`/opportunities?profile=${profileId}&provider=serpapi`);
  const allFailedResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      new URL(candidate.url()).pathname === "/api/discovery-runs",
  );
  await page.getByRole("button", { name: "Run discovery" }).click();
  const allFailedStart = (await (await allFailedResponse).json()) as { runId: number };
  const failedNotice = page.getByRole("alert").filter({ hasText: "Discovery failed" });
  await expect(failedNotice).toContainText("ATS request returned HTTP 404", { timeout: 30_000 });

  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((selected) => {
      document.documentElement.dataset.theme = selected;
    }, theme);
    const { violations } = await new AxeBuilder({ page })
      .include("[data-sonner-toast].discovery-notice")
      .analyze();
    expect(
      violations.map((violation) => `${theme}: ${violation.id}`),
      "the failed notice is the one surface the route scans never reach",
    ).toEqual([]);
  }
  await page.evaluate(() => {
    delete document.documentElement.dataset.theme;
  });
  await failedNotice.getByRole("link", { name: `View run #${allFailedStart.runId}` }).click();
  const failedOutcome = page.getByRole("region", { name: "Discovery failed" });
  await expect(failedOutcome).toBeVisible();
  await expect(failedOutcome.getByText("Failed", { exact: true })).toHaveCount(0);
  await captureRunStateMatrix(page, "failed");
  await disableAllKnownBoards(page);
});

test("shows a Web3 source and search-lead state after opted-in discovery", async ({ page }) => {
  test.setTimeout(90_000);
  await disableAllKnownBoards(page);
  await configureDiscoveryFixtures(page, `${fixtureUrl}/serper/web3-lead`);
  await page
    .getByLabel("Structured verification source IDs")
    .fill(["cryptocurrencyjobs", "cryptojobslist"].join("\n"));
  await page.getByRole("button", { name: "Save runtime settings" }).click();
  await expect(page.getByText("Runtime settings saved to SQLite.")).toBeVisible();
  const { id: profileId } = await createProfile(page, { includeUnverified: true });

  await page.goto(`/opportunities?profile=${profileId}`);
  await page.getByLabel("Web search provider").selectOption("serper");
  const startedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/discovery-runs",
  );
  await page.getByRole("button", { name: "Run discovery" }).click();
  expect((await startedResponse).status()).toBe(202);

  const completedNotice = page.getByRole("status").filter({ hasText: "Discovery completed" });
  await expect(completedNotice).toBeVisible({ timeout: 30_000 });
  await completedNotice.getByRole("link", { name: "View results" }).click();

  await expect(
    page.getByRole("heading", { level: 2, name: "Head of Engineering at Example Labs" }),
  ).toBeVisible();
  await expect(page.getByText("Search lead", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Ranked opportunities").getByText("Web3 Career", { exact: true }),
  ).toBeVisible();
});

test("shows persisted board progress while matching waits for collection", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  expect((await request.post(`${fixtureUrl}/control/reset-board-progress`)).ok()).toBe(true);
  const token = crypto.randomUUID().slice(0, 8);

  try {
    await configureDiscoveryFixtures(page, undefined, 120_000);
    await disableAllKnownBoards(page);
    await addKnownBoard(page, {
      companyName: "Acme Progress",
      url: `https://boards.greenhouse.io/progress-first-${token}/jobs/12345`,
    });
    await addKnownBoard(page, {
      companyName: "Beta Systems",
      url: `https://boards.greenhouse.io/progress-delayed-${token}/jobs/67890`,
    });
    const { id: profileId, name: profileName } = await createProfile(page);

    await page.goto(`/opportunities?profile=${profileId}&provider=serpapi`);
    const discoveryLayer = page.getByRole("region", { name: "Discovery status" });
    const startedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/discovery-runs",
    );
    await page.getByRole("button", { name: "Run discovery" }).click();
    const started = (await (await startedResponse).json()) as { runId: number };
    await expect(
      discoveryLayer.getByRole("button", { name: `Cancel discovery #${started.runId}` }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Run discovery" })).toBeVisible();

    await page.getByRole("link", { name: "Activity" }).click();
    const activeRuns = page.getByRole("region", { name: "Active Discovery Runs" });
    await expect(activeRuns.getByRole("heading", { name: "Active Discovery Runs" })).toBeVisible();
    await expect(activeRuns.getByText("In progress", { exact: true })).toHaveCount(0);
    const activeRun = activeRuns.getByRole("article", {
      name: `Discovery Run #${started.runId}`,
    });
    await expect(activeRun.getByText(profileName, { exact: true })).toBeVisible();
    await expect(activeRun).toContainText("Synchronizing company boards · 1 of 2 boards", {
      timeout: 30_000,
    });
    await expect(activeRun).toContainText("Active board: Beta Systems");
    await expect(activeRun).toContainText("1 job changed · 0 matches found");
    await captureRunStateMatrix(page, "running");
    const runningTotals = "1 job changed · 0 matches found";
    const viewRun = activeRun.getByRole("link", {
      name: `View run #${started.runId}`,
    });
    const cancelDiscovery = activeRun.getByRole("button", {
      name: `Cancel discovery #${started.runId}`,
    });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(viewRun).toBeVisible();
      await expect(cancelDiscovery).toBeVisible();
      const layout = await activeRun.evaluate((element) => ({
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
        viewportWidth: window.innerWidth,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.scrollWidth).toBe(layout.clientWidth);
    }
    const themeToggle = page.getByRole("button", { name: /^Theme:/ });
    for (const theme of ["light", "dark", "system"]) {
      await themeToggle.click();
      await expect(
        page.getByRole("button", { name: new RegExp(`^Theme: ${theme}\\.`) }),
      ).toBeVisible();
      await expect(activeRun).toContainText(runningTotals);
    }
    await viewRun.focus();
    await expect(viewRun).toBeFocused();
    await viewRun.press("Enter");
    const runProgress = page.getByRole("region", {
      name: `Discovery Run #${started.runId} progress`,
    });
    await expect(page.getByRole("heading", { level: 2, name: "Discovery is running" })).toHaveCount(
      0,
    );
    await expect(page.getByText("Running", { exact: true })).toHaveCount(1);
    await expect(runProgress.getByText(profileName, { exact: true })).toHaveCount(0);
    await expect(runProgress).toContainText("Synchronizing company boards · 1 of 2 boards");
    await expect(runProgress).toContainText("Active board: Beta Systems");
    await expect(
      runProgress.getByRole("button", { name: `Cancel discovery #${started.runId}` }),
    ).toBeVisible();
    await captureRunStateMatrix(page, "running-detail");

    await page.reload();
    await page.waitForLoadState("networkidle");
    const restoredProgress = page.getByRole("region", {
      name: `Discovery Run #${started.runId} progress`,
    });
    await expect(restoredProgress).toContainText("Active board: Beta Systems", {
      timeout: 30_000,
    });
    await expect(restoredProgress).toContainText(runningTotals);

    // The poll holds while the tab is hidden. Headless Chromium reports every page as visible and
    // `bringToFront` does not change that, so the property is overridden and the real
    // `visibilitychange` event dispatched; the effect, its listener and its cleanup are the browser's
    // own. The seeded interval is 3s, so a 12s silence is four missed polls rather than a near miss.
    const polls: string[] = [];
    const recordPoll = (request: Request) => {
      if (new URL(request.url()).pathname.endsWith(".data")) {
        polls.push(request.url());
      }
    };
    page.on("request", recordPoll);
    await expect.poll(() => polls.length, { timeout: 30_000 }).toBeGreaterThan(0);

    // A poll waits for the one before it to settle. Holding a response for three cadences and
    // finding one request outstanding is the difference between rescheduling on settle and firing
    // on a fixed interval, which the 3s seeded cadence would otherwise hide behind fast responses.
    let releaseHeldPoll = () => {};
    const heldPoll = new Promise<void>((resolve) => {
      releaseHeldPoll = resolve;
    });
    await page.route(
      (url) => url.pathname.endsWith(".data"),
      async (route) => {
        await heldPoll;
        await route.continue();
      },
      { times: 1 },
    );
    polls.length = 0;
    await expect.poll(() => polls.length, { timeout: 30_000 }).toBe(1);
    await page.waitForTimeout(9_000);
    expect(polls).toHaveLength(1);
    releaseHeldPoll();
    await expect.poll(() => polls.length, { timeout: 30_000 }).toBeGreaterThan(1);

    await setDocumentVisibility(page, "hidden");
    const polledBeforeHiding = polls.length;
    await page.waitForTimeout(12_000);
    expect(polls.length).toBe(polledBeforeHiding);
    await setDocumentVisibility(page, "visible");
    await expect.poll(() => polls.length, { timeout: 30_000 }).toBeGreaterThan(polledBeforeHiding);
    page.off("request", recordPoll);

    expect((await request.post(`${fixtureUrl}/control/release-board-progress`)).ok()).toBe(true);
    const completedNotice = discoveryLayer.getByRole("status").filter({
      has: page.getByRole("link", { name: `View run #${started.runId}` }),
    });
    await expect(completedNotice).toContainText(
      /2 boards completed, 1 job changed, web coverage skipped, and [1-9]\d* current profile match(?:es)?/,
      { timeout: 30_000 },
    );
  } finally {
    await request.post(`${fixtureUrl}/control/release-board-progress`);
  }
});

test("cancels a running discovery without resurrecting a delayed poll", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  expect((await request.post(`${fixtureUrl}/control/reset-success`)).ok()).toBe(true);
  await configureDiscoveryFixtures(page);
  const { id: profileId } = await createProfile(page);

  let delayedStatus = false;
  let releaseDelayedStatus: (() => void) | undefined;
  let resolveDelayedStatus: (() => void) | undefined;
  const delayedStatusGate = new Promise<void>((resolve) => {
    releaseDelayedStatus = resolve;
  });
  const delayedStatusFinished = new Promise<void>((resolve) => {
    resolveDelayedStatus = resolve;
  });
  let cancellationAttempts = 0;
  let releaseCancellation: (() => void) | undefined;
  const cancellationGate = new Promise<void>((resolve) => {
    releaseCancellation = resolve;
  });
  await page.route("**/api/discovery-runs**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "DELETE") {
      cancellationAttempts += 1;
      if (cancellationAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            status: "error",
            message: "Cancellation is temporarily unavailable.",
          }),
        });
        return;
      }
      await cancellationGate;
      await route.continue();
      return;
    }
    if (route.request().method() !== "GET" || !url.searchParams.has("ids") || delayedStatus) {
      await route.continue();
      return;
    }
    delayedStatus = true;
    const response = await route.fetch();
    await delayedStatusGate;
    await route.fulfill({ response });
    resolveDelayedStatus?.();
  });

  await page.goto(`/opportunities?profile=${profileId}`);
  await page.getByLabel("Web search provider").selectOption("serper");
  const delayedPollRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      request.method() === "GET" &&
      url.pathname === "/api/discovery-runs" &&
      url.searchParams.has("ids")
    );
  });
  const startedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/discovery-runs",
  );
  await page.getByRole("button", { name: "Run discovery" }).click();
  const started = (await (await startedResponse).json()) as { runId: number };
  await delayedPollRequest;

  await page.getByRole("link", { name: "Activity" }).click();
  const activeRun = page.getByRole("article", {
    name: `Discovery Run #${started.runId}`,
  });
  await expect(activeRun).toContainText(/Synchronizing company boards|expanding web coverage/i, {
    timeout: 30_000,
  });
  await activeRun.getByRole("link", { name: `View run #${started.runId}` }).click();
  const cancelDiscovery = page
    .getByRole("region", { name: `Discovery Run #${started.runId} progress` })
    .getByRole("button", { name: `Cancel discovery #${started.runId}` });

  const failedCancellation = page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" &&
      new URL(response.url()).pathname === "/api/discovery-runs",
  );
  await cancelDiscovery.click();
  expect((await failedCancellation).status()).toBe(503);
  await expect(page.getByRole("alert")).toContainText("Cancellation is temporarily unavailable.");
  await expect(cancelDiscovery).toBeEnabled();

  const cancelResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" &&
      new URL(response.url()).pathname === "/api/discovery-runs" &&
      response.status() === 200,
  );
  await cancelDiscovery.click();
  const cancellingDiscovery = page.getByRole("button", {
    name: `Cancelling… discovery #${started.runId}`,
  });
  await expect(cancellingDiscovery).toContainText("Cancelling…");
  await expect(cancellingDiscovery).toBeDisabled();
  await captureRunStateMatrix(page, "cancelling");
  releaseCancellation?.();
  expect((await cancelResponse).status()).toBe(200);
  await expect(page.getByRole("heading", { level: 2, name: "Discovery cancelled" })).toBeVisible();
  await expect(cancelDiscovery).toHaveCount(0);

  releaseDelayedStatus?.();
  await delayedStatusFinished;
  await expect(page.getByRole("heading", { level: 2, name: "Discovery cancelled" })).toBeVisible();
  await expect(page.getByText(/Cancelled by user/)).toBeVisible();
  await expect(cancelDiscovery).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Discovery cancelled" })).toBeVisible();
  expect((await request.post(`${fixtureUrl}/control/release-success`)).ok()).toBe(true);

  await page.getByRole("button", { name: "Dismiss discovery notification" }).click();
  await page.getByRole("link", { name: "Activity" }).click();
  await expect(
    page.getByRole("link", { name: new RegExp(`Run #${started.runId} Cancelled`) }),
  ).toBeVisible();
  await expect(page.getByRole("article", { name: `Discovery Run #${started.runId}` })).toHaveCount(
    0,
  );
});

test("explains that a returned role was excluded by location", async ({ page }) => {
  test.setTimeout(90_000);
  await configureDiscoveryFixtures(page, `${fixtureUrl}/serper/location-mismatch`);
  const { id: profileId } = await createProfile(page);

  await page.goto(`/opportunities?profile=${profileId}`);
  await page.getByLabel("Web search provider").selectOption("serper");
  const startedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/discovery-runs",
  );
  await page.getByRole("button", { name: "Run discovery" }).click();
  const started = (await (await startedResponse).json()) as { runId: number };
  await expect(completedNoticeFor(page, started.runId)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: "Activity" }).click();
  await runHistoryLinkFor(page, started.runId).click();
  const publicUrl = page.getByLabel("Public job URL");
  await expect(publicUrl).toHaveCSS("height", "44px");
  await expect(publicUrl).toHaveCSS("font-size", "16px");
  await expect(publicUrl).toHaveCSS("border-radius", "8px");
  await page
    .getByLabel("Public job URL")
    .fill("https://boards.greenhouse.io/acme-mismatch/jobs/67890");
  await page.getByRole("button", { name: "Explain this role" }).click();

  const diagnostic = page.getByRole("region", { name: "Known role diagnostic" });
  await expect(diagnostic).toContainText("Provider returned this URL at rank 1");
  await expect(diagnostic).toContainText("Classified as Greenhouse");
  await expect(diagnostic).toContainText("Verified from structured ATS data");
  await expect(diagnostic).toContainText("Excluded from this profile");
  await expect(diagnostic).toContainText("Location does not match the profile");
  await expect(diagnostic.getByRole("link", { name: "Open stored listing" })).toHaveAttribute(
    "href",
    "https://boards.greenhouse.io/acme-mismatch/jobs/67890",
  );
});

test("explains every zero-match funnel state", async ({ page }) => {
  test.setTimeout(90_000);
  await configureDiscoveryFixtures(page, `${fixtureUrl}/serper/location-mismatch`);
  const { id: profileId } = await createProfile(page);
  await page.goto("/settings");
  await page.getByLabel("Structured verification source IDs").fill("");
  await page.getByRole("button", { name: "Save runtime settings" }).click();
  await expect(page.getByText("Runtime settings saved to SQLite.")).toBeVisible();
  const cases = [
    {
      endpoint: `${fixtureUrl}/serper/location-mismatch`,
      expected: {
        providerHits: 1,
        classified: 1,
        verified: 1,
        verificationOnly: 0,
        staleOnly: 0,
        otherExclusions: 1,
        finalMatches: 0,
      },
      heading: "Profile rules were the main reason no jobs matched",
    },
    {
      endpoint: `${fixtureUrl}/serper/web3-lead`,
      expected: {
        providerHits: 1,
        classified: 1,
        verified: 0,
        verificationOnly: 1,
        staleOnly: 0,
        otherExclusions: 0,
        finalMatches: 0,
      },
      heading: "Verification was the main reason no jobs matched",
    },
    {
      endpoint: `${fixtureUrl}/serper/stale`,
      expected: {
        providerHits: 1,
        classified: 1,
        verified: 1,
        verificationOnly: 0,
        staleOnly: 1,
        otherExclusions: 0,
        finalMatches: 0,
      },
      heading: "Listing age was the main reason no jobs matched",
    },
    {
      endpoint: `${fixtureUrl}/serper/no-hits`,
      expected: {
        providerHits: 0,
        classified: 0,
        verified: 0,
        verificationOnly: 0,
        staleOnly: 0,
        otherExclusions: 0,
        finalMatches: 0,
      },
      heading: "The provider returned no results",
      action: { label: "Review query details", href: "#query-details" },
    },
    {
      endpoint: `${fixtureUrl}/serper/unclassified`,
      expected: {
        providerHits: 1,
        classified: 0,
        verified: 0,
        verificationOnly: 0,
        staleOnly: 0,
        otherExclusions: 0,
        finalMatches: 0,
      },
      heading: "Returned results did not match a supported source",
      action: {
        label: "Review source coverage",
        href: "/settings/adapters/source-coverage",
      },
    },
    {
      endpoint: `${fixtureUrl}/serper/classified-without-job`,
      expected: {
        providerHits: 1,
        classified: 1,
        verified: 0,
        verificationOnly: 0,
        staleOnly: 0,
        otherExclusions: 0,
        finalMatches: 0,
      },
      heading: "Classified results did not reach a final match",
      action: { label: "Explain a returned role", href: "#known-role-check" },
    },
  ] as const;

  for (const scenario of cases) {
    await configureSerperEndpoint(page, scenario.endpoint);
    const runId = await runDiscovery(page, profileId);
    await page.goto(`/runs/${runId}`);

    const funnel = page.getByRole("region", { name: "Discovery funnel" });
    const countFor = (label: string) =>
      funnel.getByText(label, { exact: true }).locator("..").getByRole("definition");
    await expect(countFor("Provider hits")).toHaveText(String(scenario.expected.providerHits));
    await expect(countFor("Classified")).toHaveText(String(scenario.expected.classified));
    await expect(countFor("Verified")).toHaveText(String(scenario.expected.verified));
    await expect(countFor("Verification only")).toHaveText(
      String(scenario.expected.verificationOnly),
    );
    await expect(countFor("Stale only")).toHaveText(String(scenario.expected.staleOnly));
    await expect(countFor("Other exclusions")).toHaveText(
      String(scenario.expected.otherExclusions),
    );
    await expect(countFor("Final matches")).toHaveText(String(scenario.expected.finalMatches));
    await expect(funnel.getByText(scenario.heading, { exact: true })).toBeVisible();
    if ("action" in scenario) {
      await expect(funnel.getByRole("link", { name: scenario.action.label })).toHaveAttribute(
        "href",
        new RegExp(`${scenario.action.href}$`),
      );
    }
  }
});

test.describe("discovery over plain HTTP", () => {
  test("starts discovery without secure-context crypto and reports its run outcome", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await configureDiscoveryFixtures(page, `${fixtureUrl}/serper/failure`);
    await disableAllKnownBoards(page);
    const enabledSource = page
      .getByRole("list")
      .getByRole("switch", { name: /^Enable / })
      .first();
    await enabledSource.click();
    await expect(page.getByRole("list").getByRole("switch", { name: /^Disable / })).toHaveCount(1);
    const profile = await createProfile(page);
    await page.goto(`http://job-radar.test:3100/?profile=${profile.id}&provider=serper`);
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(() => ({
        secure: window.isSecureContext,
        randomUUID: typeof window.crypto.randomUUID,
        getRandomValues: typeof window.crypto.getRandomValues,
      })),
    ).toEqual({ secure: false, randomUUID: "undefined", getRandomValues: "function" });

    const errors: string[] = [];
    const starts: Request[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/discovery-runs")
        starts.push(request);
    });
    await page.getByRole("button", { name: "Run discovery" }).click();
    expect(errors).toEqual([]);
    await expect.poll(() => starts.length).toBe(1);
    const startedRequest = starts[0];
    if (!startedRequest) throw new Error("Run discovery sent no start request.");
    expect(startedRequest.postDataJSON()).toEqual({ profileId: profile.id, provider: "serper" });
    const response = await startedRequest.response();
    expect(response?.status()).toBe(202);
    const started: { runId: number } = await response?.json();
    const outcome = page.getByRole("alert").filter({ hasText: "Discovery failed" });
    await expect(outcome).toContainText("Serper.dev was unavailable after 3 attempts", {
      timeout: 30_000,
    });
    await expect(outcome.getByRole("link", { name: `View run #${started.runId}` })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

async function configureDiscoveryFixtures(
  page: Page,
  serperEndpoint = `${fixtureUrl}/serper/success`,
  requestTimeoutMs = 30_000,
): Promise<void> {
  await page.goto("/settings/opportunities");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Request timeout (ms)").fill(String(requestTimeoutMs));
  await page.getByLabel("Run status polling (ms)").fill("1000");
  await page.getByLabel("Requested web results per query").fill("1");
  await page.getByLabel("Background work batch size").fill("1");
  await page.getByLabel("Search strategies").fill("role-first");
  const serperEndpointField = page.getByLabel("Google via Serper.dev endpoint");
  await serperEndpointField.fill(serperEndpoint);
  await serperEndpointField
    .locator("..")
    .locator("..")
    .getByLabel("Strategy override")
    .fill("role-first");
  await page.getByRole("button", { name: "Save runtime settings" }).click();
  await expect(page.getByText("Runtime settings saved to SQLite.")).toBeVisible();

  await page.goto("/settings/adapters/ats-registry?ats=greenhouse");
  await page.waitForLoadState("networkidle");
  await page
    .getByLabel("Endpoint templates")
    .fill(JSON.stringify({ jobs: `${fixtureUrl}/greenhouse/{slug}/jobs` }, null, 2));
  await page.getByRole("button", { name: "Save Greenhouse" }).click();
  await expect(page.getByText("Greenhouse settings saved to SQLite.")).toBeVisible();
  await page.goto("/settings/opportunities");
}

async function captureRunStateMatrix(page: Page, state: string): Promise<void> {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const theme of ["light", "dark"] as const) {
      await selectTheme(page, theme);
      await page.screenshot({
        animations: "disabled",
        caret: "hide",
        fullPage: true,
        path: `test-results/adm-206/${state}-${viewport.name}-${theme}.png`,
      });
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await selectTheme(page, "system");
}

async function selectTheme(page: Page, theme: "light" | "dark" | "system"): Promise<void> {
  const themeToggle = page.getByRole("button", { name: /^Theme:/ });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if ((await themeToggle.getAttribute("aria-label"))?.startsWith(`Theme: ${theme}.`)) {
      return;
    }
    await themeToggle.click();
  }
  await expect(themeToggle).toHaveAccessibleName(new RegExp(`^Theme: ${theme}\\.`));
}

async function disableAllKnownBoards(page: Page): Promise<void> {
  await page.goto("/settings/adapters/source-coverage");
  await disableSwitches(
    page,
    page.getByRole("list").getByRole("switch", { name: /^Disable / }),
    "toggle-source",
  );

  const table = page.getByRole("table");
  if ((await table.count()) === 0) {
    return;
  }

  const enabledBoardSwitch = table.getByRole("switch", { name: /^Disable / }).first();
  if ((await enabledBoardSwitch.count()) > 0) {
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.request().postData()?.includes("intent=toggle-board") === true,
    );
    await enabledBoardSwitch.click();
    const response = await saved;
    expect(response.ok()).toBe(true);
    expect(response.request().postData()).toContain("enabled=false");
  }

  const maxFixtureBoardId = 64;
  const responses = await Promise.all(
    Array.from({ length: maxFixtureBoardId }, (_, index) =>
      page.request.post("/settings/adapters/source-coverage.data", {
        form: {
          intent: "toggle-board",
          id: String(index + 1),
          enabled: "false",
        },
      }),
    ),
  );
  for (const response of responses) {
    expect(response.ok()).toBe(true);
  }

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(table.getByRole("switch", { name: /^Disable / })).toHaveCount(0);
}

async function disableSwitches(
  page: Page,
  enabledSwitches: Locator,
  intent: "toggle-source" | "toggle-board",
): Promise<void> {
  while ((await enabledSwitches.count()) > 0) {
    const previousCount = await enabledSwitches.count();
    const enabledSwitch = enabledSwitches.first();
    const label = await enabledSwitch.getAttribute("aria-label");
    if (!label) {
      throw new Error("Expected the enabled source switch to have an accessible name.");
    }
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.startsWith("/settings/adapters/source-coverage"),
    );
    await enabledSwitch.click();
    const response = await saved;
    expect(response.request().postData()).toContain(`intent=${intent}`);
    expect(response.request().postData()).toContain("enabled=false");
    expect(response.ok()).toBe(true);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(enabledSwitches).toHaveCount(previousCount - 1);
  }
}

async function configureSerperEndpoint(page: Page, endpoint: string): Promise<void> {
  await page.getByRole("link", { name: /System settings/i }).click();
  await page.getByLabel("Google via Serper.dev endpoint").fill(endpoint);
  await page.getByRole("button", { name: "Save runtime settings" }).click();
  await expect(page.getByText("Runtime settings saved to SQLite.")).toBeVisible();
}

async function addKnownBoard(
  page: Page,
  board: { readonly companyName: string; readonly url: string },
): Promise<void> {
  await page.goto("/settings/adapters/source-coverage");
  await page.getByRole("textbox", { name: "Company", exact: true }).fill(board.companyName);
  await page.getByLabel("Public ATS job, careers, or board URL").fill(board.url);
  await page.getByRole("button", { name: "Add ATS URL" }).click();
  await expect(page.getByText("greenhouse board added.", { exact: false })).toBeVisible();
}

async function runDiscovery(page: Page, profileId: number): Promise<number> {
  await page.goto(`/opportunities?profile=${profileId}&provider=serper`);
  const startedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/discovery-runs",
  );
  await page.getByRole("button", { name: "Run discovery" }).click();
  const started = (await (await startedResponse).json()) as { runId: number };
  await expect(completedNoticeFor(page, started.runId)).toBeVisible({ timeout: 30_000 });
  return started.runId;
}

/**
 * Scoped to one run, because a page adopts every run active on the server whoever started it
 * (`discovery-notifications.tsx`, `adoptActiveRuns`). "Discovery completed" alone matched two
 * notices in CI and the assertion failed on the ambiguity rather than on the product.
 */
function completedNoticeFor(page: Page, runId: number): Locator {
  return page
    .getByRole("status")
    .filter({ hasText: "Discovery completed" })
    .filter({ has: page.getByRole("link", { exact: true, name: `View run #${runId}` }) });
}

/**
 * Scoped to Run history, because a completion notice carries its own link to the same run and
 * `#${runId}` matches both.
 */
function runHistoryLinkFor(page: Page, runId: number): Locator {
  return page
    .getByRole("region", { name: "Run history" })
    .getByRole("link", { name: new RegExp(`#${runId}\\b`) });
}

async function verifyJobActionsVisualLayout(page: Page): Promise<void> {
  const jobCard = page.locator("article.job-card").first();
  const actions = jobCard.locator("fieldset.job-actions");
  const themeToggle = page.getByRole("button", { name: /^Theme: system\./ });
  await themeToggle.click();
  await expect(page.getByRole("button", { name: /^Theme: light\./ })).toBeVisible();

  for (const width of [1440, 1240, 980]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => window.innerWidth)).toBe(width);
    await jobCard.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" });
    });

    for (const name of ["Save job", "Hide job"]) {
      const button = actions.getByRole("button", { name });
      await button.hover();
      const [actionsBox, buttonBox, scrollMetrics] = await Promise.all([
        actions.boundingBox(),
        button.boundingBox(),
        actions.evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        })),
      ]);

      expect(actionsBox).not.toBeNull();
      expect(buttonBox).not.toBeNull();
      if (!actionsBox || !buttonBox) {
        continue;
      }
      const tolerance = 0.5;
      expect(buttonBox.x).toBeGreaterThanOrEqual(actionsBox.x - tolerance);
      expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(
        actionsBox.x + actionsBox.width + tolerance,
      );
      expect(scrollMetrics.scrollWidth).toBe(scrollMetrics.clientWidth);
    }

    await jobCard.screenshot({
      animations: "disabled",
      caret: "hide",
      path: `test-results/job-actions-${width}.png`,
    });
  }

  await page.setViewportSize({ width: 1280, height: 720 });
}

async function createProfile(
  page: Page,
  options: { includeUnverified?: boolean } = {},
): Promise<{ id: number; name: string }> {
  const name = `ADM-18 ${crypto.randomUUID()}`;
  await page.goto("/profiles?new=1");
  await page.getByLabel("Profile name").fill(name);
  await page.getByLabel("Minimum score").fill("60");
  await page.getByLabel("Target job titles").fill("Head of Engineering");
  const locations = page.getByRole("combobox", { name: "Target locations" });
  await locations.fill("United Arab Emirates");
  await expect(
    page.getByRole("option").filter({ hasText: "United Arab Emirates" }).first(),
  ).toBeVisible();
  await locations.press("ArrowDown");
  await locations.press("Enter");
  await expect(page.getByRole("button", { name: "Remove United Arab Emirates" })).toBeVisible();
  if (options.includeUnverified) {
    await page.getByLabel("Include unverified web-search leads").check();
  }
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page).toHaveURL(/\/profiles\?profile=\d+$/);
  await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();

  const id = Number(new URL(page.url()).searchParams.get("profile"));
  expect(id).toBeGreaterThan(0);
  return { id, name };
}
