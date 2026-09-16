import { describe, expect, it } from "vitest";

import { parseApplicationStageChangeRequest } from "./application-stage-change-request";

describe("Application stage change request", () => {
  it("maps an explicit forward stage change", () => {
    expect(parseApplicationStageChangeRequest(fields())).toEqual({
      ok: true,
      command: { applicationId: 41, stage: "applied", intent: "advance" },
    });
  });

  it.each([
    ["intent", "start-application"],
    ["applicationId", "0"],
    ["stage", "unknown"],
    ["changeIntent", "automatic"],
  ])("rejects invalid %s input", (field, value) => {
    const input = fields();
    input.set(field, value);
    expect(parseApplicationStageChangeRequest(input)).toEqual({
      ok: false,
      message: "Check the Application stage change and try again.",
    });
  });
});

function fields(): FormData {
  const fields = new FormData();
  fields.set("intent", "change-application-stage");
  fields.set("applicationId", "41");
  fields.set("stage", "applied");
  fields.set("changeIntent", "advance");
  return fields;
}
