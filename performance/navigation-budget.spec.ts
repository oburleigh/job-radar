import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const destinations = [
  { heading: "Opportunities", link: "Opportunities" },
  { heading: "Profiles", link: "Search profiles" },
  { heading: "Sources and company boards", link: "Source coverage" },
  { heading: "Discovery history", link: "Discovery runs" },
  { heading: "Recruiter research", link: "Recruiter research" },
  { heading: "Settings", link: "System settings" },
] as const;
const completionBudgetMs = 1_500;
const dataRequestBudgetMs = 200;
const pendingFeedbackBudgetMs = 150;
const reportPath = path.resolve("artifacts/browser-performance/navigation-report.json");
const visualEvidenceDirectory = path.resolve("artifacts/browser-performance/adm-202");

interface NavigationObservation {
  readonly completionMs: number;
  readonly dataRequestMs: number;
  readonly destination: string;
  readonly pendingFeedbackMs: number | null;
  readonly requestCount: number;
}

test("keeps representative workspace route transitions below the multi-second range", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/profiles?profile=1&provider=serper");
  await expect(page.getByRole("heading", { level: 1, name: "Profiles" })).toBeVisible();

  const observations: NavigationObservation[] = [];
  for (let cycle = 0; cycle < 5; cycle += 1) {
    for (const destination of destinations) {
      const link = page.getByRole("link", { name: destination.link, exact: true });
      await page.evaluate(() => performance.clearResourceTimings());
      await armNavigationProbe(link, destination.heading);

      await link.click();
      await expect(
        page.getByRole("heading", { level: 1, name: destination.heading }),
      ).toBeVisible();
      if (cycle === 0 && destination.link === "Opportunities") {
        const summary = page.getByRole("region", { name: "Screening summary" });
        await expect(summary.getByText("80000 active listings excluded")).toBeVisible();
        await expect(summary.getByText("26667", { exact: true })).toHaveCount(2);
        await expect(summary.getByText("13333", { exact: true })).toHaveCount(3);
      }
      const probe = await readNavigationProbe(page);
      const resources = await page.evaluate(() =>
        performance.getEntriesByType("resource").map((entry) => {
          const resource = entry as PerformanceResourceTiming;
          const url = new URL(resource.name);
          return {
            path: url.pathname,
            requestMs: resource.responseEnd - resource.requestStart,
          };
        }),
      );
      const dataRequests = resources.filter((resource) => resource.path.endsWith(".data"));

      expect(dataRequests, `${destination.link} must load fresh route data`).toHaveLength(1);
      observations.push({
        completionMs: round(probe.completedAt - probe.clickedAt),
        dataRequestMs: round(dataRequests[0]?.requestMs ?? 0),
        destination: destination.link,
        pendingFeedbackMs:
          probe.pendingAt === null ? null : round(probe.pendingAt - probe.clickedAt),
        requestCount: resources.length,
      });
    }
  }

  const routes = Object.fromEntries(
    destinations.map((destination) => {
      const samples = observations.filter(
        (observation) => observation.destination === destination.link,
      );
      return [
        destination.link,
        {
          completionMs: summarize(samples.map((sample) => sample.completionMs)),
          dataRequestMs: summarize(samples.map((sample) => sample.dataRequestMs)),
          pendingFeedbackMs: summarize(
            samples.flatMap((sample) =>
              sample.pendingFeedbackMs === null ? [] : [sample.pendingFeedbackMs],
            ),
          ),
          requestCount: summarize(samples.map((sample) => sample.requestCount)),
        },
      ];
    }),
  );
  const failingRoutes = Object.entries(routes)
    .filter(([, route]) => route.completionMs.p95 > completionBudgetMs)
    .map(([route]) => route);
  const slowDataRoutes = Object.entries(routes)
    .filter(([, route]) => route.dataRequestMs.p95 > dataRequestBudgetMs)
    .map(([route]) => route);
  const report = {
    schemaVersion: 1,
    journey: "Cycle through every primary workspace route five times",
    fixture: { boards: 946, discoveryRuns: 54, excludedMatches: 80_000, profiles: 5 },
    thresholds: {
      completionP95Ms: completionBudgetMs,
      routeDataRequestP95Ms: dataRequestBudgetMs,
    },
    failingRoutes,
    slowDataRoutes,
    routes,
    observations,
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  expect(failingRoutes, JSON.stringify(report, null, 2)).toEqual([]);
  expect(slowDataRoutes, JSON.stringify(report, null, 2)).toEqual([]);
});

test("gives immediate accessible feedback while a route is deliberately slow", async ({ page }) => {
  await page.route(/\/settings\.data(?:\?|$)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });
  await page.goto("/profiles?profile=1&provider=serper");
  const currentHeading = page.getByRole("heading", { level: 1, name: "Profiles" });
  const settingsLink = page.getByRole("link", { name: "System settings", exact: true });
  await expect(currentHeading).toBeVisible();

  await armNavigationProbe(settingsLink, "Settings");
  await settingsLink.click();
  await expect(settingsLink).toHaveAttribute("aria-busy", "true");
  await expect(currentHeading).toBeVisible();
  const probe = await readNavigationProbe(page, false);

  expect(probe.pendingAt).not.toBeNull();
  expect((probe.pendingAt ?? Number.POSITIVE_INFINITY) - probe.clickedAt).toBeLessThanOrEqual(
    pendingFeedbackBudgetMs,
  );
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(settingsLink).toBeFocused();
});

test("preserves selection, history, focus, and fresh loader data", async ({ page }) => {
  const dataRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith(".data")) {
      dataRequests.push(new URL(request.url()).pathname);
    }
  });
  await page.goto("/profiles?profile=1&provider=serper");
  const sourcesLink = page.getByRole("link", { name: "Source coverage", exact: true });
  await sourcesLink.click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Sources and company boards" }),
  ).toBeVisible();
  await expect(sourcesLink).toBeFocused();
  expect(new URL(page.url()).search).toBe("?profile=1&provider=serper");

  const runsLink = page.getByRole("link", { name: "Discovery runs", exact: true });
  await runsLink.click();
  await expect(page.getByRole("heading", { level: 1, name: "Discovery history" })).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { level: 1, name: "Sources and company boards" }),
  ).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1, name: "Discovery history" })).toBeVisible();

  expect(
    dataRequests.filter((request) => request === "/sources.data").length,
  ).toBeGreaterThanOrEqual(2);
  expect(dataRequests.filter((request) => request === "/runs.data").length).toBeGreaterThanOrEqual(
    2,
  );
});

test("keeps the virtualized source registry usable across supported layouts and themes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await mkdir(visualEvidenceDirectory, { recursive: true });

  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 390, height: 844 },
  ] as const) {
    await page.setViewportSize(viewport);
    for (const theme of ["light", "dark"] as const) {
      await page.goto("/sources");
      await selectTheme(page, theme);
      await expect(
        page.getByRole("heading", { level: 1, name: "Sources and company boards" }),
      ).toBeVisible();

      const table = page.getByRole("table");
      const tableWrap = page.locator(".company-sites-table");
      await expect(table).toBeVisible();
      await expect(page.getByRole("columnheader", { name: /Company or slug/ })).toBeVisible();
      expect(await page.getByRole("row").count()).toBeLessThan(946);

      const [wrapBox, sortButtonBoxes] = await Promise.all([
        tableWrap.boundingBox(),
        page.locator(".sortable-header-button").evaluateAll((buttons) =>
          buttons.map((button) => {
            const box = button.getBoundingClientRect();
            return { height: box.height, width: box.width };
          }),
        ),
      ]);
      if (!wrapBox) {
        throw new Error("The source registry table must be measurable.");
      }
      expect(wrapBox.x).toBeGreaterThanOrEqual(0);
      expect(wrapBox.x + wrapBox.width).toBeLessThanOrEqual(viewport.width);
      const overflow = await tableWrap.evaluate((element) => ({
        clientWidth: element.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(overflow.documentWidth).toBeLessThanOrEqual(viewport.width);
      if (viewport.name === "mobile") {
        expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
      }
      for (const box of sortButtonBoxes) {
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }

      const accessibility = await new AxeBuilder({ page }).analyze();
      expect(accessibility.violations).toEqual([]);
      await tableWrap.evaluate((element) => {
        const masthead = document.querySelector<HTMLElement>(".masthead");
        const tableTop = element.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, tableTop - (masthead?.offsetHeight ?? 0));
      });
      const [mastheadBox, tableHeaderBox] = await Promise.all([
        page.locator(".masthead").boundingBox(),
        table.locator("thead").boundingBox(),
      ]);
      if (!mastheadBox || !tableHeaderBox) {
        throw new Error("The sticky masthead and table header must be measurable.");
      }
      expect(tableHeaderBox.y).toBeGreaterThanOrEqual(mastheadBox.y + mastheadBox.height - 1);
      await page.screenshot({
        animations: "disabled",
        caret: "hide",
        path: path.join(visualEvidenceDirectory, `sources-table-${viewport.name}-${theme}.png`),
      });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        animations: "disabled",
        caret: "hide",
        path: path.join(visualEvidenceDirectory, `sources-route-${viewport.name}-${theme}.png`),
      });

      await page.goto("/profiles?profile=1&provider=serper");
      await selectTheme(page, theme);
      const delaySettings = async (route: import("@playwright/test").Route) => {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        await route.continue();
      };
      await page.route(/\/settings\.data(?:\?|$)/, delaySettings);
      const currentHeading = page.getByRole("heading", { level: 1, name: "Profiles" });
      const settingsLink = page
        .getByRole("navigation", { name: "Primary navigation" })
        .getByRole("link", { name: /^(System settings|Settings)$/ });
      await settingsLink.click();
      await expect(settingsLink).toHaveAttribute("aria-busy", "true");
      await expect(currentHeading).toBeVisible();
      await expect(settingsLink).toBeFocused();
      const pendingBox = await settingsLink.boundingBox();
      if (!pendingBox) {
        throw new Error("The pending navigation target must be measurable.");
      }
      expect(pendingBox.x).toBeGreaterThanOrEqual(0);
      expect(pendingBox.x + pendingBox.width).toBeLessThanOrEqual(viewport.width);
      expect(pendingBox.y).toBeGreaterThanOrEqual(0);
      expect(pendingBox.y + pendingBox.height).toBeLessThanOrEqual(viewport.height);
      await page.screenshot({
        animations: "disabled",
        caret: "hide",
        fullPage: true,
        path: path.join(
          visualEvidenceDirectory,
          `navigation-pending-${viewport.name}-${theme}.png`,
        ),
      });
      await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
      await page.unroute(/\/settings\.data(?:\?|$)/, delaySettings);
    }
  }
});

async function selectTheme(
  page: import("@playwright/test").Page,
  theme: "light" | "dark",
): Promise<void> {
  const themeToggle = page.getByRole("button", { name: /^Theme:/ });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if ((await themeToggle.getAttribute("aria-label"))?.startsWith(`Theme: ${theme}.`)) {
      return;
    }
    await themeToggle.click();
  }
  await expect(themeToggle).toHaveAccessibleName(new RegExp(`^Theme: ${theme}\\.`));
}

async function armNavigationProbe(
  link: import("@playwright/test").Locator,
  heading: string,
): Promise<void> {
  await link.evaluate((element, expectedHeading) => {
    const probeWindow = window as typeof window & {
      __jobRadarNavigationProbe?: {
        clickedAt: number | null;
        completedAt: number | null;
        observer: MutationObserver;
        pendingAt: number | null;
      };
    };
    probeWindow.__jobRadarNavigationProbe?.observer.disconnect();
    const probe: NonNullable<typeof probeWindow.__jobRadarNavigationProbe> = {
      clickedAt: null,
      completedAt: null,
      pendingAt: null,
      observer: new MutationObserver(record),
    };
    function record() {
      if (probe.clickedAt === null) {
        return;
      }
      if (probe.pendingAt === null && element.getAttribute("aria-busy") === "true") {
        probe.pendingAt = performance.now();
      }
      if (
        probe.completedAt === null &&
        document.querySelector("h1")?.textContent?.trim() === expectedHeading
      ) {
        probe.completedAt = performance.now();
      }
    }
    element.addEventListener(
      "click",
      () => {
        probe.clickedAt = performance.now();
        queueMicrotask(record);
      },
      { once: true },
    );
    probe.observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["aria-busy"],
      childList: true,
      subtree: true,
    });
    probeWindow.__jobRadarNavigationProbe = probe;
  }, heading);
}

async function readNavigationProbe(
  page: import("@playwright/test").Page,
  requireCompletion = true,
): Promise<{ clickedAt: number; completedAt: number; pendingAt: number | null }> {
  if (requireCompletion) {
    await page.waitForFunction(() => {
      const probe = (
        window as typeof window & {
          __jobRadarNavigationProbe?: { completedAt: number | null };
        }
      ).__jobRadarNavigationProbe;
      return probe?.completedAt !== null;
    });
  }
  return page.evaluate((mustComplete) => {
    const probe = (
      window as typeof window & {
        __jobRadarNavigationProbe?: {
          clickedAt: number | null;
          completedAt: number | null;
          observer: MutationObserver;
          pendingAt: number | null;
        };
      }
    ).__jobRadarNavigationProbe;
    if (!probe?.clickedAt || (mustComplete && !probe.completedAt)) {
      throw new Error("Navigation probe did not observe the requested transition.");
    }
    if (mustComplete) {
      probe.observer.disconnect();
    }
    return {
      clickedAt: probe.clickedAt,
      completedAt: probe.completedAt ?? performance.now(),
      pendingAt: probe.pendingAt,
    };
  }, requireCompletion);
}

function summarize(values: readonly number[]): { p50: number; p95: number; values: number[] } {
  const sorted = values.toSorted((left, right) => left - right);
  return { p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), values: sorted };
}

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }
  return values[Math.ceil(values.length * percentileValue) - 1] ?? 0;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
