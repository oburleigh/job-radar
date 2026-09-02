import { expect, type Page, test } from "@playwright/test";

import { missingRealWebSearchApiKeyReason, realWebSearchApiKey } from "./real-web-search-key";

// biome-ignore lint/suspicious/noSkippedTests: the real provider key is optional, and a skip with a stated reason is honest where a throw reports nothing.
test.skip(!realWebSearchApiKey(), missingRealWebSearchApiKeyReason);

const leadershipTitles = [
  "Head of Engineering",
  "VP Engineering",
  "Vice President of Engineering",
  "Director of Engineering",
  "Engineering Director",
  "Technology Director",
  "Head of Technology",
  "Senior Engineering Manager",
  "Director of Platform Engineering",
  "Director of Infrastructure",
  "Director of AI Engineering",
  "Principal Cloud Architect",
];

test("completes UAE Opportunity Discovery through the real Brave adapter", async ({ page }) => {
  await configureBoundedDiscovery(page);
  await keepOnlyAshbySource(page);
  const profileId = await createUaeLeadershipProfile(page);

  await page.goto(`/?profile=${profileId}&provider=brave`);
  await expect(page.getByLabel("Web search provider")).toHaveValue("brave");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/discovery-runs",
  );
  await page.getByRole("button", { name: "Run discovery" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(202);
  const { runId } = (await response.json()) as { readonly runId: number };

  await page.goto(`/runs/${runId}`);
  await expect(
    page.getByRole("heading", { name: /Discovery (completed|partially completed)/i }),
  ).toBeVisible({ timeout: 300_000 });
  await expect(page.locator("body")).not.toContainText("invalid-request");
  await expect(page.locator("body")).not.toContainText("HTTP 422");

  const requests = page.locator('tr[id^="query-"]');
  const statuses = requests.locator(".run-status");
  const requestCount = await requests.count();
  expect(requestCount).toBeGreaterThan(1);
  expect(await statuses.allTextContents()).toEqual(Array(requestCount).fill("completed"));
  const renderedQueries = await statuses.evaluateAll((items) =>
    items.map((status) => status.getAttribute("title") ?? ""),
  );
  expect(renderedQueries.every((query) => query.length <= 400)).toBe(true);
  expect(renderedQueries.every((query) => query.trim().split(/\s+/).length <= 50)).toBe(true);
});

async function configureBoundedDiscovery(page: Page): Promise<void> {
  await page.goto("/settings/opportunities");
  await page.getByLabel("Requested web results per query").fill("1");
  await page.getByLabel("Maximum pages per search lane").fill("1");
  await page.getByLabel("Maximum requests per run").fill("8");
  await page.getByLabel("Run status polling (ms)").fill("1000");
  await page.getByLabel("Search strategies").fill("role-first");
  await page.getByRole("button", { name: "Save runtime settings" }).click();
  await expect(page.getByText("Runtime settings saved to SQLite.")).toBeVisible();
}

async function keepOnlyAshbySource(page: Page): Promise<void> {
  await page.goto("/settings/adapters/source-coverage");
  const sourceList = page.locator("ol.source-grid");
  for (;;) {
    const enabled = sourceList.getByRole("switch", { name: /^Disable / });
    const labels = await enabled.evaluateAll((switches) =>
      switches.map((item) => item.getAttribute("aria-label") ?? ""),
    );
    const removableIndex = labels.findIndex((label) => label !== "Disable jobs.ashbyhq.com");
    if (removableIndex === -1) break;
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.startsWith("/settings/adapters/source-coverage"),
    );
    await enabled.nth(removableIndex).click();
    expect((await saved).ok()).toBe(true);
  }
  await expect(sourceList.getByRole("switch", { name: /^Disable / })).toHaveCount(1);
}

async function createUaeLeadershipProfile(page: Page): Promise<number> {
  const name = `UAE leadership Brave ${crypto.randomUUID()}`;
  await page.goto("/profiles?new=1");
  await page.getByLabel("Profile name").fill(name);
  await page.getByLabel("Target job titles").fill(leadershipTitles.join("\n"));
  const locations = page.getByRole("combobox", { name: "Target locations" });
  await locations.fill("United Arab Emirates");
  await expect(
    page.getByRole("option").filter({ hasText: "United Arab Emirates" }).first(),
  ).toBeVisible();
  await locations.press("ArrowDown");
  await locations.press("Enter");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page).toHaveURL(/\/profiles\?profile=\d+$/);
  const profileId = Number(new URL(page.url()).searchParams.get("profile"));
  expect(profileId).toBeGreaterThan(0);
  return profileId;
}
