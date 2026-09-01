import { describe, expect, it } from "vitest";

import { createSetSourceCoverageEnabled } from "./use-case";

describe("set source coverage enabled", () => {
  it.each(["source", "board"] as const)("updates the selected %s", (kind) => {
    const changedSources: { id: number; enabled: boolean }[] = [];
    const changedBoards: { id: number; enabled: boolean }[] = [];
    const setEnabled = createSetSourceCoverageEnabled({
      coverage: {
        setSourceEnabled: (id, enabled) => changedSources.push({ id, enabled }),
        setBoardEnabled: (id, enabled) => changedBoards.push({ id, enabled }),
        setCompanyBoardRefreshEnabled: () => undefined,
      },
      now: () => new Date("2026-09-01T10:00:00.000Z"),
    });

    expect(setEnabled({ kind, id: 4, enabled: false })).toEqual({ status: "changed" });
    expect(changedSources).toEqual(kind === "source" ? [{ id: 4, enabled: false }] : []);
    expect(changedBoards).toEqual(kind === "board" ? [{ id: 4, enabled: false }] : []);
  });

  it("changes the company-board refresh policy without changing individual boards", () => {
    const changed: Array<{ enabled: boolean; changedAt: Date }> = [];
    const setEnabled = createSetSourceCoverageEnabled({
      coverage: {
        setSourceEnabled: () => undefined,
        setBoardEnabled: () => undefined,
        setCompanyBoardRefreshEnabled: (enabled, changedAt) => changed.push({ enabled, changedAt }),
      },
      now: () => new Date("2026-09-01T10:00:00.000Z"),
    });

    expect(setEnabled({ kind: "company-board-refresh", enabled: false })).toEqual({
      status: "changed",
    });
    expect(changed).toEqual([{ enabled: false, changedAt: new Date("2026-09-01T10:00:00.000Z") }]);
  });
});
