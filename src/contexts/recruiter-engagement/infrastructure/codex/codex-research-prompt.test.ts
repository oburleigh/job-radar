import { describe, expect, it } from "vitest";
import type { FirmObservation } from "@/contexts/recruiter-engagement/domain/observation";
import { createResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";
import {
  testAdapterPolicy,
  testSearchBrief,
  testSourcePlan,
} from "@/contexts/recruiter-engagement/test-support/research-policy-fixtures";
import { firmDiscoveryInstructions, recruiterDiscoveryInstructions } from "./codex-research-prompt";

function researchRun(brief = testSearchBrief({ firmTarget: 20, recruiterTarget: 40 })) {
  return createResearchRun({
    brief,
    id: "run-codex",
    policy: testAdapterPolicy,
    sourcePlan: testSourcePlan,
    startedAt: new Date("2026-09-01T10:00:00.000Z"),
  });
}

const run = researchRun();

describe("codex firm discovery instructions", () => {
  it("asks for the run's own firm target", () => {
    expect(firmDiscoveryInstructions(run)).toContain("20");
  });

  it("names the run's target locations", () => {
    expect(firmDiscoveryInstructions(run)).toContain("United Arab Emirates");
  });

  it("names the run's specialisms and target industries", () => {
    const instructions = firmDiscoveryInstructions(run);
    expect(instructions).toContain("Software engineering");
    expect(instructions).toContain("Technology");
  });

  it("carries the user's own description", () => {
    const described = researchRun(
      testSearchBrief({ description: "Senior backend roles.", firmTarget: 2, recruiterTarget: 4 }),
    );
    expect(firmDiscoveryInstructions(described)).toContain("Senior backend roles.");
  });

  it("requires a citation for every firm", () => {
    expect(firmDiscoveryInstructions(run)).toContain("sourceUrl");
  });

  it("embeds no market, specialism or industry of its own", () => {
    const unrelated = researchRun(
      testSearchBrief({
        criteria: {
          industries: ["Shipping"],
          specialisms: ["Marine engineering"],
          targetLocations: ["Norway"],
        },
        description: "",
        firmTarget: 3,
        recruiterTarget: 6,
      }),
    );
    const instructions = firmDiscoveryInstructions(unrelated);
    expect(instructions).toContain("Marine engineering");
    expect(instructions).toContain("Norway");
    expect(instructions).not.toMatch(/technology|software|united arab emirates/i);
  });

  it("embeds no target count of its own", () => {
    const small = researchRun(testSearchBrief({ firmTarget: 3, recruiterTarget: 6 }));
    expect(firmDiscoveryInstructions(small)).not.toContain("20");
  });
});

describe("codex recruiter discovery instructions", () => {
  const firms: readonly Pick<FirmObservation, "companyName" | "websiteUrl">[] = [
    { companyName: "Example Search", websiteUrl: "https://example-search.com" },
    { companyName: "Second Search", websiteUrl: "https://second-search.com" },
  ];

  it("lists the firms handed to the recruiter stage", () => {
    const instructions = recruiterDiscoveryInstructions(run, firms);
    expect(instructions).toContain("https://example-search.com");
    expect(instructions).toContain("Second Search");
  });

  it("asks for the run's own recruiter target", () => {
    expect(recruiterDiscoveryInstructions(run, firms)).toContain("40");
  });

  it("requires a citation for every recruiter", () => {
    expect(recruiterDiscoveryInstructions(run, firms)).toContain("sourceUrl");
  });

  it("forbids collecting personal contact details", () => {
    expect(recruiterDiscoveryInstructions(run, firms)).toMatch(/contact details/i);
  });
});
