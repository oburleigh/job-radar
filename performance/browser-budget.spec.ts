import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import {
  summarizeBrowserPerformance,
  type WebVitalsSample,
} from "~/scripts/browser-performance-report";

type MetricName = keyof WebVitalsSample;

interface BrowserMetric {
  readonly name: MetricName;
  readonly value: number;
  readonly rating: string;
}

const thresholds = {
  CLS: 0.1,
  INP: 200,
  LCP: 2_500,
} as const;
const reportPath = path.resolve("artifacts/browser-performance/report.json");
const webVitalsModulePath = fileURLToPath(import.meta.resolve("web-vitals"));
const webVitalsScriptPath = path.join(
  path.dirname(webVitalsModulePath),
  "web-vitals.attribution.iife.js",
);

test("keeps the root load and theme interaction within Web Vitals budgets", async ({ browser }) => {
  test.setTimeout(90_000);
  let measuredRoute = "/";
  const observations: Array<Readonly<Record<MetricName, BrowserMetric>>> = [];

  for (let run = 0; run < 3; run += 1) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "networkidle" });
    const currentUrl = new URL(page.url());
    measuredRoute = `${currentUrl.pathname}${currentUrl.search}`;
    await expect(
      page.getByRole("heading", { level: 2, name: "Staff Platform Engineer 01" }),
    ).toBeVisible();
    await page.addScriptTag({ path: webVitalsScriptPath });
    await page.evaluate(() => {
      const performanceWindow = window as typeof window & {
        __jobRadarVitals: Partial<Record<MetricName, BrowserMetric>>;
        webVitals: {
          onCLS: (callback: (metric: BrowserMetric) => void, options: object) => void;
          onINP: (callback: (metric: BrowserMetric) => void, options: object) => void;
          onLCP: (callback: (metric: BrowserMetric) => void, options: object) => void;
        };
      };
      performanceWindow.__jobRadarVitals = {};
      const record = (metric: BrowserMetric) => {
        performanceWindow.__jobRadarVitals[metric.name] = {
          name: metric.name,
          value: metric.value,
          rating: metric.rating,
        };
      };
      performanceWindow.webVitals.onCLS(record, { reportAllChanges: true });
      performanceWindow.webVitals.onINP(record, { reportAllChanges: true });
      performanceWindow.webVitals.onLCP(record, { reportAllChanges: true });
    });
    if (process.env.JOB_RADAR_PERFORMANCE_PROBE === "slow-interaction") {
      await page.getByRole("button", { name: /Theme: system/i }).evaluate((button) => {
        button.addEventListener(
          "click",
          () => {
            const blockedUntil = performance.now() + 300;
            while (performance.now() < blockedUntil) {
              // Deliberate performance-test probe: block the measured interaction.
            }
          },
          { capture: true, once: true },
        );
      });
    }

    await page.getByRole("button", { name: /Theme: system/i }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.waitForFunction(() => {
      const metrics = (
        window as typeof window & {
          __jobRadarVitals?: Partial<Record<MetricName, BrowserMetric>>;
        }
      ).__jobRadarVitals;
      return Boolean(metrics?.CLS && metrics.INP && metrics.LCP);
    });
    const metrics = await page.evaluate(() => {
      return (
        window as typeof window & {
          __jobRadarVitals: Readonly<Record<MetricName, BrowserMetric>>;
        }
      ).__jobRadarVitals;
    });
    observations.push(metrics);
    await context.close();
  }

  const report = summarizeBrowserPerformance({
    route: measuredRoute,
    samples: observations.map((metrics) => ({
      CLS: metrics.CLS.value,
      INP: metrics.INP.value,
      LCP: metrics.LCP.value,
    })),
    thresholds,
  });
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        ...report,
        journey: "Load the opportunity workspace and change the theme from system to light",
        observations,
      },
      null,
      2,
    )}\n`,
  );

  expect(report, JSON.stringify(report, null, 2)).toMatchObject({
    passed: true,
    failingMetrics: [],
  });
});
