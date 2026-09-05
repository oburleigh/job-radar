import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

/**
 * A static capture shows nothing that only exists while open. Tooltips, dropdowns, popovers and
 * dialogs are invisible at rest, so a reviewer given only resting screenshots reports them as
 * absent or as fine. These captures drive the control first.
 */

const screensDirectory = path.join(process.cwd(), "artifacts/audit/screens");

test.beforeAll(() => {
  mkdirSync(screensDirectory, { recursive: true });
});

test("the salary currency suggestion list, open, beside the sticky save bar", async ({
  page,
}, testInfo) => {
  await visit(page, "/settings/opportunities");

  const field = page.getByPlaceholder("Search code, currency, or country");
  await field.scrollIntoViewIfNeeded();
  await field.click();
  await field.fill("gb");

  const options = page.locator(".combobox-options");
  await expect(options).toBeVisible();

  const optionsBox = await options.boundingBox();
  const saveBar = page.locator(".form-submit-row");
  const saveBox = await saveBar.boundingBox();
  expect(optionsBox, "the suggestion list has no box").not.toBeNull();
  expect(saveBox, "the save bar has no box").not.toBeNull();

  await page.screenshot({
    path: path.join(screensDirectory, `combobox-open__${testInfo.project.name}__light.png`),
  });

  const overlaps =
    optionsBox !== null &&
    saveBox !== null &&
    optionsBox.y < saveBox.y + saveBox.height &&
    optionsBox.y + optionsBox.height > saveBox.y;

  const painted = await page.evaluate(() => {
    const list = document.querySelector(".combobox-options");
    const bar = document.querySelector(".form-submit-row");
    if (!list || !bar) {
      return null;
    }
    const listBox = list.getBoundingClientRect();
    const probeX = listBox.left + listBox.width / 2;
    const probeY = listBox.top + Math.min(listBox.height - 2, 12);
    const topmost = document.elementFromPoint(probeX, probeY);
    return {
      resolvedZIndex: window.getComputedStyle(list).zIndex,
      barZIndex: window.getComputedStyle(bar).zIndex,
      topmostIsInsideList: list.contains(topmost),
      topmostIsInsideBar: bar.contains(topmost),
      topmost: topmost
        ? `${topmost.tagName.toLowerCase()}.${(topmost.className || "").toString().split(" ")[0]}`
        : null,
    };
  });

  console.log(`COMBOBOX overlaps=${overlaps} painted=${JSON.stringify(painted)}`);
});

async function visit(page: Page, url: string): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("job-radar-theme", "light");
  });
  const response = await page.goto(url, { waitUntil: "networkidle" });
  expect(response?.status(), `${url} did not render a document`).toBeLessThan(400);
  await page.waitForFunction(() => document.fonts.status === "loaded");
}

/**
 * A windowed virtualiser renders only the rows near the viewport. Chromium's full-page capture
 * paints beyond the viewport without firing scroll events, so the virtualiser never fills in, and
 * the capture shows a header count above a nearly empty table. That is an artefact of the capture,
 * not of the product, and a reviewer given only the image cannot tell the two apart.
 */
test("the company sites table renders its rows on scroll, not in a full-page capture", async ({
  page,
}) => {
  await visit(page, "/settings/adapters/source-coverage");

  const rowsAtRest = await page.locator("table tbody tr").count();

  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page.waitForTimeout(500);
  const rowsAfterScroll = await page.locator("table tbody tr").count();

  const headerCount = await page
    .getByText(/\d+ registered/)
    .first()
    .textContent();

  console.log(
    `COMPANYSITES header=${JSON.stringify(headerCount)} rowsAtRest=${rowsAtRest} rowsAfterScroll=${rowsAfterScroll}`,
  );

  expect(rowsAtRest, "no rows rendered at rest, so the table proves nothing").toBeGreaterThan(0);
});

/**
 * A sticky bottom bar is correct when it floats over content the user has already passed and the
 * flow reserves room beneath it. It is a defect when it sits mid-form, because it then covers
 * fields the user still has to fill. A full-page capture cannot tell those apart: it paints the
 * bar at its stuck position over whatever happens to be there.
 */
test("the profile save bar does not cover fields the user still has to fill", async ({ page }) => {
  await visit(page, "/profiles");

  const covered = await page.evaluate(() => {
    const bar = document.querySelector(".form-submit-row");
    if (!bar) {
      return null;
    }
    const barBox = bar.getBoundingClientRect();

    const obscured: string[] = [];
    for (const control of Array.from(document.querySelectorAll("input, textarea, select"))) {
      const box = control.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) {
        continue;
      }
      const overlapsBar = box.top < barBox.bottom && box.bottom > barBox.top;
      if (!overlapsBar) {
        continue;
      }
      const topmost = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      if (topmost !== null && !control.contains(topmost) && topmost !== control) {
        const label =
          control.getAttribute("name") ?? control.getAttribute("aria-label") ?? control.tagName;
        obscured.push(`${label} covered by ${topmost.className || topmost.tagName}`);
      }
    }

    return {
      barTop: Math.round(barBox.top),
      barBottom: Math.round(barBox.bottom),
      viewportHeight: window.innerHeight,
      obscured,
    };
  });

  console.log(`SAVEBAR ${JSON.stringify(covered)}`);
});

test("the profile save action stays reachable at the end of the form", async ({ page }) => {
  await visit(page, "/profiles");

  const atBottom = await page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((resolve) => window.setTimeout(resolve, 200));

    const bar = document.querySelector(".form-submit-row");
    if (!bar) {
      return null;
    }
    const box = bar.getBoundingClientRect();
    return {
      barTop: Math.round(box.top),
      barBottom: Math.round(box.bottom),
      viewportHeight: window.innerHeight,
      insideViewport: box.top < window.innerHeight && box.bottom > 0,
    };
  });

  console.log(`SAVEBAR_AT_BOTTOM ${JSON.stringify(atBottom)}`);
});
