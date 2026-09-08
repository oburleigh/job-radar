import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("recruiter research styles", () => {
  it("draws the evidence boundary at the token's border width, not a raw pixel", async () => {
    const styles = await readFile(new URL("./styles.css", import.meta.url), "utf8");

    expect(styles).toContain("border-left: var(--jr-border-width) solid var(--jr-color-accent);");
    expect(styles).not.toContain("border-left: 1px");
  });
});
