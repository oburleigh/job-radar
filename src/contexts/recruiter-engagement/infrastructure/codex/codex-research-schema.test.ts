import { describe, expect, it } from "vitest";
import {
  codexFirmJsonSchema,
  codexFirmReplySchema,
  codexRecruiterJsonSchema,
  codexRecruiterReplySchema,
} from "./codex-research-schema";

const firm = {
  companyName: "Example Technology Recruitment",
  confidence: "high",
  excerpt: "We recruit software engineers for clients across the UAE.",
  hasCurrentMandatesOrActivity: true,
  hasNamedRecruiterOrTeamEvidence: true,
  hasScaleOrTrackRecord: false,
  industries: ["Technology"],
  reason: "Places software engineering roles across the United Arab Emirates.",
  sourceUrl: "https://example-tech-recruitment.com/about",
  specialisms: ["Software engineering"],
  targetMarkets: ["United Arab Emirates"],
  websiteUrl: "https://example-tech-recruitment.com",
};

const recruiter = {
  companyName: "Example Technology Recruitment",
  confidence: "medium",
  excerpt: "Alex Morgan, Principal Consultant.",
  name: "Alex Morgan",
  profileUrl: "https://example.com/in/alex-morgan",
  sourceUrl: "https://example-tech-recruitment.com/team",
  title: "Principal Consultant",
};

describe("codex research schema", () => {
  it("accepts a complete firm reply", () => {
    expect(codexFirmReplySchema.parse({ firms: [firm] }).firms).toHaveLength(1);
  });

  it("accepts a reply with no firms, which is how an honest empty market presents", () => {
    expect(codexFirmReplySchema.parse({ firms: [] }).firms).toEqual([]);
  });

  it("rejects a firm whose website is not an absolute https url", () => {
    expect(() =>
      codexFirmReplySchema.parse({ firms: [{ ...firm, websiteUrl: "example.com" }] }),
    ).toThrow();
  });

  it("rejects a firm whose website is http rather than https", () => {
    expect(() =>
      codexFirmReplySchema.parse({ firms: [{ ...firm, websiteUrl: "http://example.com" }] }),
    ).toThrow();
  });

  it("rejects a firm with no citation, which is how a fabricated firm presents", () => {
    const { sourceUrl: _omitted, ...withoutCitation } = firm;
    expect(() => codexFirmReplySchema.parse({ firms: [withoutCitation] })).toThrow();
  });

  it("rejects a firm whose excerpt is empty", () => {
    expect(() => codexFirmReplySchema.parse({ firms: [{ ...firm, excerpt: "" }] })).toThrow();
  });

  it("rejects an unknown confidence level", () => {
    expect(() =>
      codexFirmReplySchema.parse({ firms: [{ ...firm, confidence: "certain" }] }),
    ).toThrow();
  });

  it("rejects a firm missing a ranking signal rather than assuming it false", () => {
    const { hasScaleOrTrackRecord: _omitted, ...withoutSignal } = firm;
    expect(() => codexFirmReplySchema.parse({ firms: [withoutSignal] })).toThrow();
  });

  it("accepts a complete recruiter reply", () => {
    expect(codexRecruiterReplySchema.parse({ recruiters: [recruiter] }).recruiters).toHaveLength(1);
  });

  it("rejects a recruiter whose profile url is missing", () => {
    const { profileUrl: _omitted, ...withoutProfile } = recruiter;
    expect(() => codexRecruiterReplySchema.parse({ recruiters: [withoutProfile] })).toThrow();
  });

  it("publishes json schemas the codex binary can consume", () => {
    expect(codexFirmJsonSchema).toMatchObject({ type: "object" });
    expect(JSON.stringify(codexFirmJsonSchema)).toContain("websiteUrl");
    expect(JSON.stringify(codexRecruiterJsonSchema)).toContain("profileUrl");
  });
});
