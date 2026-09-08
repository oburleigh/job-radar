import { expect, test } from "@playwright/test";

/**
 * Every multi-column grid in the product kept its desktop column count at a phone width, so eight
 * routes pushed content past the viewport and the page scrolled sideways. These assertions are the
 * measurement that found that, kept so it cannot come back one route at a time.
 */
const routes = [
  ["Opportunities", "/"],
  ["Search profiles", "/profiles"],
  ["a new profile", "/profiles?new=1"],
  ["Activity", "/activity"],
  ["Recruiter Search research", "/recruiter-search"],
  ["the recruiter Directory", "/recruiter-search?view=directory"],
  ["Opportunities settings", "/settings/opportunities"],
  ["research criteria settings", "/settings/recruiter-search/research-criteria"],
  ["public search settings", "/settings/recruiter-search/public-search"],
  ["Directory ranking settings", "/settings/recruiter-search/directory-ranking"],
  ["research execution settings", "/settings/recruiter-search/execution"],
  ["source coverage settings", "/settings/adapters/source-coverage"],
  ["the ATS Registry", "/settings/adapters/ats-registry"],
] as const;

for (const [name, route] of routes) {
  test(`keeps ${name} inside a phone's width`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto(route);
    await page.waitForLoadState("networkidle");

    /*
     * A measurement of the wrong document proves nothing, and an error page or a redirect away
     * from the route has no overflow to find. Establish that this route rendered before believing
     * anything measured on it.
     */
    expect(response?.ok(), `${route} did not respond`).toBe(true);
    const requested = new URL(route, "http://placeholder");
    const arrived = new URL(page.url());
    expect(arrived.pathname, `${route} redirected away`).toBe(requested.pathname);
    // The query selects the variant, so dropping it lands on a sibling that shares the heading.
    for (const [name, value] of requested.searchParams) {
      expect(arrived.searchParams.get(name), `${route} lost ?${name}`).toBe(value);
    }
    const heading = page.locator("main h1, h1").first();
    await expect(heading, `${route} rendered no heading`).toBeVisible();
    expect(
      (await heading.textContent())?.trim(),
      `${route} rendered an empty heading`,
    ).toBeTruthy();

    const overflow = await page.evaluate(() => ({
      sideways: document.documentElement.scrollWidth - window.innerWidth,
      // Wide content is allowed to scroll, but only inside its own container.
      escaping: [...document.querySelectorAll("main *")]
        .filter((element) => {
          const parent = element.parentElement;
          if (!parent || parent === document.body) return false;
          if (getComputedStyle(element).position !== "static") return false;
          const box = element.getBoundingClientRect();
          if (box.width < 8 || box.height < 8) return false;
          if (Math.round(box.right - parent.getBoundingClientRect().right) <= 2) return false;
          /*
           * Wide content may exceed its box only where an ancestor actually scrolls it, which is
           * how the ATS table stays usable on a phone. `hidden` and `clip` conceal content the
           * user can then never reach, so they are failures rather than excuses.
           */
          let scope: HTMLElement | null = parent;
          while (scope !== null && scope !== document.body) {
            const overflowX = getComputedStyle(scope).overflowX;
            if (overflowX === "auto" || overflowX === "scroll") {
              return scope.scrollWidth <= scope.clientWidth;
            }
            // Met before any scroll container, so the content is already unreachable.
            if (overflowX === "hidden" || overflowX === "clip") {
              return true;
            }
            scope = scope.parentElement;
          }
          return true;
        })
        .map((element) => element.tagName.toLowerCase())
        .slice(0, 5),
    }));

    expect(overflow.sideways, `${route} scrolls sideways`).toBeLessThanOrEqual(1);
    expect(overflow.escaping, `${route} paints content outside its container`).toEqual([]);
  });
}

test("gives every page-level box the same edges on both primary pages", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  const panelEdges = async (route: string) => {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    return page.evaluate(() => [
      ...new Set(
        [...document.querySelectorAll("main .jr-panel")].map((panel) => {
          const box = panel.getBoundingClientRect();
          return `${Math.round(box.left)}:${Math.round(box.right)}`;
        }),
      ),
    ]);
  };

  const opportunities = await panelEdges("/");
  const recruiterSearch = await panelEdges("/recruiter-search");

  expect(opportunities.length, "Opportunities must render a panel").toBeGreaterThan(0);
  expect(recruiterSearch.length, "Recruiter Search must render a panel").toBeGreaterThan(0);
  // One column, so every panel on either page shares one pair of edges.
  expect(opportunities).toHaveLength(1);
  expect(recruiterSearch).toEqual(opportunities);
});

/**
 * Replaces the radius guard that lived with the screening summary. One rule owns the panel now, so
 * a second corner can only appear by a product stylesheet redeclaring one.
 */
test("draws every page-level box with one corner", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  /*
   * Accumulated across routes, not rebuilt per route. Comparing each page against itself let
   * Opportunities settle on one radius and Recruiter Search on another while both passed, which
   * is the defect this replaced: the Directory drew `--jr-radius-md` boxes beside `--jr-radius-xl`
   * ones and each page looked internally consistent.
   */
  const radii = new Map<string, string[]>();

  for (const route of ["/", "/recruiter-search", "/recruiter-search?view=directory", "/activity"]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");

    const found = await page.evaluate(() =>
      ["jr-panel", "jr-card"].map((box) => ({
        box,
        radii: [
          ...new Set(
            [...document.querySelectorAll(`main .${box}`)].map(
              (element) => getComputedStyle(element).borderRadius,
            ),
          ),
        ],
      })),
    );

    expect(
      found.some((box) => box.radii.length > 0),
      `${route} must render a panel or a card`,
    ).toBe(true);
    for (const box of found) {
      for (const radius of box.radii) {
        const key = `${box.box} ${radius}`;
        radii.set(key, [...(radii.get(key) ?? []), route]);
      }
    }
  }

  const described = [...radii].map(([box, routes]) => `${box} on ${routes.join(", ")}`).join(" | ");
  /*
   * One radius per box kind, across every route. A `Card` carries a product class beside
   * `jr-card`, so a product rule can reshape its corner without naming a `jr-` selector and
   * without pairing the radius with a fill. Neither stylesheet gate sees that; this does.
   */
  for (const kind of ["jr-panel", "jr-card"]) {
    const drawn = [...radii.keys()].filter((key) => key.startsWith(`${kind} `));
    expect(drawn.length, `${kind} is drawn ${drawn.length} ways: ${described}`).toBeLessThanOrEqual(
      1,
    );
  }
});

test("keeps a field's control inside the field that labels it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/profiles");
  await page.waitForLoadState("networkidle");

  const escaping = await page.evaluate(() =>
    [...document.querySelectorAll(".jr-field")].flatMap((field) => {
      const bounds = field.getBoundingClientRect();
      return [...field.querySelectorAll(".jr-text-field, .jr-text-area, .jr-select-field")]
        .filter((control) => {
          const box = control.getBoundingClientRect();
          return Math.round(box.right - bounds.right) > 2 || Math.round(bounds.left - box.left) > 2;
        })
        .map((control) => control.id || control.className);
    }),
  );

  expect(escaping).toEqual([]);
});
