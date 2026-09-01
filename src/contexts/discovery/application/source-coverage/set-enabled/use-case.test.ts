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
        setCompanyBoardsEnabled: () => undefined,
      },
    });

    expect(setEnabled({ kind, id: 4, enabled: false })).toEqual({ status: "changed" });
    expect(changedSources).toEqual(kind === "source" ? [{ id: 4, enabled: false }] : []);
    expect(changedBoards).toEqual(kind === "board" ? [{ id: 4, enabled: false }] : []);
  });

  it("changes every company board together", () => {
    const changed: boolean[] = [];
    const setEnabled = createSetSourceCoverageEnabled({
      coverage: {
        setSourceEnabled: () => undefined,
        setBoardEnabled: () => undefined,
        setCompanyBoardsEnabled: (enabled) => changed.push(enabled),
      },
    });

    expect(setEnabled({ kind: "company-boards", enabled: false })).toEqual({
      status: "changed",
    });
    expect(changed).toEqual([false]);
  });
});
