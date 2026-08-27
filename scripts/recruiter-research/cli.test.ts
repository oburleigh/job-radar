import { describe, expect, it } from "vitest";

import { parseRecruiterResearchArguments } from "./cli";

describe("recruiter research CLI arguments", () => {
  it("uses the default target and keeps a plain-language brief", () => {
    expect(parseRecruiterResearchArguments(["Prioritise fintech firms."])).toEqual({
      brief: "Prioritise fintech firms.",
      recruiterTarget: 20,
    });
  });

  it("uses a caller-controlled recruiter target without treating the brief as an option", () => {
    expect(
      parseRecruiterResearchArguments([
        "--recruiters",
        "24",
        "Prioritise fintech and healthtech firms.",
      ]),
    ).toEqual({
      brief: "Prioritise fintech and healthtech firms.",
      recruiterTarget: 24,
    });
  });

  it("rejects a missing or non-positive recruiter target", () => {
    expect(() => parseRecruiterResearchArguments(["--recruiters"])).toThrow(
      "--recruiters requires a positive integer",
    );
    expect(() => parseRecruiterResearchArguments(["--recruiters", "0"])).toThrow(
      "--recruiters requires a positive integer",
    );
  });
});
