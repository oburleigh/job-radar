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
  await page.getByLabel("Target locations").selectOption(["Dubai"]);
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
  await page.getByLabel("Target locations").selectOption([]);
  await page.getByLabel("Recruiters to find").fill("20");
  await page.getByRole("button", { name: "Start research" }).click();

  await expect(page.getByRole("alert")).toContainText("highlighted field");
  await expect(page.getByLabel("Target locations")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Recruiters to find")).not.toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByText("Choose at least one target location from the catalogue.", { exact: true }),
  ).toHaveCount(1);
});

test("cancels an active recruiter run and retries with the frozen brief and plan", async ({
  page,
}) => {
  await page.goto("/recruiter-research");
  await page.getByLabel("Technology brief").fill("UAE data and AI hiring");
  await page.getByLabel("Target locations").selectOption(["Abu Dhabi"]);
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

test("uses the configured market catalogue and keeps recruiter controls in aligned desktop rows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/recruiter-research");

  const targetLocations = page.getByLabel("Target locations");
  await expect(targetLocations).toHaveJSProperty("tagName", "SELECT");
  await expect(targetLocations.locator("option")).toHaveText([
    "United Arab Emirates",
    "Abu Dhabi",
    "Dubai",
  ]);
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
  const [brief, ...criteria] = requiredBoxes(controls);
  if (!brief) {
    throw new Error("Recruiter controls must be rendered before layout is measured.");
  }
  for (const control of criteria) {
    expect(control.x).toBeCloseTo(brief.x, 1);
    expect(control.width).toBeCloseTo(brief.width, 1);
    expect(control.y).toBeGreaterThan(brief.y + brief.height);
  }
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
    expect(control.x).toBeCloseTo(first.x, 1);
    expect(control.width).toBeCloseTo(first.width, 1);
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
