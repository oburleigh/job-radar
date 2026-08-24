import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("edits profile locations and salary currency through keyboard comboboxes", async ({
  page,
}) => {
  await page.goto("/profiles?new=1");

  const locations = page.getByRole("combobox", { name: "Target locations" });
  await locations.focus();
  await expect(locations).not.toHaveAttribute("aria-activedescendant");
  await locations.press("Tab");
  await expect(page.getByRole("button", { name: "Remove United Arab Emirates" })).toHaveCount(0);

  await locations.fill("not-a-country");
  await expect(locations).toHaveAttribute("aria-expanded", "false");
  await expect(locations).not.toHaveAttribute("aria-activedescendant");
  await expect(page.locator(`#${await locations.getAttribute("aria-controls")}`)).toBeHidden();

  await locations.fill("united arab");
  await expect(locations).not.toHaveAttribute("aria-activedescendant");
  await locations.press("ArrowDown");
  await locations.press("Enter");

  await expect(page.getByRole("button", { name: "Remove United Arab Emirates" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Salary currency" })).toHaveValue("AED");
  await expect(
    page.getByRole("status").filter({ hasText: "United Arab Emirates added" }),
  ).toBeVisible();

  await page.getByRole("combobox", { name: "Salary currency" }).fill("british pound");
  await page.getByRole("combobox", { name: "Salary currency" }).press("ArrowDown");
  await page.getByRole("combobox", { name: "Salary currency" }).press("Enter");
  await expect(page.getByRole("combobox", { name: "Salary currency" })).toHaveValue("GBP");

  await locations.fill("united arab");
  await locations.press("ArrowDown");
  await locations.press("Enter");
  await expect(page.getByRole("combobox", { name: "Salary currency" })).toHaveValue("GBP");

  await locations.fill("Canada");
  await locations.press("ArrowDown");
  await locations.press("Tab");
  await expect(page.getByRole("button", { name: "Remove Canada" })).toBeVisible();
  await expect(page.getByLabel("Include remote roles")).toBeFocused();

  await locations.fill("Free text location");
  await locations.press("Escape");
  await expect(locations).toHaveValue("Free text location");
  await expect(locations).toHaveAttribute("aria-expanded", "false");
  await locations.press("Enter");
  await expect(page.getByRole("button", { name: "Remove Free text location" })).toBeVisible();

  await locations.press("Backspace");
  await expect(page.getByRole("button", { name: "Remove Free text location" })).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Free text location removed" }),
  ).toBeVisible();
});

test("shows the target-location validation error on an empty profile submission", async ({
  page,
}) => {
  await page.goto("/profiles?new=1");

  await page.getByLabel("Profile name").fill("Empty locations");
  await page.getByLabel("Target job titles").fill("Engineer");
  await page.getByRole("button", { name: "Save profile" }).click();

  const locations = page.getByRole("combobox", { name: "Target locations" });
  await expect(locations).toHaveAttribute("aria-invalid", "true");
  await expect(locations).toHaveAttribute("aria-describedby", /.+/);
  await expect(page.locator(`#${await locations.getAttribute("aria-describedby")}`)).toHaveText(
    "Add at least one target location.",
  );
});

test("selects a country-aware default currency in runtime settings", async ({ page }) => {
  await page.goto("/settings");

  const currency = page.getByRole("combobox", { name: "Salary currency" });
  const savedCurrency = await currency.inputValue();
  await currency.fill("Canada");
  await expect(currency).not.toHaveAttribute("aria-activedescendant");
  await currency.press("Tab");
  await expect(currency).toHaveValue(savedCurrency);

  await currency.fill("Canada");
  await currency.press("ArrowDown");
  await currency.press("Enter");

  await expect(currency).toHaveValue("CAD");
});

for (const theme of ["light", "dark"] as const) {
  test(`has no automated accessibility violations in the profile editor in ${theme} mode`, async ({
    page,
  }) => {
    await page.addInitScript((selectedTheme) => {
      window.localStorage.setItem("job-radar-theme", selectedTheme);
    }, theme);
    await page.goto("/profiles?new=1");

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
}
