import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("recruiter research styles", () => {
  it("uses a one-pixel evidence boundary from the existing design system", async () => {
    const styles = await readFile(new URL("./styles.css", import.meta.url), "utf8");

    expect(styles).toContain("border-left: 1px solid var(--jr-color-accent);");
  });
});
