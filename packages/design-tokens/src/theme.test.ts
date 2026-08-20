import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const theme = readFileSync(
  path.resolve(process.cwd(), "packages/design-tokens/src/theme.css"),
  "utf8",
);

describe("design token contract", () => {
  it("authors the colour system in OKLCH", () => {
    expect(theme).toContain("oklch(");
    expect(theme).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(theme).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/i);
  });

  it("separates primitive values from semantic colour roles", () => {
    expect(theme).toContain("--jr-palette-");
    expect(theme).toContain("--jr-color-");
    expect(theme).toContain("light-dark(");
    expect(theme).toContain("color-mix(in oklch");
  });

  it("namespaces every public custom property", () => {
    const declarations = [...theme.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]);

    expect(declarations.length).toBeGreaterThan(40);
    expect(declarations.every((name) => name?.startsWith("--jr-"))).toBe(true);
  });

  it("supports system, explicit light, and explicit dark themes from one token graph", () => {
    expect(theme).toMatch(/:root\s*\{[\s\S]*color-scheme:\s*light dark/);
    expect(theme).toMatch(/:root\[data-theme="light"\][\s\S]*color-scheme:\s*light/);
    expect(theme).toMatch(/:root\[data-theme="dark"\][\s\S]*color-scheme:\s*dark/);
  });

  it("collapses decorative motion for reduced-motion users", () => {
    expect(theme).toContain("@media (prefers-reduced-motion: reduce)");
    expect(theme).not.toContain("0.01ms");
    expect(theme).not.toContain("!important");
    expect(theme).toContain("--jr-motion-duration-fast: 0ms");
  });

  it("keeps critical text and control pairs at WCAG AA contrast", () => {
    const pairs = [
      semanticPair("body on surface", "jr-color-text", "jr-color-surface"),
      semanticPair("muted text on surface", "jr-color-text-muted", "jr-color-surface"),
      semanticPair("subtle text on surface", "jr-color-text-subtle", "jr-color-surface"),
      semanticPair(
        "subtle text on subtle surface",
        "jr-color-text-subtle",
        "jr-color-surface-subtle",
      ),
      semanticPair("text on accent", "jr-color-text-on-accent", "jr-color-accent"),
      semanticPair("button label on action", "jr-color-text-on-action", "jr-color-action"),
      semanticPair("danger text on danger surface", "jr-color-danger", "jr-color-danger-subtle"),
      {
        name: "navigation text on navigation surface",
        light: [palette("jr-palette-white"), palette("jr-palette-text-light")],
        dark: [palette("jr-palette-white"), palette("jr-palette-black")],
      },
    ] as const;

    for (const pair of pairs) {
      expect(contrast(...pair.light), `${pair.name} in light mode`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(...pair.dark), `${pair.name} in dark mode`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

interface Oklch {
  readonly chroma: number;
  readonly hue: number;
  readonly lightness: number;
}

function semanticPair(name: string, foreground: string, background: string) {
  const foregroundReferences = semanticReferences(foreground);
  const backgroundReferences = semanticReferences(background);
  return {
    name,
    light: [palette(foregroundReferences.light), palette(backgroundReferences.light)] as const,
    dark: [palette(foregroundReferences.dark), palette(backgroundReferences.dark)] as const,
  };
}

function semanticReferences(name: string): { readonly light: string; readonly dark: string } {
  const declaration = new RegExp(
    `--${name}:\\s*light-dark\\(\\s*var\\(--([a-z0-9-]+)\\),\\s*var\\(--([a-z0-9-]+)\\)\\s*\\)`,
  ).exec(theme);
  if (!declaration?.[1] || !declaration[2]) {
    throw new Error(`Expected ${name} to map light and dark primitive tokens.`);
  }
  return { light: declaration[1], dark: declaration[2] };
}

function palette(name: string): Oklch {
  const declaration = new RegExp(
    `--${name}:\\s*oklch\\(([0-9.]+)%\\s+([0-9.]+)\\s+([0-9.]+)deg\\)`,
  ).exec(theme);
  if (!declaration?.[1] || !declaration[2] || !declaration[3]) {
    throw new Error(`Expected ${name} to contain an OKLCH value.`);
  }
  return {
    lightness: Number(declaration[1]) / 100,
    chroma: Number(declaration[2]),
    hue: Number(declaration[3]),
  };
}

function contrast(foreground: Oklch, background: Oklch): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const light = Math.max(foregroundLuminance, backgroundLuminance);
  const dark = Math.min(foregroundLuminance, backgroundLuminance);
  return (light + 0.05) / (dark + 0.05);
}

function relativeLuminance({ lightness, chroma, hue }: Oklch): number {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  const red = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const green = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
