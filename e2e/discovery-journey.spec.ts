import { expect, type Page, test } from "@playwright/test";

const fixtureUrl = "http://127.0.0.1:3200";

test("completes discovery and triage while profile editing remains responsive", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  expect((await request.post(`${fixtureUrl}/control/reset-success`)).ok()).toBe(true);
  await configureDiscoveryFixtures(page);
  const { id: profileId, name: profileName } = await createProfile(page);

  await page.goto(`/?profile=${profileId}`);
  await page.getByLabel("Search provider").selectOption("serper");

  const startedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/discovery-runs",
  );
  await page.getByRole("button", { name: "Run discovery" }).click();
  const response = await startedResponse;
  expect(response.status()).toBe(202);
  const started = (await response.json()) as { runId: number };
  const runningMessage = `Discovery #${started.runId} is running in the background`;

  await expect(page.getByText(runningMessage, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Search profiles/i }).click();
  await page.getByLabel("Required job keywords, one per line").fill("platform");
  await expect(page.getByText(runningMessage, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expect(page.getByText(runningMessage, { exact: true })).toBeVisible();
  expect((await request.post(`${fixtureUrl}/control/release-success`)).ok()).toBe(true);

  const completedNotice = page.getByRole("status").filter({ hasText: "Discovery completed" });
  await expect(completedNotice).toContainText(`${profileName}: 1 current profile match`, {
    timeout: 30_000,
  });
  await completedNotice.getByRole("link", { name: "View results" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Head of Engineering" })).toBeVisible();
  await page.getByRole("button", { name: "Save job" }).click();
  await expect(page.getByRole("button", { name: "Remove saved status" })).toBeVisible();

  await page.getByRole("link", { name: /Discovery runs/i }).click();
  await page.getByRole("link", { name: new RegExp(`#${started.runId}`) }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: `Run #${started.runId}` }),
  ).toBeVisible();
  await expect(page.getByText("1 unique search hits")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Head of Engineering" }).first()).toBeVisible();

  await configureSerperEndpoint(page, `${fixtureUrl}/serper/failure`);
  await page.getByRole("link", { name: "Opportunities", exact: true }).click();
  await page.getByLabel("Profile").selectOption(String(profileId));

  const failedResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      new URL(candidate.url()).pathname === "/api/discovery-runs",
  );
  await page.getByRole("button", { name: "Run discovery" }).click();
  const failedStartResponse = await failedResponse;
  expect(failedStartResponse.status()).toBe(202);
  const failedStart = (await failedStartResponse.json()) as { runId: number };

  const failedNotice = page.getByRole("alert").filter({ hasText: "Discovery failed" });
  await expect(failedNotice).toContainText(`${profileName} did not finish`, { timeout: 30_000 });
  await failedNotice.getByRole("link", { name: "Run history" }).click();
  await page.getByRole("link", { name: new RegExp(`#${failedStart.runId}`) }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: `Run #${failedStart.runId}` }),
  ).toBeVisible();
  await expect(page.getByText("failed", { exact: true }).first()).toBeVisible();
});

async function configureDiscoveryFixtures(page: Page): Promise<void> {
  await page.goto("/settings?ats=greenhouse");
  await page.getByLabel("Run status polling (ms)").fill("1000");
  await page.getByLabel("Requested web results per query").fill("1");
  await page.getByLabel("Background work batch size").fill("1");
  await page.getByLabel("Google via Serper.dev endpoint").fill(`${fixtureUrl}/serper/success`);
  await page.getByRole("button", { name: "Save runtime settings" }).click();
  await expect(page.getByText("Runtime settings saved to SQLite.")).toBeVisible();

  await page
    .getByLabel("Endpoint templates")
    .fill(JSON.stringify({ jobs: `${fixtureUrl}/greenhouse/{slug}/jobs` }, null, 2));
  await page.getByRole("button", { name: "Save Greenhouse" }).click();
  await expect(page.getByText("Greenhouse settings saved to SQLite.")).toBeVisible();
}

async function configureSerperEndpoint(page: Page, endpoint: string): Promise<void> {
  await page.getByRole("link", { name: /System settings/i }).click();
  await page.getByLabel("Google via Serper.dev endpoint").fill(endpoint);
  await page.getByRole("button", { name: "Save runtime settings" }).click();
  await expect(page.getByText("Runtime settings saved to SQLite.")).toBeVisible();
}

async function createProfile(page: Page): Promise<{ id: number; name: string }> {
  const name = `ADM-18 ${crypto.randomUUID()}`;
  await page.goto("/profiles?new=1");
  await page.getByLabel("Profile name").fill(name);
  await page.getByLabel("Minimum score").fill("60");
  await page.getByLabel("Target job titles").fill("Head of Engineering");
  await page.getByLabel("Target locations").fill("Dubai");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page).toHaveURL(/\/profiles\?profile=\d+$/);
  await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();

  const id = Number(new URL(page.url()).searchParams.get("profile"));
  expect(id).toBeGreaterThan(0);
  return { id, name };
}
