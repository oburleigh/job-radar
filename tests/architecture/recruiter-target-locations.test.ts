import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const recruiterPresentation = path.resolve(
  process.cwd(),
  "src/contexts/recruiter-engagement/presentation/web/recruiter-research-page.tsx",
);

describe("recruiter target location control", () => {
  it("renders a recruiter-owned shared token autocomplete without a raw geography field", () => {
    const source = readFileSync(recruiterPresentation, "utf8");

    expect(source).toContain('name="targetLocations"');
    expect(source).toContain("RecruiterLocationCombobox");
    expect(source).not.toMatch(/<select\b[^>]*name="targetLocations"/);
    expect(source).not.toMatch(/\bgeography\b/i);
    expect(source).not.toMatch(/@\/contexts\/discovery\/presentation/);
    expect(source).not.toMatch(/<(?:TextField|input|textarea)\b[^>]*name="targetLocations"/);
  });
});
