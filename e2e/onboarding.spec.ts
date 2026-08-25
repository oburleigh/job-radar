import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe
  .serial("clean-start onboarding", () => {
    test("shows product defaults without personal workspace records", async ({ page }) => {
      await page.goto("/");
      await expect(
        page.getByRole("heading", { level: 2, name: "Create a search profile first" }),
      ).toBeVisible();

      await page.goto("/sources");
      await expect(page.getByText("15 active", { exact: true })).toBeVisible();
      await expect(page.getByText("0 discovered", { exact: true })).toBeVisible();
      await expect(
        page.getByText("Add a known ATS URL or run discovery to populate this registry."),
      ).toBeVisible();

      await page.goto("/runs");
      await expect(page.getByRole("heading", { level: 2, name: "No runs recorded" })).toBeVisible();
    });

    test("creates a salary-aware profile from an empty database", async ({ page }) => {
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
    });

    test("adds an unknown ATS URL as a configurable search integration", async ({ page }) => {
      await page.goto("/sources");

      await page.getByLabel("Company").fill("Example");
      await page
        .getByLabel("Public ATS job, careers, or board URL")
        .fill("https://careers.example.com/jobs");
      await page.getByRole("button", { name: "Add ATS URL" }).click();

      await expect(page.getByText("Example search source added.")).toBeVisible();
      await expect(page.getByText("careers.example.com", { exact: true })).toBeVisible();

      await page.getByRole("link", { name: /System settings/i }).click();
      await expect(page.getByRole("link", { name: /Example/ })).toBeVisible();
    });

    test("sorts known company career sites through accessible column headers", async ({ page }) => {
      await page.goto("/sources");

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
      const companyLinks = table.getByRole("link", { name: /^Sort (?:Alpha|Zebra) 8472$/ });
      await expect(companyLinks).toHaveText(["Sort Alpha 8472", "Sort Zebra 8472"]);
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

        if (label === "ATS") {
          await expect(companyLinks).toHaveText(["Sort Zebra 8472", "Sort Alpha 8472"]);
        }

        await button.click();
        await expect(header).toHaveAttribute(
          "aria-sort",
          label === "Company or slug" ? "ascending" : "descending",
        );
      }
    });

    test("saves runtime settings and keeps the settings page accessible", async ({ page }) => {
      await page.goto("/settings");

      await page.getByLabel("Requested web results per query").fill("50");
      await page.getByRole("button", { name: "Save runtime settings" }).click();

      await expect(page.getByText("Runtime settings saved to SQLite.")).toBeVisible();

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
    });

    test("loads every primary workspace route from the clean-start dataset", async ({ page }) => {
      const routes = [
        ["/", "The roles worth your attention"],
        ["/profiles", "Profiles"],
        ["/sources", "Sources and company boards"],
        ["/runs", "Discovery history"],
        ["/settings", "Settings"],
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
  await input.press("ArrowDown");
  await input.press("Enter");
}
