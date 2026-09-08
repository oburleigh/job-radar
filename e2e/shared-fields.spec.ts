import { expect, type Locator, test } from "@playwright/test";

async function measure(control: Locator) {
  return control.evaluate((input) => {
    const field = input.closest(".jr-field");
    const label = field?.querySelector(".jr-field-label");
    if (!field || !label) throw new Error("The control needs its owning field and label.");
    const surface = input.closest(".jr-token-autocomplete-input, .jr-search-field") ?? input;
    const box = surface.getBoundingClientRect();
    return {
      height: box.height,
      top: box.top,
      left: box.left,
      right: box.right,
      labelTop: label.getBoundingClientRect().top,
      labelSize: getComputedStyle(label).fontSize,
      inputSize: getComputedStyle(input).fontSize,
      background: getComputedStyle(surface).backgroundColor,
    };
  });
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 390]) {
    test(`shared fields retain their contract at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem("job-radar-theme", value), theme);
      await page.goto("/settings/recruiter-search/execution");
      const model = page.getByRole("textbox", { name: "Model", exact: false });
      const effort = page.getByRole("combobox", { name: "Reasoning effort" });
      await expect(model).toBeVisible();
      const modelBox = await measure(model);
      const effortBox = await measure(effort);
      for (const box of [modelBox, effortBox]) {
        expect(box.height).toBe(44);
        expect(box.labelSize).toBe("14px");
        expect(box.inputSize).toBe("16px");
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
      }
      expect(effortBox.background).toBe(modelBox.background);
      if (width === 1440) {
        expect(effortBox.top).toBe(modelBox.top);
        expect(effortBox.labelTop).toBe(modelBox.labelTop);
      } else {
        expect(effortBox.top).toBeGreaterThan(modelBox.top + modelBox.height);
      }
      await expect(model).toHaveAccessibleDescription(/A model identifier/);
      await expect(effort).toHaveAccessibleDescription(/Higher effort/);

      await page.screenshot({
        path: `test-results/shared-fields/settings-${width}-${theme}.png`,
        fullPage: true,
      });
      await model
        .locator("..")
        .screenshot({ path: `test-results/shared-fields/model-${width}-${theme}.png` });
      await page.goto("/profiles?new=1");
      const profileNavigation = page.getByRole("button", { name: "Search profiles", exact: true });
      const navigationColours = await profileNavigation.evaluate((element) => {
        const probe = document.createElement("span");
        probe.style.backgroundColor = "var(--jr-color-surface-hover)";
        element.append(probe);
        const expected = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { actual: getComputedStyle(element).backgroundColor, expected };
      });
      expect(navigationColours.actual).toBe(navigationColours.expected);
      const controls = [
        page.getByRole("textbox", { name: "Profile name" }),
        page.getByRole("spinbutton", { name: "Maximum age" }),
        page.getByRole("combobox", { name: "Salary currency" }),
        page.getByRole("combobox", { name: "Target locations" }),
      ];
      for (const control of controls) {
        await expect(control).toBeVisible();
        const box = await measure(control);
        expect(box.height).toBe(44);
        expect(box.labelSize).toBe("14px");
        expect(box.inputSize).toBe("16px");
        expect(box.background).toBe(modelBox.background);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
      }
      await page.screenshot({
        path: `test-results/shared-fields/profile-${width}-${theme}.png`,
        fullPage: true,
      });
      await page
        .getByRole("combobox", { name: "Salary currency" })
        .locator("..")
        .screenshot({ path: `test-results/shared-fields/currency-${width}-${theme}.png` });
    });
  }
}

test("checkbox padding and description toggle the same control and keyboard can reverse it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/profiles?new=1");
  const checkbox = page.getByRole("checkbox", { name: "Include remote roles" });
  const row = page.locator(".jr-checkbox").filter({ has: checkbox });
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();
  const bounds = await row.boundingBox();
  if (!bounds) throw new Error("Checkbox row is not rendered.");
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  const indicator = await checkbox.boundingBox();
  expect(indicator?.width).toBe(18);
  expect(indicator?.height).toBe(18);
  await row.click({ position: { x: bounds.width - 2, y: 2 } });
  await expect(checkbox).toBeChecked();
  await row.getByText(/Accept location-agnostic remote jobs/).click();
  await expect(checkbox).not.toBeChecked();
  await checkbox.focus();
  await checkbox.press("Space");
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeFocused();
});

for (const width of [1440, 390]) {
  test(`masthead utility controls retain equal icon targets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/activity");
    const utilities = page.locator(".utility-controls");
    const controls = utilities.locator("button, a");
    await expect(controls).toHaveCount(4);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const geometry = await controls.evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          const icon = element.querySelector("svg")?.getBoundingClientRect();
          return {
            width: box.width,
            height: box.height,
            center: box.y + box.height / 2,
            iconWidth: icon?.width,
            iconHeight: icon?.height,
            radius: getComputedStyle(element).borderRadius,
            border: getComputedStyle(element).borderWidth,
          };
        }),
      );
      for (const [index, box] of geometry.entries()) {
        expect(box.height).toBe(width === 390 ? 57 : 44);
        if (width === 390 || index < 3) expect(box.width).toBe(width === 390 ? 52 : 44);
        expect(box.iconWidth).toBe(19);
        expect(box.iconHeight).toBe(19);
        expect(box.center).toBe(geometry[0]?.center);
        expect(box.radius).toBe(geometry[0]?.radius);
        expect(box.border).toBe(geometry[0]?.border);
      }
      const activeBackground = await utilities
        .locator('[aria-current="page"]')
        .evaluate((element) => {
          const probe = document.createElement("span");
          probe.style.backgroundColor = "var(--jr-color-surface-hover)";
          element.append(probe);
          const expected = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return expected;
        });
      await expect(utilities.locator('[aria-current="page"]')).toHaveCSS(
        "background-color",
        activeBackground,
      );
      for (const control of await controls.all()) {
        await control.hover();
        await expect(control).toHaveCSS("background-color", activeBackground);
      }
      await page.mouse.move(0, 0);
      await utilities.screenshot({
        path: `test-results/shared-fields/utility-${width}-${theme}.png`,
      });
    }
  });
}

for (const width of [1440, 390]) {
  test(`provider execution keeps its description above the controls at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/settings/opportunities");
    const group = page.getByRole("group", { name: "Provider execution" });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const description = await group.locator(":scope > p").boundingBox();
      const fields = await group.locator(":scope > .form-grid").boundingBox();
      expect(description).not.toBeNull();
      expect(fields).not.toBeNull();
      if (!description || !fields)
        throw new Error("Provider execution must have measurable content.");
      expect(description.width).toBeGreaterThan(0);
      expect(fields.y).toBeGreaterThanOrEqual(description.y + description.height);
      expect(fields.x).toBeGreaterThanOrEqual(description.x);
      expect(fields.x + fields.width).toBeLessThanOrEqual(description.x + description.width);
      await group.scrollIntoViewIfNeeded();
      await group.screenshot({
        path: `test-results/shared-fields/provider-layout-${width}-${theme}.png`,
      });
    }
  });
}
