import { describe, expect, it } from "vitest";

import { parseCompanyBoardsRequest } from "./company-boards-request";

describe("company boards request", () => {
  it.each([
    ["true", true],
    ["false", false],
  ] as const)("maps %s to the company-board bulk command", (input, enabled) => {
    const formData = new FormData();
    formData.set("enabled", input);

    expect(parseCompanyBoardsRequest(formData)).toEqual({
      ok: true,
      command: { kind: "company-boards", enabled },
    });
  });

  it("rejects an unknown switch value", () => {
    const formData = new FormData();
    formData.set("enabled", "on");

    expect(parseCompanyBoardsRequest(formData)).toEqual({
      ok: false,
      message: "Choose whether company boards are enabled.",
    });
  });
});
