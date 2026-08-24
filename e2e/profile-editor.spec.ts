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

  await locations.fill("china");
  await locations.press("Enter");
  await expect(page.getByRole("button", { name: "Remove China" })).toBeVisible();
  await expect(locations).toHaveValue("");

  await locations.fill("oli");
  await locations.press("Enter");
  await expect(page.getByRole("button", { name: "Remove oli" })).toHaveCount(0);
  await expect(locations).toHaveValue("oli");
  await expect(locations).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(`#${await locations.getAttribute("aria-describedby")}`)).toHaveText(
    "Choose a target location from the suggestions.",
  );

  await locations.fill("");
  await locations.press("Backspace");
  await expect(page.getByRole("button", { name: "Remove China" })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "China removed" })).toBeVisible();
});

test("adds the active target-location suggestion with Tab from an empty query", async ({
  page,
}) => {
  await page.goto("/profiles?new=1");

  const locations = page.getByRole("combobox", { name: "Target locations" });
  await locations.focus();
  await locations.press("ArrowDown");
  await locations.press("Tab");

  await expect(page.getByRole("button", { name: "Remove Afghanistan" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Salary currency" })).toHaveValue("AFN");
  await expect(page.getByLabel("Include remote roles")).toBeFocused();
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

test("presents shared currencies without assigning them to an arbitrary country", async ({
  page,
}) => {
  await page.goto("/profiles?new=1");
  await page.waitForLoadState("networkidle");

  const currency = page.getByRole("combobox", { name: "Salary currency" });
  await currency.fill("USD");
  const usdOption = page.getByRole("option").filter({ hasText: "USD" });
  await expect(usdOption).toBeVisible();
  await expect(usdOption).not.toContainText("American Samoa");

  await currency.fill("EUR");
  const eurOption = page.getByRole("option").filter({ hasText: "EUR" });
  await expect(eurOption).toBeVisible();
  await expect(eurOption).not.toContainText("Andorra");
});

test("browses complete currency and location catalogues beyond the initial viewport", async ({
  page,
}) => {
  await page.goto("/profiles?new=1");
  await page.waitForLoadState("networkidle");

  const currency = page.getByRole("combobox", { name: "Salary currency" });
  await currency.fill("");
  await currency.focus();
  const currencyListboxId = (await currency.getAttribute("aria-controls")) ?? "";
  const currencyListbox = page.locator(`#${currencyListboxId}`);
  await expect(currencyListbox).toBeVisible();
  expect(await currencyListbox.getByRole("option").count()).toBeGreaterThan(10);

  for (let index = 0; index < 12; index += 1) {
    await currency.press("ArrowDown");
  }
  const activeCurrencyId = (await currency.getAttribute("aria-activedescendant")) ?? "";
  const activeCurrency = page.locator(`#${activeCurrencyId}`);
  await expect(activeCurrency).toContainText("BBD");
  const currencyScroll = await currencyListbox.evaluate((listbox, activeId) => {
    const active = document.getElementById(activeId);
    if (!active) {
      return { activeIsVisible: false, scrollTop: listbox.scrollTop };
    }
    const listboxBounds = listbox.getBoundingClientRect();
    const activeBounds = active.getBoundingClientRect();
    return {
      activeIsVisible:
        activeBounds.top >= listboxBounds.top && activeBounds.bottom <= listboxBounds.bottom,
      scrollTop: listbox.scrollTop,
    };
  }, activeCurrencyId);
  expect(currencyScroll.scrollTop).toBeGreaterThan(0);
  expect(currencyScroll.activeIsVisible).toBe(true);
  await currency.press("Escape");
  await expect(currency).not.toHaveAttribute("aria-activedescendant");
  await page.getByLabel("Preferred salary minimum").focus();
  await currency.focus();
  await expect(currency).not.toHaveAttribute("aria-activedescendant");
  await currency.press("ArrowUp");
  const lastCurrencyId = (await currency.getAttribute("aria-activedescendant")) ?? "";
  await expect(page.locator(`#${lastCurrencyId}`)).toContainText("ZWL");
  await currency.press("Escape");

  const locations = page.getByRole("combobox", { name: "Target locations" });
  await locations.fill("");
  await locations.focus();
  const locationListboxId = (await locations.getAttribute("aria-controls")) ?? "";
  const locationListbox = page.locator(`#${locationListboxId}`);
  await expect(locationListbox).toBeVisible();
  expect(await locationListbox.getByRole("option").count()).toBeGreaterThan(10);
  await expect(locationListbox.getByRole("option").first()).toHaveText("AfghanistanAFN");

  const zambia = locationListbox.getByRole("option", { name: "Zambia ZMW" });
  await zambia.scrollIntoViewIfNeeded();
  expect(await locationListbox.evaluate((listbox) => listbox.scrollTop)).toBeGreaterThan(0);
  await zambia.click();
  await expect(page.getByRole("button", { name: "Remove Zambia" })).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  test(`has no automated accessibility violations in the profile editor in ${theme} mode`, async ({
    page,
  }) => {
    await page.addInitScript((selectedTheme) => {
      window.localStorage.setItem("job-radar-theme", selectedTheme);
    }, theme);
    await page.goto("/profiles?new=1");
    await page.waitForLoadState("networkidle");

    const currency = page.getByRole("combobox", { name: "Salary currency" });
    await currency.fill("");
    await currency.press("ArrowDown");
    await expect(currency).toHaveAttribute("aria-expanded", "true");
    const currencyListboxId = (await currency.getAttribute("aria-controls")) ?? "";
    const currencyActiveId = (await currency.getAttribute("aria-activedescendant")) ?? "";
    await expect(page.locator(`#${currencyListboxId}`)).toBeVisible();
    await expect(page.locator(`#${currencyActiveId}`)).toHaveRole("option");
    const currencyResults = await new AxeBuilder({ page }).analyze();
    expect(currencyResults.violations).toEqual([]);
    await currency.press("Escape");
    await expect(currency).not.toHaveAttribute("aria-activedescendant");

    const locations = page.getByRole("combobox", { name: "Target locations" });
    await locations.press("ArrowDown");
    await expect(locations).toHaveAttribute("aria-expanded", "true");
    const locationListboxId = (await locations.getAttribute("aria-controls")) ?? "";
    const locationActiveId = (await locations.getAttribute("aria-activedescendant")) ?? "";
    await expect(page.locator(`#${locationListboxId}`)).toBeVisible();
    await expect(page.locator(`#${locationActiveId}`)).toHaveRole("option");
    const locationResults = await new AxeBuilder({ page }).analyze();
    expect(locationResults.violations).toEqual([]);
  });
}
