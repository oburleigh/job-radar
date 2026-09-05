import { expect, test } from "@playwright/test";
import { rgb, wcagContrast } from "culori";

/**
 * Contrast is measured on resolved colours read out of the running application rather than on the
 * stylesheet, because `light-dark()` and `color-mix()` are what the token layer is built from and
 * only the browser resolves them.
 *
 * `wcagContrast` is culori's implementation of the WCAG 2.x formula and is used rather than a
 * local one; what it does not do is composite alpha, and several roles are a `color-mix` with
 * `transparent`. Measured against the values in the rebrand's reference table, an uncomposited
 * `rgba(23, 23, 23, 0.72)` on white reports 17.93 where the true ratio is 7.11, so a translucent
 * foreground would pass this test while failing a reader. `over` does that compositing.
 */
const BODY_TEXT = 4.5;
const NON_TEXT = 3;

const surfaces = ["canvas", "surface-subtle", "surface", "surface-hover"] as const;
const textRoles = [
  "text",
  "text-muted",
  "text-subtle",
  "accent",
  "success",
  "danger",
  "warning-text",
] as const;

/**
 * The status callout borders are deliberately absent. WCAG 2.2 1.4.11 asks for 3:1 on the visual
 * information needed to identify a control or its state; a callout's tinted edge identifies
 * neither, because the text inside it carries the meaning. `border-strong` is here because it
 * draws the boundary of the secondary button, the outlined icon button and the switch track.
 */
const pairs: readonly (readonly [string, string, number])[] = [
  ...textRoles.flatMap((foreground) =>
    surfaces.map((background) => [foreground, background, BODY_TEXT] as const),
  ),
  ["text-on-accent", "accent", BODY_TEXT],
  ["text-on-accent", "accent-strong", BODY_TEXT],
  ["text-on-action", "action", BODY_TEXT],
  ["accent", "accent-subtle", BODY_TEXT],
  ["accent-strong", "accent-subtle", BODY_TEXT],
  ["success", "success-subtle", BODY_TEXT],
  ["danger", "danger-subtle", BODY_TEXT],
  ["text-muted", "danger-subtle", BODY_TEXT],
  ["warning-text", "warning-subtle", BODY_TEXT],
  ["text", "info-subtle", BODY_TEXT],
  ...surfaces.map((background) => ["border-strong", background, NON_TEXT] as const),
  ["focus-ring", "canvas", NON_TEXT],
  ["focus-ring", "surface", NON_TEXT],
];

for (const theme of ["light", "dark"] as const) {
  test(`meets WCAG 2.2 AA contrast on every semantic pair in ${theme} mode`, async ({ page }) => {
    await page.addInitScript((selected) => {
      window.localStorage.setItem("job-radar-theme", selected);
    }, theme);
    await page.goto("/");

    const roles = [
      ...new Set([
        ...pairs.map(([foreground]) => foreground),
        ...pairs.map(([, background]) => background),
      ]),
    ];
    const resolved = await page.evaluate((names) => {
      const probe = document.createElement("div");
      document.body.appendChild(probe);
      const colours: Record<string, string> = {};
      for (const name of names) {
        probe.style.color = `var(--jr-color-${name})`;
        colours[name] = getComputedStyle(probe).color;
      }
      probe.remove();
      return colours;
    }, roles);

    for (const role of roles) {
      expect(resolved[role], `--jr-color-${role} resolves`).toMatch(/^(?:color|oklch|rgb)a?\(/);
    }

    const failures = pairs
      .map(([foreground, background, threshold]) => {
        const ratio = wcagContrast(
          over(resolved[foreground] as string, resolved[background] as string),
          resolved[background] as string,
        );
        return { foreground, background, threshold, ratio };
      })
      .filter(({ ratio, threshold }) => ratio < threshold)
      .map(
        ({ foreground, background, threshold, ratio }) =>
          `${foreground} on ${background}: ${ratio.toFixed(2)} < ${threshold}`,
      );

    expect(failures).toEqual([]);
  });
}

test("sets body text at regular weight and the body size", async ({ page }) => {
  await page.goto("/");

  const body = await page.evaluate(() => {
    const styles = getComputedStyle(document.body);
    return {
      family: styles.fontFamily,
      lineHeight: styles.lineHeight,
      size: styles.fontSize,
      weight: styles.fontWeight,
    };
  });

  expect(body.weight).toBe("400");
  expect(body.size).toBe("16px");
  expect(body.lineHeight).toBe("24px");
  expect(body.family).toContain("Inter");

  // Naming the family proves nothing: the computed value still reads "Inter Variable" when the
  // file never loaded and the browser painted the fallback.
  const faces = await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = await document.fonts.load('400 16px "Inter Variable"');
    return loaded.map((face) => face.status);
  });
  expect(faces.length, "the Inter Variable webfont must be a registered face").toBeGreaterThan(0);
  expect(faces.every((status) => status === "loaded")).toBe(true);
});

test("reduces movement without removing state fades under prefers-reduced-motion", async ({
  page,
}) => {
  await page.goto("/");

  const durations = async () =>
    page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.transitionProperty = "opacity, transform";
      probe.style.transitionDuration =
        "var(--jr-motion-duration-base), var(--jr-motion-transform-base)";
      document.body.appendChild(probe);
      const [opacity, transform] = getComputedStyle(probe).transitionDuration.split(", ");
      probe.remove();
      return { opacity, transform };
    });

  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await durations()).toEqual({ opacity: "0.22s", transform: "0.22s" });

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await durations()).toEqual({ opacity: "0.22s", transform: "0s" });
});

/**
 * Two questions, deliberately separated. The keyframe is applied by hand to a plain element so
 * that `sonner`'s selector does not match it: with `data-sonner-toast` present, that library's
 * own reduced-motion rule sets `animation: none !important`, which produces zero travel whether
 * or not the distance token is doing anything, and the assertion could not tell the difference.
 *
 * Sampled at the animation's end rather than half way, so the expected travel is the token's own
 * value and does not depend on the easing curve.
 */
test("drives the exit keyframe's travel from the distance token", async ({ page }) => {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/");

    const sampled = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.animation =
        "discovery-notice-exit var(--jr-motion-duration-slow) var(--jr-ease-out) -300ms both paused";
      document.body.appendChild(probe);
      const styles = getComputedStyle(probe);
      const distance = styles.getPropertyValue("--jr-motion-transform-distance").trim();
      const travel = Math.abs(new DOMMatrixReadOnly(styles.transform).f);
      probe.remove();
      return { distance, travel };
    });

    if (reducedMotion === "reduce") {
      expect(sampled.distance, "reduced motion zeroes the distance token").toBe("0");
      expect(sampled.travel, "so the keyframe travels nowhere").toBe(0);
    } else {
      expect(sampled.distance).toBe(".25rem");
      expect(sampled.travel, "and travels the token's value when motion is not reduced").toBe(4);
    }
  }
});

/**
 * A separate, smaller claim: `sonner` suppresses its own toast animation under reduced motion,
 * with `animation: none !important` on `[data-sonner-toast]` and every descendant. The product
 * inherits that, which costs a reduced-motion user the opacity change as well as the movement.
 * Asserted rather than assumed, because the fix for it is a decision someone has to take.
 */
test("inherits sonner's suppression of the toast animation under reduced motion", async ({
  page,
}) => {
  await page.goto("/");

  const named = async () =>
    page.evaluate(() => {
      const notice = document.createElement("div");
      notice.className = "discovery-notice";
      notice.dataset.sonnerToast = "";
      notice.style.setProperty("--discovery-notice-hold-duration", "0ms");
      document.body.appendChild(notice);
      const name = getComputedStyle(notice).animationName;
      notice.remove();
      return name;
    });

  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await named()).toBe("discovery-notice-exit");

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await named(), "sonner removes the animation, so the fade goes with the movement").toBe(
    "none",
  );
});

/**
 * `body` reserves the bar's height at the end of the document, so whether a control
 * cleared the fixed navigation used to depend on where the content happened to fall. Every
 * control is checked rather than the last one, because the last one on these routes has trailing
 * content beneath it and passes without any rule at all.
 *
 * `block: "end"` rather than `"nearest"`: `"nearest"` does not scroll an element already
 * inside the scrollport, even when the fixed bar is painted over it, so scroll-margin-bottom
 * is never consulted and the rule under test is never exercised.
 */
test("keeps every control clear of the fixed navigation when scrolled into view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto("/settings/opportunities");

  const navigation = page.locator(".nav-list");
  await expect(navigation).toBeVisible();

  const obscured = await page.evaluate(() => {
    const bar = document.querySelector(".nav-list")?.getBoundingClientRect();
    if (bar === undefined) {
      throw new Error("The fixed mobile navigation is not present.");
    }
    const covered: string[] = [];
    for (const control of document.querySelectorAll<HTMLElement>(
      "main :is(button, a, input, select, textarea)",
    )) {
      control.scrollIntoView({ block: "end" });
      const box = control.getBoundingClientRect();
      if (box.height > 0 && box.bottom > bar.top && box.top < bar.bottom) {
        covered.push(`${control.tagName.toLowerCase()}#${control.id || "(no id)"}`);
      }
    }
    return covered;
  });

  expect(obscured).toEqual([]);
});

/**
 * Inter is materially wider than the condensed face it replaced. Measured at 390px with the
 * brand name shown: `.brand` reported a scrollWidth of 168 against a clientWidth of 99, so the
 * name overflowed its own column rather than the masthead, which is why this asserts per-element
 * overflow rather than the masthead's outer bounds. `.sr-only` is excluded because a 1px clipped
 * box is what it is for.
 */
for (const width of [390, 500, 768, 1440]) {
  test(`keeps every masthead element within its own box at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expect(page.locator(".masthead")).toBeVisible();

    const overflowing = await page.evaluate(() => {
      const masthead = document.querySelector<HTMLElement>(".masthead");
      if (masthead === null) {
        throw new Error("The masthead is not present.");
      }
      return [masthead, ...masthead.querySelectorAll<HTMLElement>("*")]
        .filter((element) => !element.classList.contains("sr-only"))
        .map((element) => ({
          name: element.className || element.tagName,
          overflow: element.scrollWidth - element.clientWidth,
        }))
        .filter(({ overflow }) => overflow > 0);
    });

    expect(overflowing).toEqual([]);
  });
}

function over(foreground: string, background: string) {
  const front = toRgb(foreground);
  const back = toRgb(background);
  const alpha = front.alpha ?? 1;
  if (alpha >= 1) {
    return front;
  }
  return {
    mode: "rgb" as const,
    b: front.b * alpha + back.b * (1 - alpha),
    g: front.g * alpha + back.g * (1 - alpha),
    r: front.r * alpha + back.r * (1 - alpha),
  };
}

function toRgb(colour: string) {
  const converted = rgb(colour);
  if (converted === undefined) {
    throw new Error(`Unparseable colour: ${colour}`);
  }
  return converted;
}
