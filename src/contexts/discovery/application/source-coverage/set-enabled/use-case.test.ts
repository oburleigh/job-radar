import { describe, expect, it, vi } from "vitest";

import { createSetSourceCoverageEnabled } from "./use-case";

describe("set source coverage enabled", () => {
  it.each(["source", "board"] as const)("updates the selected %s", (kind) => {
    const setSourceEnabled = vi.fn();
    const setBoardEnabled = vi.fn();
    const setEnabled = createSetSourceCoverageEnabled({
      coverage: { setSourceEnabled, setBoardEnabled },
    });

    expect(setEnabled({ kind, id: 4, enabled: false })).toEqual({ status: "changed" });
    const expected = kind === "source" ? setSourceEnabled : setBoardEnabled;
    expect(expected).toHaveBeenCalledWith(4, false);
  });
});
