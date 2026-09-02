import { expect, type Page, test } from "@playwright/test";

import { missingRealWebSearchApiKeyReason, realWebSearchApiKey } from "./real-web-search-key";

// biome-ignore lint/suspicious/noSkippedTests: the real provider key is optional, and a skip with a stated reason is honest where a throw reports nothing.
test.skip(!realWebSearchApiKey(), missingRealWebSearchApiKeyReason);

test("finds and qualifies UAE technology recruitment firms with the real configured provider", async ({
  browser,
  page,
}) => {
  await page.goto("/recruiter-search");

  await expect(page.getByText("Public firm websites", { exact: false })).toBeVisible();
  await expect(
    page.getByText("No account-linked source is connected", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Search provider").selectOption("brave");
  await expect(page.getByLabel("Search provider")).toHaveValue("brave");
  await page.getByText("Add optional search context", { exact: true }).click();
  await page
    .getByLabel("Search brief")
    .fill(
      "Established technology recruitment firms operating in the UAE and their named recruiters",
    );
  const locations = page.getByLabel("Target locations");
  await locations.fill("United Arab Emirates");
  await expect(page.getByRole("option").first()).toBeVisible();
  await locations.press("ArrowDown");
  await locations.press("Enter");
  await selectCriterion(page, "Specialisms", "Software engineering");
  await selectCriterion(page, "Target industries", "Technology");
  await page.getByLabel("Firms to find").fill("15");
  await page.getByLabel("Recruiters to find").fill("15");

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/recruiter-search.data",
  );
  const startedAt = Date.now();
  await page.getByRole("button", { name: "Start research" }).click();
  const response = await responsePromise;

  expect(response.status()).toBe(202);
  expect(Date.now() - startedAt).toBeLessThan(5_000);
  await expect(page).toHaveURL(/\/recruiter-search\?run=/);
  await expect(page.getByText("Researching", { exact: true })).toBeVisible();

  const livenessPage = await browser.newPage();
  await livenessPage.goto("/settings/opportunities");
  await expect(livenessPage.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await livenessPage.close();

  await expect(page.locator(".recruiter-run-status")).toContainText(/Complete|Partial/);
  await expect(
    page.getByText("Qualified recruitment firm", { exact: false }).first(),
  ).toBeVisible();
  const firms = page.locator(".recruiter-firm-observation");
  await expect(firms.first()).toBeVisible({ timeout: 15_000 });
  const firmNames = await firms.locator("header h3").allTextContents();
  expect(firmNames.length).toBeGreaterThan(0);
  expect(firmNames.every((name) => name.trim().length > 0)).toBe(true);

  const firmWebsites = await firms
    .getByRole("link", { name: "Firm website" })
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  expect(firmWebsites).toHaveLength(firmNames.length);
  expect(firmWebsites.every((href) => href.startsWith("https://"))).toBe(true);

  const firmCitations = await firms
    .locator(":scope > .recruiter-evidence-history > summary")
    .allTextContents();
  expect(firmCitations).toHaveLength(firmNames.length);
  expect(firmCitations.every((citation) => /^[1-9]\d* retained public source/.test(citation))).toBe(
    true,
  );

  await page.locator(".recruiter-ranking-breakdown summary").first().click();
  await expect(page.getByText(/Target-market operating depth · \d+ points/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Public profile" }).first()).toHaveAttribute(
    "href",
    /^https:\/\//,
    { timeout: 15_000 },
  );

  await page.goto("/activity");
  await expect(page.getByRole("cell", { name: "Research Run", exact: true })).toBeVisible();
});

async function selectCriterion(page: Page, field: string, option: string) {
  await page.getByRole("combobox", { name: new RegExp(field, "i") }).focus();
  await page.getByRole("option", { name: option, exact: true }).click();
}
