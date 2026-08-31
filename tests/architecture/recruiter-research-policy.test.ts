import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const contextRoot = path.resolve(process.cwd(), "src/contexts/recruiter-engagement");
const policyConsumers = [
  "domain/research-run.ts",
  "infrastructure/public-web/public-web-policy.ts",
  "infrastructure/public-web/public-web-research-source.ts",
  "presentation/web/recruiter-research-page.tsx",
].map((file) => ({ file, source: readFileSync(path.join(contextRoot, file), "utf8") }));

describe("recruiter research product policy", () => {
  it("keeps market, criteria, targets, and provider defaults out of policy consumers", () => {
    const seededProductValues = [
      "United Arab Emirates",
      "Financial services",
      "Software engineering",
      'providerName: "serper"',
    ];
    for (const { file, source } of policyConsumers) {
      for (const value of seededProductValues) {
        expect(source, `${file} embeds configured product value ${value}`).not.toContain(value);
      }
    }
    expect(
      policyConsumers.find(({ file }) => file === "domain/research-run.ts")?.source,
    ).not.toMatch(/DEFAULT_(?:FIRM|RECRUITER)_TARGET/);
  });

  it("builds provider queries exclusively from the frozen run and Source plan", () => {
    const source = policyConsumers.find(({ file }) =>
      file.endsWith("public-web-research-source.ts"),
    )?.source;
    expect(source).toContain("run.brief.criteria.targetLocations");
    expect(source).toContain("run.brief.criteria.specialisms");
    expect(source).toContain("run.brief.criteria.industries");
    expect(source).toContain("policy.firmDiscoveryPhrases");
    expect(source).toContain("policy.recruiterRoleTerms");
    expect(source).not.toMatch(/for UAE|listed UAE/i);
  });
});
