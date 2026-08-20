import { describe, expect, it, vi } from "vitest";

import type { SaveAtsIntegrationCommand } from "./command";
import { createSaveAtsIntegration } from "./use-case";

describe("save ATS integration", () => {
  it("saves a new search-only custom integration", () => {
    const save = vi.fn();
    const changedAt = new Date("2026-08-20T13:00:00.000Z");
    const execute = createSaveAtsIntegration({
      integrations: registry({ save }),
      now: () => changedAt,
    });
    const command = integration();

    expect(execute(command)).toEqual({
      status: "saved",
      atsType: "teamtailor",
      label: "Teamtailor",
      created: true,
    });
    expect(save).toHaveBeenCalledWith(command, changedAt);
  });

  it("rejects direct sync for a custom integration", () => {
    const save = vi.fn();
    const execute = createSaveAtsIntegration({
      integrations: registry({ save }),
      now: () => new Date(),
    });

    expect(execute(integration({ supportsBoardSync: true }))).toEqual({
      status: "rejected",
      reason: "custom-sync-not-supported",
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("reports a search-pattern ownership conflict", () => {
    const execute = createSaveAtsIntegration({
      integrations: registry({
        findPatternConflict: () => ({ pattern: "jobs.example.com", owner: "greenhouse" }),
      }),
      now: () => new Date(),
    });

    expect(execute(integration())).toEqual({
      status: "rejected",
      reason: "pattern-conflict",
      pattern: "jobs.example.com",
      owner: "greenhouse",
    });
  });
});

function integration(
  overrides: Partial<SaveAtsIntegrationCommand> = {},
): SaveAtsIntegrationCommand {
  return {
    atsType: "teamtailor",
    isNew: true,
    label: "Teamtailor",
    searchPatterns: ["jobs.example.com"],
    hostnames: ["jobs.example.com"],
    hostSuffixes: [],
    supportsBoardSync: false,
    priority: 1_000,
    pageSize: null,
    endpoints: {},
    ...overrides,
  };
}

function registry(overrides: Partial<import("./port").AtsIntegrationRegistry> = {}) {
  return {
    isBuiltIn: () => false,
    exists: () => false,
    findPatternConflict: () => null,
    save: vi.fn(),
    ...overrides,
  };
}
