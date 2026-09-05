import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

import { auditableRoutes, dynamicSegments } from "#tests/support/web-routes";

const routeParameters: Record<string, string> = {
  runId: "1",
};

const themes = ["light", "dark"] as const;

/**
 * A full-page capture of an unbounded route produces an image no reviewer can read and no model
 * can accept. Above this height the capture stays viewport-sized and the height is reported, so
 * the route is still reviewed and the unbounded list is still visible as a number.
 */
const FULL_PAGE_HEIGHT_LIMIT = 12_000;

const screensDirectory = path.join(process.cwd(), "artifacts/audit/screens");

test.beforeAll(() => {
  mkdirSync(screensDirectory, { recursive: true });
});

for (const route of auditableRoutes()) {
  const url = navigableUrl(route.urlPath);

  for (const theme of themes) {
    test(`${route.urlPath} in ${theme}`, async ({ page }, testInfo) => {
      await visit(page, url, theme);

      await settleVirtualisedLists(page);

      const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const stem = `${slug(route.urlPath)}__${testInfo.project.name}__${theme}`;

      await page.screenshot({
        path: path.join(screensDirectory, `${stem}__viewport.png`),
      });

      if (documentHeight <= FULL_PAGE_HEIGHT_LIMIT) {
        await page.screenshot({
          path: path.join(screensDirectory, `${stem}__full.png`),
          fullPage: true,
        });
      }

      const cropWidth = Math.min(page.viewportSize()?.width ?? 0, 760);
      await page.screenshot({
        path: path.join(screensDirectory, `${stem}__crop-left.png`),
        fullPage: true,
        clip: { x: 0, y: 0, width: cropWidth, height: Math.min(900, documentHeight) },
      });

      const edges = await readLeftEdges(page);
      writeFileSync(
        path.join(screensDirectory, `${stem}__edges.json`),
        JSON.stringify({ route: route.urlPath, documentHeight, edges }, null, 2),
      );

      testInfo.annotations.push({
        type: "document-height",
        description: `${route.urlPath} ${testInfo.project.name} ${theme}: ${documentHeight}px`,
      });
      console.log(
        `CAPTURED ${stem} height=${documentHeight} edges=${edges.map((edge) => edge.left).join(",")}`,
      );
    });
  }
}

/**
 * The distinct left edges of the page's visible text-bearing blocks. A page with one column has
 * few; a page that lets each block choose its own inset has many, and the count is what a reader
 * sees as misalignment before being able to name it.
 */
async function readLeftEdges(page: Page): Promise<{ left: number; examples: string[] }[]> {
  return page.evaluate(() => {
    const byEdge = new Map<number, string[]>();

    for (const element of Array.from(document.querySelectorAll("main *"))) {
      const box = element.getBoundingClientRect();
      if (box.width < 24 || box.height < 8) {
        continue;
      }

      const ownText = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join("")
        .trim();
      if (ownText === "") {
        continue;
      }

      const left = Math.round(box.left + window.scrollX);
      const tag = element.tagName.toLowerCase();
      const className =
        typeof element.className === "string" ? element.className.split(" ")[0] : "";
      const label = `${tag}${className ? `.${className}` : ""}: ${ownText.slice(0, 40)}`;
      byEdge.set(left, [...(byEdge.get(left) ?? []), label]);
    }

    return Array.from(byEdge.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([left, examples]) => ({ left, examples: examples.slice(0, 3) }));
  });
}

/**
 * Chromium paints a full-page capture beyond the viewport without firing scroll events, so a
 * windowed virtualiser never renders its off-screen rows and the image shows a header count above
 * a nearly empty list. A reviewer cannot tell that from a real defect. Measured 2026-09-05 on
 * /settings/adapters/source-coverage: 2 rows rendered at rest, 12 after scrolling, against a
 * header reading "12 registered", which a review reported as a BLOCK. Walking the page first makes
 * the capture describe the product rather than the capture.
 */
async function settleVirtualisedLists(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let offset = 0; offset < document.documentElement.scrollHeight; offset += step) {
      window.scrollTo(0, offset);
      await new Promise((resolve) => window.setTimeout(resolve, 60));
    }
    window.scrollTo(0, 0);
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  });
}

async function visit(page: Page, url: string, theme: (typeof themes)[number]): Promise<void> {
  await page.addInitScript((selected) => {
    window.localStorage.setItem("job-radar-theme", selected);
  }, theme);

  const response = await page.goto(url, { waitUntil: "networkidle" });
  expect(response?.status(), `${url} did not render a document`).toBeLessThan(400);
  await page.waitForFunction(
    (selected) => document.documentElement.dataset.theme === selected,
    theme,
  );
  await page.waitForFunction(() => document.fonts.status === "loaded");
}

function slug(urlPath: string): string {
  const trimmed = urlPath.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-");
  return trimmed === "" ? "index" : trimmed;
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
