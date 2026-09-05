import { expect, type Page, test } from "@playwright/test";

import { auditableRoutes, dynamicSegments } from "#tests/support/web-routes";

/**
 * A page has one column. Its left edge is the content box of `.page`, which owns the outer inset,
 * and the page title sits on it like every other page-level heading.
 *
 * This replaces a predicate that compared every region against its parent. That version was
 * rewritten four times, three of the wrong versions would have passed, and it never caught the
 * defect a single rendered screenshot showed immediately: the title 33px right of everything under
 * it, on all fifteen routes.
 */

const routeParameters: Record<string, string> = {
  runId: "1",
};

for (const route of auditableRoutes()) {
  const url = navigableUrl(route.urlPath);

  test(`${route.urlPath} puts its title on the page column`, async ({ page }) => {
    await visit(page, url);

    const measured = await page.evaluate(() => {
      const shell = document.querySelector(".page");
      const heading = document.querySelector("h1");
      if (!shell || !heading) {
        return null;
      }

      const shellStyle = window.getComputedStyle(shell);
      const shellBox = shell.getBoundingClientRect();

      return {
        column: Math.round(shellBox.left + Number.parseFloat(shellStyle.paddingLeft)),
        title: Math.round(heading.getBoundingClientRect().left),
        titleText: heading.textContent?.trim() ?? "",
      };
    });

    expect(measured, `${route.urlPath} renders no .page shell or no h1`).not.toBeNull();
    expect(
      measured?.titleText.length,
      "the title is empty, so its edge proves nothing",
    ).toBeGreaterThan(0);
    expect(
      measured?.title,
      `${route.urlPath} title "${measured?.titleText}" sits at ${measured?.title} while the page column is at ${measured?.column}`,
    ).toBe(measured?.column);
  });
}

async function visit(page: Page, url: string): Promise<void> {
  const response = await page.goto(url, { waitUntil: "networkidle" });
  expect(response?.status(), `${url} did not render a document`).toBeLessThan(400);
  await page.waitForFunction(() => document.fonts.status === "loaded");
}

function navigableUrl(urlPath: string): string {
  return urlPath
    .split("/")
    .map((segment) => {
      if (!segment.startsWith(":")) {
        return segment;
      }
      const sample = routeParameters[segment.slice(1)];
      if (sample === undefined) {
        throw new Error(`Route ${urlPath} has no sample value for ${segment}.`);
      }
      return sample;
    })
    .join("/");
}

test("names a sample value for every parameterised route", () => {
  const missing = auditableRoutes()
    .flatMap((route) => dynamicSegments(route.urlPath))
    .filter((segment) => routeParameters[segment] === undefined);

  expect(missing).toEqual([]);
});
