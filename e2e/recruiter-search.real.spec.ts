import { expect, test } from "@playwright/test";

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
  await page.getByLabel("Specialisms").fill("Technology");
  await page.getByLabel("Target industries").fill("Technology");
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
  await expect(
    page
      .locator(".recruiter-firm-observation")
      .filter({ hasText: /Discovered/i })
      .first(),
  ).toBeVisible({ timeout: 15_000 });
  for (const firm of ["Hays", "NADIA Global", "Tiger Recruitment"]) {
    await expect(
      page.locator(".recruiter-firm-observation").filter({ hasText: firm }).first(),
    ).toBeVisible({ timeout: 15_000 });
  }
  await page.locator(".recruiter-ranking-breakdown summary").first().click();
  await expect(page.getByText(/Target-market operating depth · \d+ points/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Firm website" }).first()).toHaveAttribute(
    "href",
    /^https:\/\//,
  );
  await expect(page.getByRole("link", { name: "Public profile" }).first()).toHaveAttribute(
    "href",
    /^https:\/\//,
    { timeout: 15_000 },
  );

  await page.goto("/activity");
  await expect(page.getByRole("cell", { name: "Research Run", exact: true })).toBeVisible();
});
