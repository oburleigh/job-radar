import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("starts recruiter research from the browser and renders firms before recruiters complete", async ({
  page,
}) => {
  await page.goto("/recruiter-research");

  await expect(page.getByRole("heading", { level: 1, name: "Recruiter research" })).toBeVisible();
  await page.getByLabel("Recruiters to find").fill("0");
  await page.getByRole("button", { name: "Start research" }).click();
  await expect(page.getByRole("alert")).toContainText("highlighted field");
  await expect(page.getByLabel("Recruiters to find")).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/recruiter-research$/);

  await page.getByLabel("Technology brief").fill("UAE fintech cybersecurity leadership");
  await selectRecruiterLocation(page, "Dubai");
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
      "Criteria: Dubai; Cybersecurity, Technology leadership; Financial services, Health technology",
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
  await clearRecruiterLocations(page);
  await page.getByLabel("Recruiters to find").fill("20");
  await page.getByRole("button", { name: "Start research" }).click();

  await expect(page.getByRole("alert")).toContainText("highlighted field");
  await expect(page.getByLabel("Target locations")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Recruiters to find")).not.toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByText("Choose at least one target location from the catalogue.", { exact: true }),
  ).toHaveCount(1);
});

test("keeps edited recruiter research fields after a recoverable validation revalidation", async ({
  page,
}) => {
  await page.goto("/recruiter-research");

  const brief = page.getByLabel("Technology brief");
  await brief.fill("Edited applied AI leadership brief");
  await selectRecruiterLocation(page, "Dubai");
  await page.getByLabel("Recruiters to find").fill("0");
  await page.getByRole("button", { name: "Start research" }).click();

  await expect(page.getByRole("alert")).toContainText("highlighted field");
  await expect(page.getByLabel("Recruiters to find")).toHaveAttribute("aria-invalid", "true");
  await expect(brief).toHaveValue("Edited applied AI leadership brief");
  await expect(page.getByRole("button", { name: "Remove Dubai" })).toBeVisible();
});

test("cancels an active recruiter run and retries with the frozen brief and plan", async ({
  page,
}) => {
  await page.goto("/recruiter-research");
  await page.getByLabel("Technology brief").fill("UAE data and AI hiring");
  await selectRecruiterLocation(page, "Abu Dhabi");
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
    page.getByText("Criteria: Abu Dhabi; Data and AI, Architecture; Government, Energy", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Technology brief")).toHaveValue("UAE data and AI hiring");
  await expect(page.getByLabel("Recruiters to find")).toHaveValue("10");
  await expect(page.getByText("Technology Recruiter 1", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
});

test("uses configured market options in the shared token autocomplete and keeps compact desktop rows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/recruiter-research");

  const targetLocations = page.getByLabel("Target locations");
  await expect(targetLocations).toHaveAttribute("role", "combobox");
  await expect(page.locator('select[name="targetLocations"]')).toHaveCount(0);
  await targetLocations.fill("Du");
  await expect(page.getByRole("option")).toHaveText(["Dubai"]);
  await targetLocations.press("ArrowDown");
  await targetLocations.press("Enter");
  await expect(page.getByLabel("Remove Dubai")).toHaveCount(1);
  await targetLocations.fill("Dubai");
  await targetLocations.press("ArrowDown");
  await targetLocations.press("Enter");
  await expect(page.getByLabel("Remove Dubai")).toHaveCount(1);
  await targetLocations.press("Backspace");
  await expect(page.getByLabel("Remove Dubai")).toHaveCount(0);
  await expect(page.getByLabel("Geography")).toHaveCount(0);

  const controls = await Promise.all(
    [
      "Technology brief",
      "Target locations",
      "Technology specialisms",
      "Target industries",
      "Recruiters to find",
    ].map(async (label) => page.getByLabel(label).boundingBox()),
  );
  const [brief, locations, specialisms, industries, recruiterTarget] = requiredBoxes(controls);
  if (!brief || !locations || !specialisms || !industries || !recruiterTarget) {
    throw new Error("Recruiter controls must be rendered before layout is measured.");
  }
  expect(brief.width).toBeGreaterThan(specialisms.width);
  expect(Math.abs(specialisms.y - industries.y)).toBeLessThan(4);
  expect(specialisms.x).toBeLessThan(industries.x);
  expect(Math.abs(locations.y - recruiterTarget.y)).toBeLessThan(4);
  expect(locations.x).toBeLessThan(recruiterTarget.x);
  expect(locations.height).toBeGreaterThanOrEqual(44);
  expect(locations.height).toBeLessThan(100);
  await page.screenshot({ path: "test-results/recruiter-desktop.png", fullPage: true });
});

test("contains recruiter controls equally on mobile and clears the fixed navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/recruiter-research");

  const controls = await Promise.all(
    [
      "Technology brief",
      "Target locations",
      "Technology specialisms",
      "Target industries",
      "Recruiters to find",
    ].map(async (label) => page.getByLabel(label).boundingBox()),
  );
  const [first, ...remaining] = requiredBoxes(controls);
  if (!first) {
    throw new Error("Recruiter controls must be rendered before layout is measured.");
  }
  for (const control of remaining) {
    expect(control.x).toBeGreaterThanOrEqual(first.x);
    expect(control.x + control.width).toBeLessThanOrEqual(390);
  }

  const recruiterTarget = page.getByLabel("Recruiters to find");
  await recruiterTarget.scrollIntoViewIfNeeded();
  await expect(recruiterTarget).toBeInViewport();
  await expect(recruiterTarget).toBeVisible();
  const [targetBox, navigationBox] = await Promise.all([
    recruiterTarget.boundingBox(),
    page.getByRole("navigation", { name: "Primary navigation" }).boundingBox(),
  ]);
  if (!targetBox || !navigationBox) {
    throw new Error("Recruiter controls and primary navigation must be measurable on mobile.");
  }
  expect(
    targetBox.y + targetBox.height <= navigationBox.y ||
      targetBox.y >= navigationBox.y + navigationBox.height,
  ).toBe(true);
  await page.screenshot({ path: "test-results/recruiter-mobile.png", fullPage: true });
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

function requiredBoxes<T>(boxes: readonly (T | null)[]): readonly T[] {
  const resolved = boxes.filter((box): box is T => box !== null);
  if (resolved.length !== boxes.length) {
    throw new Error("Recruiter controls must be rendered before layout is measured.");
  }
  return resolved;
}

async function selectRecruiterLocation(page: import("@playwright/test").Page, label: string) {
  await clearRecruiterLocations(page);
  const locations = page.getByLabel("Target locations");
  await locations.fill(label);
  await locations.press("ArrowDown");
  await locations.press("Enter");
}

async function clearRecruiterLocations(page: import("@playwright/test").Page) {
  const removers = page.getByRole("button", { name: /^Remove / });
  while (await removers.count()) {
    await removers.first().click();
  }
}
