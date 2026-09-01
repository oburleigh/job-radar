import { describe, expect, it } from "vitest";

import { parseCompanyBoardRefreshRequest } from "./company-board-refresh-request";

describe("company board refresh request", () => {
  it.each([
    ["true", true],
    ["false", false],
  ] as const)("maps %s to the company-board refresh command", (input, enabled) => {
    const formData = new FormData();
    formData.set("enabled", input);

    expect(parseCompanyBoardRefreshRequest(formData)).toEqual({
      ok: true,
      command: { kind: "company-board-refresh", enabled },
    });
  });

  it("rejects an unknown switch value", () => {
    const formData = new FormData();
    formData.set("enabled", "on");

    expect(parseCompanyBoardRefreshRequest(formData)).toEqual({
      ok: false,
      message: "Choose whether company boards are refreshed.",
    });
  });
});
