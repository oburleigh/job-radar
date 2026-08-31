import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("shows guidance without applying research criteria to a new run", async ({ page }) => {
  await page.goto("/recruiter-search");

  await expect(
    page.getByText(/public-source scan of recruitment firms and their named recruiters/i),
  ).toBeVisible();
  await expect(page.getByLabel("Search brief")).toHaveValue("");
  await expect(page.getByLabel("Search brief")).toHaveAttribute(
    "placeholder",
    /roles, sectors, seniority, or market focus/i,
  );
  await expect(page.getByLabel("Target locations")).toHaveValue("");
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  await expect(page.getByLabel("Specialisms")).toHaveValue("");
  await expect(page.getByLabel("Specialisms")).toHaveAttribute("placeholder", /clinical research/i);
  await expect(page.getByLabel("Target industries")).toHaveValue("");
  await expect(page.getByLabel("Target industries")).toHaveAttribute(
    "placeholder",
    /life sciences/i,
  );
  await expect(page.getByLabel("Firms to find")).toHaveValue("10");
  await expect(page.getByLabel("Recruiters to find")).toHaveValue("20");
  await expect(page.getByLabel("Technology brief")).toHaveCount(0);
  await expect(page.getByLabel("Research brief")).toHaveCount(0);
  await expect(page.getByLabel("Technology specialisms")).toHaveCount(0);
});

test("starts recruiter research from the browser and renders firms before recruiters complete", async ({
  page,
}) => {
  await page.goto("/recruiter-search");

  await expect(page.getByRole("heading", { level: 1, name: "Recruiter Search" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Recruiter research" })).toHaveCount(0);
  await page.getByLabel("Search brief").fill("UAE fintech cybersecurity leadership");
  await page.getByLabel("Codex model").fill("gpt-5.6");
  await page.getByLabel("Reasoning effort").fill("high");
  await selectRecruiterLocation(page, "Dubai");
  await page.getByLabel("Specialisms").fill("Cybersecurity, Technology leadership");
  await page.getByLabel("Target industries").fill("Financial services, Health technology");
  await page.getByLabel("Recruiters to find").fill("0");
  await page.getByRole("button", { name: "Start research" }).click();
  await expect(page.getByRole("alert")).toContainText("highlighted field");
  await expect(page.getByLabel("Recruiters to find")).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/recruiter-search$/);

  await page.getByLabel("Recruiters to find").fill("10");
  await page.getByRole("button", { name: "Start research" }).click();
  await expect(page).toHaveURL(/\/recruiter-search\?run=/);

  await expect(
    page.getByRole("heading", { level: 3, name: "Recruitment Search 1", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Researching", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Criteria: Dubai, United Arab Emirates; Cybersecurity, Technology leadership; Financial services, Health technology",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Execution: gpt-5.6, high effort, public web search, ephemeral, read-only sandbox, no automatic retry",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText("Technology Recruiter 1", { exact: true })).not.toBeVisible();

  await expect(page.getByText("Technology Recruiter 1", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Complete", { exact: true })).toBeVisible();
  await page.locator(".recruiter-evidence-history summary").first().click();
  await expect(
    page.locator(".recruiter-evidence-history").first().getByRole("link").first(),
  ).toHaveAttribute("href", /^https:\/\//);
  await expect(page.getByRole("link", { name: "Public profile" }).first()).toHaveAttribute(
    "href",
    /^https:\/\/www\.linkedin\.com\/in\//,
  );
  await expect(page.getByText(/high confidence/).first()).toBeVisible();
  await page.screenshot({ path: "test-results/recruiter-directory-desktop.png", fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: "test-results/recruiter-directory-dark.png", fullPage: true });
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/recruiter-directory-mobile.png", fullPage: true });
  await page.getByRole("link", { name: "Activity" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Discovery history" })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Research Run", exact: true })).toBeVisible();
});

test("shows each invalid structured criterion on its own control", async ({ page }) => {
  await page.goto("/recruiter-search");
  await page.getByLabel("Specialisms").fill("Executive search");
  await page.getByLabel("Target industries").fill("Financial services");
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
  await page.goto("/recruiter-search");

  const brief = page.getByLabel("Search brief");
  await brief.fill("Edited applied AI leadership brief");
  await selectRecruiterLocation(page, "Dubai");
  await page.getByLabel("Specialisms").fill("Data and AI");
  await page.getByLabel("Target industries").fill("Technology");
  await page.getByLabel("Recruiters to find").fill("0");
  await page.getByRole("button", { name: "Start research" }).click();

  await expect(page.getByRole("alert")).toContainText("highlighted field");
  await expect(page.getByLabel("Recruiters to find")).toHaveAttribute("aria-invalid", "true");
  await expect(brief).toHaveValue("Edited applied AI leadership brief");
  await expect(
    page.getByRole("button", { name: "Remove Dubai, United Arab Emirates" }),
  ).toBeVisible();
});

test("cancels an active recruiter run and retries with the frozen brief and plan", async ({
  page,
}) => {
  await page.goto("/recruiter-search");
  await page.getByLabel("Search brief").fill("UAE data and AI hiring");
  await selectRecruiterLocation(page, "Abu Dhabi");
  await page.getByLabel("Specialisms").fill("Data and AI, Architecture");
  await page.getByLabel("Target industries").fill("Government, Energy");
  await page.getByLabel("Recruiters to find").fill("10");
  await page.getByRole("button", { name: "Start research" }).click();

  await expect(
    page.getByRole("heading", { level: 3, name: "Recruitment Search 1", exact: true }),
  ).toBeVisible();
  const previousRunId = new URL(page.url()).searchParams.get("run");
  if (!previousRunId) {
    throw new Error("The initial recruiter research run did not have an identity.");
  }
  await page.getByRole("button", { name: "Cancel research" }).click();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(page.getByText("Technology Recruiter 1", { exact: true })).toBeVisible();
  const sourcePlan = page.getByRole("region", { name: "Source plan" });
  await expect(sourcePlan.getByText("Public HTTPS firm pages", { exact: true })).toBeVisible();
  await expect(
    sourcePlan.getByText("Public LinkedIn profile results", { exact: true }),
  ).toBeVisible();
  await expect(sourcePlan.getByText("Skipped", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry with the same plan" }).click();

  await expect(page).toHaveURL(/\/recruiter-search\?run=/);
  await expect(page.getByText(`Retry of ${previousRunId}`, { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Criteria: Abu Dhabi Emirate, United Arab Emirates; Data and AI, Architecture; Government, Energy",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Search brief")).toHaveValue("UAE data and AI hiring");
  await expect(page.getByLabel("Recruiters to find")).toHaveValue("10");
  await expect(page.getByText("Technology Recruiter 1", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByRole("heading", { level: 3, name: "Recruitment Search 1", exact: true }),
  ).toHaveCount(1);
});

test("creates a named Shortlist and makes Prospect contact exclusions explicit", async ({
  page,
}) => {
  const shortlistName = `UAE recruiter Shortlist ${crypto.randomUUID()}`;
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/recruiter-research");
  await page.getByLabel("Search brief").fill("UAE software engineering recruitment");
  await selectRecruiterLocation(page, "Dubai");
  await page.getByLabel("Specialisms").fill("Software engineering");
  await page.getByLabel("Target industries").fill("Financial services");
  await page.getByLabel("Recruiters to find").fill("10");
  await page.getByRole("button", { name: "Start research" }).click();
  await expect(page.getByText("Technology Recruiter 1", { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  await page.getByLabel("Shortlist name").fill(shortlistName);
  await page.getByRole("button", { name: "Create Shortlist" }).click();
  const shortlist = page.getByRole("article").filter({
    has: page.getByRole("heading", { level: 4, name: shortlistName }),
  });
  await expect(shortlist).toBeVisible();

  const recruiterResult = page
    .getByRole("listitem")
    .filter({ hasText: "Technology Recruiter 1" })
    .first();
  await expect(recruiterResult.locator(".recruiter-add-to-shortlist label > span")).toHaveCSS(
    "text-transform",
    "uppercase",
  );
  await recruiterResult.locator(".recruiter-add-to-shortlist").screenshot({
    path: "test-results/recruiter-add-to-shortlist-desktop-crop.png",
  });
  await recruiterResult.getByLabel("Add to Shortlist").selectOption({ label: shortlistName });
  await recruiterResult.getByRole("button", { name: "Add Prospect" }).click();

  await expect(shortlist.getByText("Technology Recruiter 1", { exact: true })).toBeVisible();
  await expect(
    shortlist.getByText("Prior engagement: None recorded", { exact: true }),
  ).toBeVisible();
  await expect(shortlist.getByText("1 retained public source", { exact: true })).toBeVisible();
  await expect(
    shortlist.getByText("Ineligible for Campaign preparation", { exact: true }),
  ).toBeVisible();
  await expect(
    shortlist.getByText("No current publicly evidenced work Contact route is available.", {
      exact: true,
    }),
  ).toBeVisible();

  await shortlist.getByRole("button", { name: "Do Not Contact" }).click();
  await expect(
    shortlist.getByText("Contact exclusion: Do Not Contact", { exact: true }),
  ).toBeVisible();
  await expect(shortlist.getByText(/Do Not Contact excludes this Prospect/)).toBeVisible();
  await expect(shortlist.getByText("DNC", { exact: true })).toHaveCount(0);
  await shortlist.locator(".recruiter-evidence-history summary").click();
  await expect(
    shortlist.getByRole("link", {
      name: "https://www.linkedin.com/in/technology-recruiter-1",
    }),
  ).toBeVisible();
  await expect(shortlist.getByText("Deterministic public LinkedIn-profile fixture.")).toBeVisible();
  await expect(shortlist.getByText(/Observed \d{4}-\d{2}-\d{2} · high confidence/)).toBeVisible();

  const [desktopSection, desktopCreateForm, desktopCreateButton, desktopCard] = await Promise.all([
    page.getByRole("region", { name: "Shortlists" }).boundingBox(),
    page.locator(".recruiter-shortlist-create").boundingBox(),
    page.getByRole("button", { name: "Create Shortlist" }).boundingBox(),
    shortlist.boundingBox(),
  ]);
  assertContained(desktopSection, desktopCreateForm, "desktop Shortlist create form");
  assertContained(desktopSection, desktopCreateButton, "desktop Shortlist create button");
  assertContained(desktopSection, desktopCard, "desktop Shortlist");
  expect(
    (await new AxeBuilder({ page }).include(".recruiter-shortlists").analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: "test-results/recruiter-shortlist-desktop.png", fullPage: true });
  await page.getByRole("region", { name: "Shortlists" }).screenshot({
    path: "test-results/recruiter-shortlist-desktop-crop.png",
  });

  await page.evaluate(() => {
    window.localStorage.setItem("job-radar-theme", "dark");
    document.documentElement.dataset.theme = "dark";
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    (await new AxeBuilder({ page }).include(".recruiter-shortlists").analyze()).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/recruiter-shortlist-desktop-dark.png",
    fullPage: true,
  });
  await page.getByRole("region", { name: "Shortlists" }).screenshot({
    path: "test-results/recruiter-shortlist-desktop-dark-crop.png",
  });

  await page.evaluate(() => {
    window.localStorage.setItem("job-radar-theme", "light");
    document.documentElement.dataset.theme = "light";
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await shortlist.scrollIntoViewIfNeeded();
  const [
    mobileSection,
    mobileHeadingCopy,
    mobileCreateForm,
    mobileCreateButton,
    mobileCard,
    mobileHeadingGap,
  ] = await Promise.all([
    page.getByRole("region", { name: "Shortlists" }).boundingBox(),
    page.locator(".recruiter-shortlists-heading > div").boundingBox(),
    page.locator(".recruiter-shortlist-create").boundingBox(),
    page.getByRole("button", { name: "Create Shortlist" }).boundingBox(),
    shortlist.boundingBox(),
    page
      .locator(".recruiter-shortlists-heading")
      .evaluate((element) => Number.parseFloat(window.getComputedStyle(element).gap)),
  ]);
  assertContained(mobileSection, mobileCreateForm, "mobile Shortlist create form");
  assertContained(mobileSection, mobileCreateButton, "mobile Shortlist create button");
  assertContained(mobileSection, mobileCard, "mobile Shortlist");
  if (!mobileHeadingCopy || !mobileCreateForm) {
    throw new Error("Mobile Shortlist heading and create form must be measurable.");
  }
  expect(mobileCreateForm.y - (mobileHeadingCopy.y + mobileHeadingCopy.height)).toBeLessThanOrEqual(
    mobileHeadingGap + 1,
  );
  expect((mobileCard?.width ?? 391) + (mobileCard?.x ?? 0)).toBeLessThanOrEqual(390);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/recruiter-shortlist-mobile.png", fullPage: true });
  const mobileShortlistHeading = page.locator(".recruiter-shortlists-heading");
  await mobileShortlistHeading.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await mobileShortlistHeading.screenshot({
    path: "test-results/recruiter-shortlist-mobile-create-crop.png",
  });
  const mobileProspect = shortlist.locator(".recruiter-shortlist-prospects > li");
  await mobileProspect.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const [mobileProspectBox, mobileMastheadBox, mobileNavigationBox] = await Promise.all([
    mobileProspect.boundingBox(),
    page.locator(".masthead").boundingBox(),
    page.getByRole("navigation", { name: "Primary navigation" }).boundingBox(),
  ]);
  if (!mobileProspectBox || !mobileMastheadBox || !mobileNavigationBox) {
    throw new Error("Mobile Prospect and navigation geometry must be measurable.");
  }
  expect(mobileProspectBox.y).toBeGreaterThanOrEqual(
    mobileMastheadBox.y + mobileMastheadBox.height,
  );
  expect(mobileProspectBox.y + mobileProspectBox.height).toBeLessThanOrEqual(mobileNavigationBox.y);
  await mobileProspect.screenshot({
    path: "test-results/recruiter-shortlist-mobile-crop.png",
  });

  await shortlist.getByRole("button", { name: "Remove Prospect" }).click();
  await expect(
    shortlist.getByText("No Prospect has been added yet.", { exact: true }),
  ).toBeVisible();
  await shortlist.getByRole("button", { name: "Delete Shortlist" }).click();
  await expect(page.getByRole("heading", { level: 4, name: shortlistName })).toHaveCount(0);
});

test("uses the shared country catalogue in the location autocomplete and keeps compact desktop rows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/recruiter-search");

  await expect(page.getByText("Local search brief", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Research settings" })).toHaveCount(0);
  await expect(page.getByLabel("Codex model")).toBeVisible();
  await expect(page.getByLabel("Reasoning effort")).toBeVisible();
  const [pageTitle, briefHeading, briefLabel] = await Promise.all([
    page.getByRole("heading", { level: 1, name: "Recruiter Search" }).boundingBox(),
    page.getByRole("heading", { level: 2, name: "Set the market focus" }).boundingBox(),
    page.getByText("Search brief", { exact: true }).boundingBox(),
  ]);
  if (!pageTitle || !briefHeading || !briefLabel) {
    throw new Error("Recruiter research content edges must be measurable.");
  }
  expect(Math.abs(pageTitle.x - briefHeading.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(pageTitle.x - briefLabel.x)).toBeLessThanOrEqual(1);

  const targetLocations = page.getByLabel("Target locations");
  await expect(targetLocations).toHaveAttribute("role", "combobox");
  await expect(page.locator('select[name="targetLocations"]')).toHaveCount(0);
  const browseResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/location-options.data?q=") && response.status() === 200,
  );
  await targetLocations.click();
  await browseResponse;
  await expect(targetLocations).toBeEditable();
  const locationListboxId = (await targetLocations.getAttribute("aria-controls")) ?? "";
  const locationListbox = page.locator(`#${locationListboxId}`);
  const zimbabwe = locationListbox.getByRole("option", { name: "Zimbabwe Country · ZW" });
  await expect(zimbabwe).toBeVisible();
  expect(await locationListbox.getByRole("option").count()).toBeGreaterThan(200);
  await zimbabwe.scrollIntoViewIfNeeded();
  expect(await locationListbox.evaluate((listbox) => listbox.scrollTop)).toBeGreaterThan(0);
  await zimbabwe.click();
  await expect(page.getByLabel("Remove Zimbabwe")).toBeVisible();
  await targetLocations.fill("Chi");
  await expect(targetLocations).toHaveValue("Chi");
  await expect(page.getByRole("option").filter({ hasText: "Chile" }).first()).toBeVisible();
  await expect(page.getByRole("option").filter({ hasText: "China" }).first()).toBeVisible();
  await page.getByRole("option").filter({ hasText: "China" }).first().click();
  await expect(page.getByLabel("Remove China")).toHaveCount(1);
  await targetLocations.fill("China");
  await expect(page.getByRole("option").filter({ hasText: "China" })).toHaveCount(0);
  await expect(page.getByLabel("Remove China")).toHaveCount(1);
  await targetLocations.fill("");
  await targetLocations.press("Backspace");
  await expect(page.getByLabel("Remove China")).toHaveCount(0);
  await targetLocations.press("Escape");
  await page.getByLabel("Remove Zimbabwe").click();
  await expect(page.getByLabel("Geography")).toHaveCount(0);

  const controls = await Promise.all(
    [
      "Search brief",
      "Target locations",
      "Specialisms",
      "Target industries",
      "Firms to find",
      "Recruiters to find",
    ].map(async (label) => page.getByLabel(label).boundingBox()),
  );
  const [brief, locations, specialisms, industries, firmTarget, recruiterTarget] =
    requiredBoxes(controls);
  if (!brief || !locations || !specialisms || !industries || !firmTarget || !recruiterTarget) {
    throw new Error("Recruiter controls must be rendered before layout is measured.");
  }
  expect(brief.width).toBeGreaterThan(specialisms.width);
  expect(Math.abs(specialisms.y - industries.y)).toBeLessThan(4);
  expect(specialisms.x).toBeLessThan(industries.x);
  expect(Math.abs(locations.y - recruiterTarget.y)).toBeLessThan(4);
  expect(Math.abs(firmTarget.y - recruiterTarget.y)).toBeLessThan(4);
  expect(locations.x).toBeLessThan(recruiterTarget.x);
  expect(locations.height).toBeGreaterThanOrEqual(44);
  expect(locations.height).toBeLessThan(100);
  await targetLocations.press("Escape");
  await page.screenshot({ path: "test-results/recruiter-desktop.png", fullPage: true });
});

test("contains recruiter controls equally on mobile and clears the fixed navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/recruiter-search");

  const controls = await Promise.all(
    [
      "Search brief",
      "Target locations",
      "Specialisms",
      "Target industries",
      "Firms to find",
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
  await page.screenshot({ path: "test-results/recruiter-mobile.png" });

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
    await page.goto("/recruiter-search");

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

function assertContained(
  container: { readonly width: number; readonly x: number } | null,
  child: { readonly width: number; readonly x: number } | null,
  label: string,
) {
  if (!container || !child) {
    throw new Error(`${label} geometry must be measurable.`);
  }
  expect(child.x).toBeGreaterThanOrEqual(container.x);
  expect(child.x + child.width).toBeLessThanOrEqual(container.x + container.width);
}

async function selectRecruiterLocation(page: import("@playwright/test").Page, label: string) {
  await clearRecruiterLocations(page);
  const locations = page.getByLabel("Target locations");
  await locations.fill(label);
  await expect(page.getByRole("option").first()).toBeVisible();
  await locations.press("ArrowDown");
  await locations.press("Enter");
}

async function clearRecruiterLocations(page: import("@playwright/test").Page) {
  const removers = page.getByRole("button", { name: /^Remove / });
  while (await removers.count()) {
    await removers.first().click();
  }
}
