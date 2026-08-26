import { expect, type Page, test } from "@playwright/test";

const fixtureUrl = "http://127.0.0.1:3200";

test("completes discovery and triage while profile editing remains responsive", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  expect((await request.post(`${fixtureUrl}/control/reset-success`)).ok()).toBe(true);
  await configureDiscoveryFixtures(page);
  await disableAllKnownBoards(page);
  const otherProfile = await createProfile(page);
  const { id: profileId, name: profileName } = await createProfile(page);

  await page.goto("/");
  await expect(page).toHaveURL(/[?&]profile=\d+.*[?&]provider=[^&]+/);

  await page.goto("/?profile=999999&provider=missing");
  const canonicalUrl = new URL(page.url());
  await expect(page.getByRole("combobox", { name: "Profile" })).toHaveValue(
    canonicalUrl.searchParams.get("profile") ?? "",
  );
  await expect(page.getByRole("combobox", { name: "Search provider" })).toHaveValue(
    canonicalUrl.searchParams.get("provider") ?? "",
  );
  expect(canonicalUrl.searchParams.get("profile")).not.toBe("999999");
  expect(canonicalUrl.searchParams.get("provider")).not.toBe("missing");

  await page.goto(`/?profile=${profileId}&provider=serper`);
  const discoveryControls = page.getByRole("region", {
    name: "Discovery controls",
  });
  await expect(discoveryControls.getByText(profileName, { exact: true })).toBeVisible();

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
  const selectBrave = page.getByLabel("Search provider").selectOption("brave");
  try {
    await expect.poll(() => providerNavigationIntercepted).toBe(true);
    await expect(page.getByRole("button", { name: "Run discovery" })).toBeDisabled();
  } finally {
    releaseProviderNavigation();
  }
  await selectBrave;
  await page.unroute("**/*provider=brave*");
  await expect(page).toHaveURL(new RegExp(`[?&]profile=${profileId}(?:&|$).*provider=brave`));
  await page.getByLabel("Search provider").selectOption("serpapi");
  await expect(page.getByRole("button", { name: "Run discovery" })).toBeDisabled();
  await expect(
    discoveryControls.getByRole("link", { name: "Enable a company board" }),
  ).toHaveAttribute("href", "/sources");
  await page.getByLabel("Search provider").selectOption("serper");
  await expect(page).toHaveURL(new RegExp(`[?&]profile=${profileId}(?:&|$).*provider=serper`));
  await page.getByRole("combobox", { name: "Profile" }).selectOption(String(otherProfile.id));
  await expect(page).toHaveURL(
    new RegExp(`[?&]profile=${otherProfile.id}(?:&|$).*provider=serper`),
  );
  await page.getByRole("combobox", { name: "Profile" }).selectOption(String(profileId));
  await expect(page).toHaveURL(new RegExp(`[?&]profile=${profileId}(?:&|$).*provider=serper`));

  await configureSerperEndpoint(page, `${fixtureUrl}/serper/success`);
  await page.getByRole("link", { name: /Greenhouse/ }).click();
  await expectUrlSelection(page, profileId, "serper", { ats: "greenhouse" });

  await page.getByRole("link", { name: "New integration" }).click();
  await expectUrlSelection(page, profileId, "serper", { new: "1" });
  const integrationId = `e2e-${crypto.randomUUID().slice(0, 8)}`;
  const integrationHost = `${integrationId}.example.com`;
  await page.getByRole("textbox", { name: /^Integration ID\b/ }).fill(integrationId);
  await page.getByLabel("Display name").fill(`E2E ${integrationId}`);
  await page.getByLabel("Source patterns, one per line").fill(integrationHost);
  await page.getByLabel("Exact hostnames").fill(integrationHost);
  await page.getByRole("button", { name: "Add integration" }).click();
  await expectUrlSelection(page, profileId, "serper", { ats: integrationId });
  await expect(
    page.getByRole("heading", { level: 2, name: `E2E ${integrationId}` }).first(),
  ).toBeVisible();

  await page.getByRole("link", { name: "Opportunities", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]profile=${profileId}(?:&|$).*provider=serper`));
  await expect(page.getByRole("combobox", { name: "Profile" })).toHaveValue(String(profileId));
  await expect(page.getByRole("combobox", { name: "Search provider" })).toHaveValue("serper");

  const startedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/discovery-runs",
  );
  const startedRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" && new URL(request.url()).pathname === "/api/discovery-runs",
  );
  await page.getByRole("button", { name: "Run discovery" }).click();
  expect((await startedRequest).postDataJSON()).toEqual({
    profileId,
    provider: "serper",
  });
  const response = await startedResponse;
  expect(response.status()).toBe(202);
  const started = (await response.json()) as { runId: number };
  const runningStatus = page.getByRole("status").filter({
    has: page.getByRole("button", { name: `Cancel discovery #${started.runId}` }),
  });

  await expect(runningStatus).toContainText("No enabled company boards; expanding web coverage");
  await page.getByRole("link", { name: /Search profiles/i }).click();
  await page.getByLabel("Required job keywords, one per line").fill("platform");
  await expect(runningStatus).toContainText("No enabled company boards; expanding web coverage");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expect(runningStatus).toContainText("No enabled company boards; expanding web coverage");
  expect((await request.post(`${fixtureUrl}/control/release-success`)).ok()).toBe(true);

  const completedNotice = page.getByRole("status").filter({ hasText: "Discovery completed" });
  await expect(completedNotice).toContainText(`${profileName}: 1 current profile match`, {
    timeout: 30_000,
  });
  await completedNotice.getByRole("link", { name: "View results" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Head of Engineering" })).toBeVisible();
  await expect(page.getByText("Live listing", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Ranked opportunities").getByText("Greenhouse", { exact: true }),
  ).toBeVisible();
  await verifyJobActionsVisualLayout(page);
  await page.getByRole("button", { name: "Save job" }).click();
  await expect(page.getByRole("button", { name: "Remove saved status" })).toBeVisible();

  await page.getByRole("link", { name: /Discovery runs/i }).click();
  await page.getByRole("link", { name: new RegExp(`#${started.runId}`) }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: `Run #${started.runId}` }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Discovery completed" })).toBeVisible();
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
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

  await page.getByRole("link", { name: "Opportunities", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Profile", exact: true })
    .selectOption(String(profileId));
  await page.getByLabel("Search provider").selectOption("serpapi");
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
  const boardOnlyNotice = page
    .getByRole("status")
    .filter({ hasText: "Web coverage was skipped because no provider was configured." });
  await expect(boardOnlyNotice).toContainText("Discovery completed", { timeout: 30_000 });
  await expect(boardOnlyNotice).toContainText(
    "Web coverage was skipped because no provider was configured.",
  );
  await boardOnlyNotice.getByRole("link", { name: "Run history" }).click();
  await expect(
    page.getByRole("link", { name: new RegExp(`Run #${boardOnlyStarted.runId} Completed`) }),
  ).toBeVisible();
  await page.getByRole("link", { name: new RegExp(`#${boardOnlyStarted.runId}`) }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Discovery completed" })).toBeVisible();
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Web coverage skipped/)).toBeVisible();

  await configureSerperEndpoint(page, `${fixtureUrl}/serper/failure`);
  await page.getByRole("link", { name: "Opportunities", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Profile", exact: true })
    .selectOption(String(profileId));
  await page.getByLabel("Search provider").selectOption("serper");

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
  await partialNotice.getByRole("link", { name: "Run history" }).click();
  await expect(
    page.getByRole("link", { name: new RegExp(`Run #${failedStart.runId} Partial`) }),
  ).toBeVisible();
  await page.getByRole("link", { name: new RegExp(`#${failedStart.runId}`) }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: `Run #${failedStart.runId}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Discovery partially completed" }),
  ).toBeVisible();
  await expect(page.getByText("Partial", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText(/serper transient server-error after 3 attempts; skipped \d+ queries/),
  ).toBeVisible();
  await expect(page.getByText("failed", { exact: true }).first()).toBeVisible();
});

test("shows a Web3 source and search-lead state after opted-in discovery", async ({ page }) => {
  test.setTimeout(90_000);
  await configureDiscoveryFixtures(page, `${fixtureUrl}/serper/web3-lead`);
  await page
    .getByLabel("Structured verification source IDs")
    .fill(["cryptocurrencyjobs", "cryptojobslist"].join("\n"));
  await page.getByRole("button", { name: "Save runtime settings" }).click();
  await expect(page.getByText("Runtime settings saved to SQLite.")).toBeVisible();
  const { id: profileId } = await createProfile(page, { includeUnverified: true });

  await page.goto(`/?profile=${profileId}`);
  await page.getByLabel("Search provider").selectOption("serper");
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

test("cancels a running discovery without resurrecting a delayed poll", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  expect((await request.post(`${fixtureUrl}/control/reset-success`)).ok()).toBe(true);
  await configureDiscoveryFixtures(page);
  const { id: profileId } = await createProfile(page);

  let delayedStatus = false;
  await page.route("**/api/discovery-runs**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET" || !url.searchParams.has("ids") || delayedStatus) {
      await route.continue();
      return;
    }
    delayedStatus = true;
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.fulfill({ response });
  });

  await page.goto(`/?profile=${profileId}`);
  await page.getByLabel("Search provider").selectOption("serper");
  const startedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/discovery-runs",
  );
  await page.getByRole("button", { name: "Run discovery" }).click();
  const started = (await (await startedResponse).json()) as { runId: number };
  const runningStatus = page.getByRole("status").filter({
    has: page.getByRole("button", { name: `Cancel discovery #${started.runId}` }),
  });
  await expect(runningStatus).toContainText(/Refreshing known boards|Expanding web coverage/, {
    timeout: 30_000,
  });

  const cancelResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" &&
      new URL(response.url()).pathname === "/api/discovery-runs",
  );
  await page.getByRole("button", { name: `Cancel discovery #${started.runId}` }).click();
  expect((await cancelResponse).status()).toBe(200);
  await expect(page.getByRole("status").filter({ hasText: "Discovery cancelled" })).toBeVisible();
  await expect(runningStatus).toBeHidden();

  await new Promise((resolve) => setTimeout(resolve, 1_800));
  await expect(runningStatus).toBeHidden();
  expect((await request.post(`${fixtureUrl}/control/release-success`)).ok()).toBe(true);

  await page.goto(`/runs/${started.runId}`);
  await expect(page.getByRole("heading", { level: 2, name: "Discovery cancelled" })).toBeVisible();
  await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Cancelled by user/)).toBeVisible();
});

test("explains that a returned role was excluded by location", async ({ page }) => {
  test.setTimeout(90_000);
  await configureDiscoveryFixtures(page, `${fixtureUrl}/serper/location-mismatch`);
  const { id: profileId } = await createProfile(page);

  await page.goto(`/?profile=${profileId}`);
  await page.getByLabel("Search provider").selectOption("serper");
  const startedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/discovery-runs",
  );
  await page.getByRole("button", { name: "Run discovery" }).click();
  const started = (await (await startedResponse).json()) as { runId: number };
  await expect(page.getByRole("status").filter({ hasText: "Discovery completed" })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("link", { name: /Discovery runs/i }).click();
  await page.getByRole("link", { name: new RegExp(`#${started.runId}`) }).click();
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
      action: { label: "Review source coverage", href: "/sources" },
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

async function configureDiscoveryFixtures(
  page: Page,
  serperEndpoint = `${fixtureUrl}/serper/success`,
): Promise<void> {
  await page.goto("/settings?ats=greenhouse");
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

  await page
    .getByLabel("Endpoint templates")
    .fill(JSON.stringify({ jobs: `${fixtureUrl}/greenhouse/{slug}/jobs` }, null, 2));
  await page.getByRole("button", { name: "Save Greenhouse" }).click();
  await expect(page.getByText("Greenhouse settings saved to SQLite.")).toBeVisible();
}

async function disableAllKnownBoards(page: Page): Promise<void> {
  await page.goto("/sources");
  const enabledBoards = page.getByRole("switch", { name: /^Disable / });
  while ((await enabledBoards.count()) > 0) {
    const previousCount = await enabledBoards.count();
    await enabledBoards.first().click();
    await expect(enabledBoards).toHaveCount(previousCount - 1);
  }
}

async function configureSerperEndpoint(page: Page, endpoint: string): Promise<void> {
  await page.getByRole("link", { name: /System settings/i }).click();
  await page.getByLabel("Google via Serper.dev endpoint").fill(endpoint);
  await page.getByRole("button", { name: "Save runtime settings" }).click();
  await expect(page.getByText("Runtime settings saved to SQLite.")).toBeVisible();
}

async function runDiscovery(page: Page, profileId: number): Promise<number> {
  await page.goto(`/?profile=${profileId}&provider=serper`);
  const startedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/discovery-runs",
  );
  await page.getByRole("button", { name: "Run discovery" }).click();
  const started = (await (await startedResponse).json()) as { runId: number };
  await expect(page.getByRole("status").filter({ hasText: "Discovery completed" })).toBeVisible({
    timeout: 30_000,
  });
  return started.runId;
}

async function expectUrlSelection(
  page: Page,
  profileId: number,
  provider: string,
  extra: Record<string, string> = {},
): Promise<void> {
  const expected = { profile: String(profileId), provider, ...extra };
  for (const [key, value] of Object.entries(expected)) {
    await expect.poll(() => new URL(page.url()).searchParams.get(key)).toBe(value);
  }
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
    await jobCard.scrollIntoViewIfNeeded();

    for (const name of ["Save job", "Mark as applied", "Hide job"]) {
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

    const screenshotBuffer = { top: 8, right: 20, bottom: 8, left: 8 };
    const clip = await jobCard.evaluate((element, buffer) => {
      const box = element.getBoundingClientRect();
      const x = Math.max(0, Math.floor(window.scrollX + box.left - buffer.left));
      const y = Math.max(0, Math.floor(window.scrollY + box.top - buffer.top));
      const right = Math.ceil(window.scrollX + box.right + buffer.right);
      const bottom = Math.ceil(window.scrollY + box.bottom + buffer.bottom);
      return { x, y, width: right - x, height: bottom - y };
    }, screenshotBuffer);
    const screenshot = await page.screenshot({
      animations: "disabled",
      caret: "hide",
      clip,
    });
    expect(screenshot).toMatchSnapshot(`job-actions-${width}.png`);
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
  await locations.press("Enter");
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
