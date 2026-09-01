import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe
  .serial("clean-start onboarding", () => {
    test("shows product defaults without personal workspace records", async ({ page }) => {
      await page.goto("/");
      await expect(
        page.getByRole("heading", { level: 2, name: "Create a search profile first" }),
      ).toBeVisible();

      await page.goto("/settings/adapters/source-coverage");
      await expect(page.getByText("15 active", { exact: true })).toBeVisible();
      await expect(page.getByText("0 registered", { exact: true })).toBeVisible();
      await expect(
        page.getByText("Add a known ATS URL or run discovery to populate this registry."),
      ).toBeVisible();

      await page.goto("/activity");
      await expect(page.getByRole("heading", { level: 2, name: "No runs recorded" })).toBeVisible();
    });

    test("keeps profile actions with their saved profile tiles", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto("/profiles?new=1");

      await page.getByLabel("Profile name").fill("UAE engineering leadership");
      await chooseComboboxOption(page, "Salary currency", "AED");
      await page.getByLabel("Preferred salary minimum").fill("500000");
      await page.getByLabel("Preferred salary maximum").fill("750000");
      await page.getByLabel("Target job titles").fill("VP Engineering\nHead of Engineering");
      await chooseComboboxOption(page, "Target locations", "United Arab Emirates");
      await page.getByLabel("Include remote roles").check();
      await page.getByRole("button", { name: "Save profile" }).click();

      await expect(page).toHaveURL(/\/profiles\?profile=\d+$/);
      await expect(
        page.getByRole("heading", { level: 2, name: "UAE engineering leadership" }),
      ).toBeVisible();
      await expect(page.getByLabel("Salary currency")).toHaveValue("AED");

      const profileList = page.locator(".profile-list");
      const firstProfile = profileList.getByRole("link", {
        name: "UAE engineering leadership",
        exact: true,
      });
      const [cloneActions, deleteActions, newProfileTiles] = await Promise.all([
        profileList.getByRole("link", { name: "Clone UAE engineering leadership" }).count(),
        profileList.getByRole("button", { name: "Delete UAE engineering leadership" }).count(),
        profileList.getByRole("link", { name: "New profile", exact: true }).count(),
      ]);
      expect({ cloneActions, deleteActions, newProfileTiles }).toEqual({
        cloneActions: 1,
        deleteActions: 1,
        newProfileTiles: 1,
      });
      await expect(page.locator(".jr-header-actions")).toHaveCount(0);
      await expect(firstProfile.locator("button")).toHaveCount(0);

      const newProfileTile = profileList.getByRole("link", { name: "New profile", exact: true });
      await expect(newProfileTile).toBeVisible();
      await newProfileTile.focus();
      await expect(newProfileTile).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/profiles\?new=1$/);

      await page.getByLabel("Profile name").fill("Product leadership");
      await page.getByLabel("Target job titles").fill("Head of Product");
      await chooseComboboxOption(page, "Target locations", "United Arab Emirates");
      await page.getByRole("button", { name: "Save profile" }).click();
      await expect(
        page.getByRole("heading", { level: 2, name: "Product leadership" }),
      ).toBeVisible();

      await firstProfile.click();
      await expect(
        page.getByRole("heading", { level: 2, name: "UAE engineering leadership" }),
      ).toBeVisible();

      const secondProfile = profileList.getByRole("link", {
        name: "Product leadership",
        exact: true,
      });
      const secondProfileTile = secondProfile.locator("xpath=..");
      const cloneSecondProfile = profileList.getByRole("link", {
        name: "Clone Product leadership",
      });
      const deleteSecondProfile = profileList.getByRole("button", {
        name: "Delete Product leadership",
        exact: true,
      });
      await expect(secondProfile.locator("button")).toHaveCount(0);
      await expect(cloneSecondProfile).toBeVisible();
      await expect(deleteSecondProfile).toBeVisible();

      const [secondProfileBox, cloneBox, deleteBox, newProfileBox] = await Promise.all([
        secondProfileTile.boundingBox(),
        cloneSecondProfile.boundingBox(),
        deleteSecondProfile.boundingBox(),
        newProfileTile.boundingBox(),
      ]);
      if (!secondProfileBox || !cloneBox || !deleteBox || !newProfileBox) {
        throw new Error("Profile tile controls must be measurable.");
      }
      const titleCount = await secondProfileTile.getByText(/\d+ target titles/i).count();
      const actionGeometry = {
        actionsShareColumn: Math.abs(cloneBox.x - deleteBox.x) <= 1,
        actionsStackVertically: deleteBox.y >= cloneBox.y + cloneBox.height,
        titleCount,
      };
      expect(actionGeometry).toEqual({
        actionsShareColumn: true,
        actionsStackVertically: true,
        titleCount: 0,
      });
      for (const actionBox of [cloneBox, deleteBox]) {
        expect(actionBox.width).toBeGreaterThanOrEqual(44);
        expect(actionBox.width).toBeLessThanOrEqual(48);
        expect(actionBox.height).toBeGreaterThanOrEqual(44);
        expect(actionBox.height).toBeLessThanOrEqual(48);
        expect(actionBox.x).toBeGreaterThanOrEqual(secondProfileBox.x);
        expect(actionBox.x + actionBox.width).toBeLessThanOrEqual(
          secondProfileBox.x + secondProfileBox.width,
        );
        expect(actionBox.y).toBeGreaterThanOrEqual(secondProfileBox.y);
        expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(
          secondProfileBox.y + secondProfileBox.height,
        );
      }
      expect(newProfileBox.y).toBeGreaterThanOrEqual(secondProfileBox.y + secondProfileBox.height);

      await cloneSecondProfile.focus();
      await expect(cloneSecondProfile).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/profiles\?clone=\d+$/);
      await expect(page.getByLabel("Profile name")).toHaveValue("Product leadership copy");
      await page.getByRole("button", { name: "Save profile" }).click();
      await expect(
        page.getByRole("heading", { level: 2, name: "Product leadership copy" }),
      ).toBeVisible();

      await deleteSecondProfile.focus();
      await expect(deleteSecondProfile).toBeFocused();
      page.once("dialog", async (dialog) => {
        expect(dialog.type()).toBe("confirm");
        await dialog.accept();
      });
      await page.keyboard.press("Enter");
      await expect(
        profileList.getByRole("link", { name: "Product leadership", exact: true }),
      ).toHaveCount(0);
      await expect(
        profileList.getByRole("link", { name: "Product leadership copy", exact: true }),
      ).toBeVisible();

      await page.screenshot({ path: "test-results/profiles-desktop.png", fullPage: true });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.reload();
      await page.screenshot({ path: "test-results/profiles-desktop-dark.png", fullPage: true });
      await page.emulateMedia({ colorScheme: "light" });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      const mobileProfileList = page.locator(".profile-list");
      const mobileNewProfileTile = mobileProfileList.getByRole("link", {
        name: "New profile",
        exact: true,
      });
      const mobileLastSavedProfile = mobileProfileList.locator(".profile-tile").last();
      const [mobileNewProfileBox, mobileLastSavedProfileBox] = await Promise.all([
        mobileNewProfileTile.boundingBox(),
        mobileLastSavedProfile.boundingBox(),
      ]);
      if (!mobileNewProfileBox || !mobileLastSavedProfileBox) {
        throw new Error("The mobile profile list must be measurable.");
      }
      expect(mobileNewProfileBox.y).toBeGreaterThanOrEqual(
        mobileLastSavedProfileBox.y + mobileLastSavedProfileBox.height,
      );
      expect(Math.abs(mobileNewProfileBox.x - mobileLastSavedProfileBox.x)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(mobileNewProfileBox.width - mobileLastSavedProfileBox.width),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({ path: "test-results/profiles-mobile.png", fullPage: true });
    });

    test("adds an unknown ATS URL as a configurable search integration", async ({ page }) => {
      await page.goto("/settings/adapters/source-coverage");

      await page.getByLabel("Company").fill("Example");
      await page
        .getByLabel("Public ATS job, careers, or board URL")
        .fill("https://careers.example.com/jobs");
      await page.getByRole("button", { name: "Add ATS URL" }).click();

      await expect(page.getByText("Example search source added.")).toBeVisible();
      await expect(page.getByText("careers.example.com", { exact: true })).toBeVisible();

      await page.getByRole("link", { name: /System settings/i }).click();
      await page.getByRole("link", { name: "Adapters" }).click();
      await page.getByRole("link", { name: "ATS Registry" }).click();
      await expect(page.getByRole("link", { name: /Example/ })).toBeVisible();
    });

    test("sorts known company career sites through accessible column headers", async ({ page }) => {
      await page.goto("/settings/adapters/source-coverage");

      const companyField = page.getByLabel("Company", { exact: true });
      const urlField = page.getByLabel("Public ATS job, careers, or board URL");

      await companyField.fill("Sort Zebra 8472");
      await urlField.fill("https://jobs.ashbyhq.com/sort-zebra-8472");
      await page.getByRole("button", { name: "Add ATS URL" }).click();
      await expect(page.getByRole("link", { name: "Sort Zebra 8472" })).toBeVisible();

      await companyField.fill("Sort Alpha 8472");
      await urlField.fill("https://jobs.lever.co/sort-alpha-8472");
      await page.getByRole("button", { name: "Add ATS URL" }).click();

      const table = page.getByRole("table");
      const firstCompanyLink = table.locator("tbody tr").first().getByRole("link");
      await expect(firstCompanyLink).toHaveText("Sort Alpha 8472");
      await expect(
        table.getByRole("columnheader", { name: /^Sort by Company or slug/ }),
      ).toHaveAttribute("aria-sort", "ascending");

      const headers = ["Company or slug", "ATS", "Last refresh", "Health", "Enabled"];
      for (const label of headers) {
        const button = table.getByRole("button", { name: new RegExp(`^Sort by ${label}`) });
        const header = table.getByRole("columnheader", {
          name: new RegExp(`^Sort by ${label}`),
        });

        await button.click();
        await expect(header).toHaveAttribute(
          "aria-sort",
          label === "Company or slug" ? "descending" : "ascending",
        );

        if (label === "Company or slug" || label === "ATS") {
          await expect(firstCompanyLink).toHaveText("Sort Zebra 8472");
        }

        await button.click();
        await expect(header).toHaveAttribute(
          "aria-sort",
          label === "Company or slug" ? "ascending" : "descending",
        );
        if (label === "Company or slug" || label === "ATS") {
          await expect(firstCompanyLink).toHaveText("Sort Alpha 8472");
        }
      }
    });

    test("keeps company-board refresh opt-in without losing the saved choice", async ({ page }) => {
      await page.goto("/settings/adapters/source-coverage");

      const disabledSwitch = page.getByRole("switch", {
        name: "Enable all registered boards for discovery",
      });
      await expect(disabledSwitch).not.toBeChecked();
      await disabledSwitch.click();
      await expect(
        page.getByRole("switch", { name: "Disable all registered boards for discovery" }),
      ).toBeChecked();

      await page.reload();
      const enabledSwitch = page.getByRole("switch", {
        name: "Disable all registered boards for discovery",
      });
      await expect(enabledSwitch).toBeChecked();

      await enabledSwitch.click();
      await expect(
        page.getByRole("switch", { name: "Enable all registered boards for discovery" }),
      ).not.toBeChecked();
    });

    test("saves runtime settings and keeps the settings page accessible", async ({ page }) => {
      await page.goto("/settings/opportunities");

      await expect(page.locator(".jr-page-header").getByRole("link")).toHaveCount(0);

      await page.getByLabel("Requested web results per query").fill("50");
      await page.getByRole("button", { name: "Save runtime settings" }).click();

      await expect(page.getByText("Runtime settings saved to SQLite.")).toBeVisible();

      await page
        .getByRole("navigation", { name: "Settings" })
        .getByRole("link", { name: "Recruiter Search" })
        .click();
      await page
        .getByRole("navigation", { name: "Recruiter Search settings" })
        .getByRole("link", { name: "Public search" })
        .click();
      await expect(page.getByRole("heading", { level: 2, name: "Public search" })).toBeVisible();
      await page.getByLabel("Requests per stage").fill("24");
      await page.getByRole("button", { name: "Save public search settings" }).click();
      await expect(page.getByText("Public search settings saved to SQLite.")).toBeVisible();
      await page.reload();
      await expect(page.getByLabel("Requests per stage")).toHaveValue("24");

      await page
        .getByRole("navigation", { name: "Recruiter Search settings" })
        .getByRole("link", { name: "Directory ranking" })
        .click();
      await page.getByLabel("Specialism", { exact: true }).fill("25");
      await page.getByLabel("Current mandates or activity", { exact: true }).fill("10");
      await page.getByRole("button", { name: "Save directory ranking" }).click();
      await expect(page.getByText("Directory ranking saved to SQLite.")).toBeVisible();
      await page.reload();
      await expect(page.getByLabel("Specialism", { exact: true })).toHaveValue("25");
      await expect(page.getByLabel("Current mandates or activity", { exact: true })).toHaveValue(
        "10",
      );

      await page
        .getByRole("navigation", { name: "Settings" })
        .getByRole("link", { name: "Opportunities" })
        .click();
      await page.getByLabel("First retry delay (ms)").fill("4000");
      const maximumRetryDelay = page.getByLabel("Maximum retry delay (ms)");
      await maximumRetryDelay.fill("500");
      await page.getByRole("button", { name: "Save runtime settings" }).click();

      await expect(
        page.getByRole("alert").filter({
          hasText: "Maximum retry delay must be at least the first retry delay.",
        }),
      ).toBeVisible();
      await expect(maximumRetryDelay).toBeFocused();
      await expect(maximumRetryDelay).toHaveAttribute("aria-invalid", "true");
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);

      await maximumRetryDelay.fill("4000");
      await page.getByRole("button", { name: "Save runtime settings" }).click();
      await expect(page.getByText("Runtime settings saved to SQLite.")).toBeVisible();
      await page.setViewportSize({ width: 1440, height: 1000 });
      const marketVocabulary = page.getByLabel("Market vocabulary (JSON)");
      const providerExecution = page.getByRole("group", { name: "Provider execution" });
      const structuredVerificationSources = page.getByLabel("Structured verification source IDs");
      const closedListingMarkers = page.getByLabel("Closed-listing markers");
      const [marketBox, providerBox, structuredBox, closedListingBox] = await Promise.all([
        marketVocabulary.boundingBox(),
        providerExecution.boundingBox(),
        structuredVerificationSources.boundingBox(),
        closedListingMarkers.boundingBox(),
      ]);
      if (!marketBox || !providerBox || !structuredBox || !closedListingBox) {
        throw new Error("The runtime settings editors must be measurable.");
      }
      const desktopSettingsGeometry = {
        marketAndProviderAlign:
          Math.abs(marketBox.x - providerBox.x) <= 1 &&
          Math.abs(marketBox.width - providerBox.width) <= 1,
        providerBelowMarket: providerBox.y >= marketBox.y + marketBox.height,
        textAreasAlign:
          Math.abs(structuredBox.y - closedListingBox.y) <= 1 &&
          Math.abs(structuredBox.width - closedListingBox.width) <= 1,
      };
      expect(desktopSettingsGeometry).toEqual({
        marketAndProviderAlign: true,
        providerBelowMarket: true,
        textAreasAlign: true,
      });
      await page.screenshot({ path: "test-results/settings-desktop.png", fullPage: true });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.reload();
      await page.screenshot({ path: "test-results/settings-desktop-dark.png", fullPage: true });
      await page.emulateMedia({ colorScheme: "light" });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      const [mobileMarketBox, mobileProviderBox, mobileStructuredBox, mobileClosedListingBox] =
        await Promise.all([
          marketVocabulary.boundingBox(),
          providerExecution.boundingBox(),
          structuredVerificationSources.boundingBox(),
          closedListingMarkers.boundingBox(),
        ]);
      if (
        !mobileMarketBox ||
        !mobileProviderBox ||
        !mobileStructuredBox ||
        !mobileClosedListingBox
      ) {
        throw new Error("The mobile runtime settings editors must be measurable.");
      }
      for (const box of [
        mobileMarketBox,
        mobileProviderBox,
        mobileStructuredBox,
        mobileClosedListingBox,
      ]) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(390);
      }
      expect(Math.abs(mobileMarketBox.width - mobileProviderBox.width)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(mobileStructuredBox.width - mobileClosedListingBox.width),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({ path: "test-results/settings-mobile.png", fullPage: true });
    });

    test("saves the Recruiter Search criteria catalogues", async ({ page }) => {
      await page.goto("/settings/recruiter-search/research-criteria");
      await page.getByText("Edit industries and Specialisms", { exact: true }).click();
      const industries = page.getByRole("textbox", { name: "Target industries", exact: true });
      await industries.fill(`${await industries.inputValue()}\nAerospace`);
      await page.getByRole("button", { name: "Save Research criteria" }).click();

      await expect(page.getByText("Research criteria saved to SQLite.")).toBeVisible();
      await page.reload();
      await page.getByText("Edit industries and Specialisms", { exact: true }).click();
      await expect(
        page.getByRole("textbox", { name: "Target industries", exact: true }),
      ).toHaveValue(/Aerospace/);
      await page.screenshot({
        fullPage: true,
        path: "test-results/recruiter-settings-desktop.png",
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        fullPage: true,
        path: "test-results/recruiter-settings-mobile.png",
      });
    });

    test("uses a compact contextual source registry control", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto("/settings/adapters/source-coverage");

      const refreshRegistry = page.getByRole("button", { name: "Refresh board registry" });
      const sourceHeadingActions = page
        .locator(".source-section")
        .first()
        .locator(".jr-section-header-trailing");
      const activeSourceCount = page
        .locator(".source-section")
        .first()
        .locator(".jr-section-header-trailing > span");
      await expect(page.getByText("Source registry actions", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Add ATS integration" })).toHaveCount(0);
      await expect(refreshRegistry).toHaveAttribute("title", "Refresh board registry");
      await expect(activeSourceCount).toHaveText(/^\d+ active$/);
      const refreshBox = await refreshRegistry.boundingBox();
      if (!refreshBox) {
        throw new Error("Source registry control must be measurable.");
      }
      expect(refreshBox.width).toBe(refreshBox.height);
      const [
        pageHeader,
        pageTitle,
        sourceHeadingRule,
        sourceHeading,
        sourceHeadingActionsBox,
        activeSourceCountBox,
        sourceGrid,
        knownSitesHeadingRule,
        knownSitesHeading,
        knownSitesCount,
        knownSitesPanel,
      ] = await Promise.all([
        page.locator(".jr-page-header").boundingBox(),
        page.getByRole("heading", { level: 2, name: "Source Coverage" }).boundingBox(),
        page.locator(".source-section").first().locator(".jr-section-header").boundingBox(),
        page.getByRole("heading", { level: 2, name: "Where discovery looks" }).boundingBox(),
        sourceHeadingActions.boundingBox(),
        activeSourceCount.boundingBox(),
        page.locator(".source-grid").boundingBox(),
        page.locator(".source-section").nth(1).locator(".jr-section-header").boundingBox(),
        page.getByRole("heading", { level: 2, name: "Known company career sites" }).boundingBox(),
        page
          .locator(".source-section")
          .nth(1)
          .locator(".jr-section-header-trailing > span")
          .boundingBox(),
        page.locator(".source-section").nth(1).locator(".panel").boundingBox(),
      ]);
      if (
        !pageHeader ||
        !pageTitle ||
        !sourceHeadingRule ||
        !sourceHeading ||
        !sourceHeadingActionsBox ||
        !activeSourceCountBox ||
        !sourceGrid ||
        !knownSitesHeadingRule ||
        !knownSitesHeading ||
        !knownSitesCount ||
        !knownSitesPanel
      ) {
        throw new Error("Source header and content edges must be measurable.");
      }
      await expect(page.locator(".jr-page-header")).not.toHaveAttribute("data-has-actions");
      await expect(page.locator(".jr-header-actions")).toHaveCount(0);
      expect(Math.abs(pageHeader.x - sourceHeadingRule.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(pageHeader.width - sourceHeadingRule.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(pageHeader.x - sourceGrid.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(pageHeader.width - sourceGrid.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(pageHeader.x - pageTitle.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(sourceHeading.x - sourceGrid.x)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(
          sourceHeadingActionsBox.x +
            sourceHeadingActionsBox.width -
            (sourceGrid.x + sourceGrid.width),
        ),
      ).toBeLessThanOrEqual(2);
      expect(Math.abs(knownSitesHeadingRule.x - knownSitesPanel.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(knownSitesHeading.x - knownSitesPanel.x)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(
          knownSitesCount.x + knownSitesCount.width - (knownSitesPanel.x + knownSitesPanel.width),
        ),
      ).toBeLessThanOrEqual(2);
      expect(refreshBox.x).toBeGreaterThan(activeSourceCountBox.x);
      expect(refreshBox.x + refreshBox.width).toBeLessThanOrEqual(
        sourceHeadingActionsBox.x + sourceHeadingActionsBox.width,
      );
      expect(
        Math.abs(
          refreshBox.y +
            refreshBox.height / 2 -
            (activeSourceCountBox.y + activeSourceCountBox.height / 2),
        ),
      ).toBeLessThanOrEqual(1);
      const appearance = await refreshRegistry.evaluate((element) => {
        const styles = getComputedStyle(element);
        return { background: styles.backgroundColor, borderColor: styles.borderTopColor };
      });
      expect(appearance.background).not.toBe("rgba(0, 0, 0, 0)");
      expect(appearance.borderColor).not.toBe("rgba(0, 0, 0, 0)");
      const sourceNames = await page.locator(".source-card-copy strong").allTextContents();
      expect(sourceNames).toEqual(sourceNames.toSorted((left, right) => left.localeCompare(right)));
      await page.screenshot({ path: "test-results/sources-desktop.png", fullPage: true });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.reload();
      await expect(page.getByRole("heading", { level: 2, name: "Source Coverage" })).toBeVisible();
      await page.screenshot({ path: "test-results/sources-desktop-dark.png", fullPage: true });
      await page.emulateMedia({ colorScheme: "light" });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: "test-results/sources-mobile.png", fullPage: true });
    });

    test("loads every primary workspace route from the clean-start dataset", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByText("The roles worth your attention", { exact: true })).toHaveCount(
        0,
      );

      const routes = [
        ["/profiles", "Search profiles"],
        ["/activity", "Activity"],
        ["/settings/adapters/source-coverage", "Settings"],
        ["/settings/opportunities", "Settings"],
      ] as const;

      for (const [path, heading] of routes) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      }
    });
  });

async function chooseComboboxOption(
  page: import("@playwright/test").Page,
  label: string,
  value: string,
) {
  const input = page.getByRole("combobox", { name: label });
  await input.fill(value);
  if (label === "Target locations") {
    await expect(page.getByRole("option").filter({ hasText: value }).first()).toBeVisible();
  }
  await input.press("ArrowDown");
  await input.press("Enter");
}
