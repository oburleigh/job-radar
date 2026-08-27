import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("starts recruiter research from the browser and renders firms before recruiters complete", async ({
  page,
}) => {
  await page.goto("/recruiter-research");

  await expect(page.getByRole("heading", { level: 1, name: "Recruiter research" })).toBeVisible();
  await page.getByLabel("Recruiters to find").fill("0");
  await page.getByRole("button", { name: "Start research" }).click();
  await expect(page.getByRole("alert")).toContainText("positive integer");
  await expect(page).toHaveURL(/\/recruiter-research$/);

  await page.getByLabel("Technology brief").fill("UAE fintech cybersecurity leadership");
  await page.getByLabel("Geography").fill("Dubai, United Arab Emirates");
  await page.getByLabel("Technology specialisms").fill("Cybersecurity, Technology leadership");
  await page.getByLabel("Target industries").fill("Financial services, Health technology");
  await page.getByLabel("Recruiters to find").fill("10");
  await page.getByRole("button", { name: "Start research" }).click();
  await expect(page).toHaveURL(/\/recruiter-research\?run=/);

  await expect(
    page.getByRole("heading", { level: 3, name: "UAE Technology Search 1", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Researching", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Criteria: Dubai, United Arab Emirates; Cybersecurity, Technology leadership; Financial services, Health technology",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText("Technology Recruiter 1", { exact: true })).not.toBeVisible();

  await expect(page.getByText("Technology Recruiter 1", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Complete", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Evidence source" }).first()).toHaveAttribute(
    "href",
    /^https:\/\//,
  );
  await expect(page.getByRole("link", { name: "Public LinkedIn profile" }).first()).toHaveAttribute(
    "href",
    /^https:\/\/www\.linkedin\.com\/in\//,
  );
  await expect(page.getByText(/high confidence/).first()).toBeVisible();
});

test("shows each invalid structured criterion on its own control", async ({ page }) => {
  await page.goto("/recruiter-research");
  await page.getByLabel("Geography").fill("");
  await page.getByLabel("Recruiters to find").fill("20");
  await page.getByRole("button", { name: "Start research" }).click();

  await expect(page.getByRole("alert")).toContainText("highlighted field");
  await expect(page.getByLabel("Geography")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Recruiters to find")).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Geography is required.", { exact: true })).toHaveCount(1);
});

test("cancels an active recruiter run and retries with the frozen brief and plan", async ({
  page,
}) => {
  await page.goto("/recruiter-research");
  await page.getByLabel("Technology brief").fill("UAE data and AI hiring");
  await page.getByLabel("Geography").fill("Abu Dhabi, United Arab Emirates");
  await page.getByLabel("Technology specialisms").fill("Data and AI, Architecture");
  await page.getByLabel("Target industries").fill("Government, Energy");
  await page.getByLabel("Recruiters to find").fill("10");
  await page.getByRole("button", { name: "Start research" }).click();

  await expect(
    page.getByRole("heading", { level: 3, name: "UAE Technology Search 1", exact: true }),
  ).toBeVisible();
  const previousRunId = new URL(page.url()).searchParams.get("run");
  if (!previousRunId) {
    throw new Error("The initial recruiter research run did not have an identity.");
  }
  await page.getByRole("button", { name: "Cancel research" }).click();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(page.getByText("Technology Recruiter 1", { exact: true })).not.toBeVisible();
  const sourcePlan = page.getByRole("region", { name: "Source plan" });
  await expect(sourcePlan.getByText("Public HTTPS firm pages", { exact: true })).toBeVisible();
  await expect(
    sourcePlan.getByText("Public LinkedIn profile results", { exact: true }),
  ).toBeVisible();
  await expect(sourcePlan.getByText("Skipped", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry with the same plan" }).click();

  await expect(page).toHaveURL(/\/recruiter-research\?run=/);
  await expect(page.getByText(`Retry of ${previousRunId}`, { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Criteria: Abu Dhabi, United Arab Emirates; Data and AI, Architecture; Government, Energy",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Technology brief")).toHaveValue("UAE data and AI hiring");
  await expect(page.getByLabel("Recruiters to find")).toHaveValue("10");
  await expect(page.getByText("Technology Recruiter 1", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
});

for (const theme of ["light", "dark"] as const) {
  test(`has no automated accessibility violations in recruiter research ${theme} mode`, async ({
    page,
  }) => {
    await page.addInitScript((selectedTheme) => {
      window.localStorage.setItem("job-radar-theme", selectedTheme);
    }, theme);
    await page.goto("/recruiter-research");

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}
