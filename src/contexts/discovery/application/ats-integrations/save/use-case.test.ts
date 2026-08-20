import { describe, expect, it } from "vitest";

import type { SaveAtsIntegrationCommand } from "./command";
import { createSaveAtsIntegration } from "./use-case";

describe("save ATS integration", () => {
  it("saves a new search-only custom integration", () => {
    const saved: { command: SaveAtsIntegrationCommand; at: Date }[] = [];
    const changedAt = new Date("2026-08-20T13:00:00.000Z");
    const execute = createSaveAtsIntegration({
      integrations: registry({ save: (command, at) => saved.push({ command, at }) }),
      now: () => changedAt,
    });
    const command = integration();

    expect(execute(command)).toEqual({
      status: "saved",
      atsType: "teamtailor",
      label: "Teamtailor",
      created: true,
    });
    expect(saved).toEqual([{ command, at: changedAt }]);
  });

  it("rejects direct sync for a custom integration", () => {
    const saved: SaveAtsIntegrationCommand[] = [];
    const execute = createSaveAtsIntegration({
      integrations: registry({ save: (command) => saved.push(command) }),
      now: () => new Date(),
    });

    expect(execute(integration({ supportsBoardSync: true }))).toEqual({
      status: "rejected",
      reason: "custom-sync-not-supported",
    });
    expect(saved).toEqual([]);
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

  it("rejects a duplicate new integration", () => {
    const saved: SaveAtsIntegrationCommand[] = [];
    const execute = createSaveAtsIntegration({
      integrations: registry({
        exists: () => true,
        save: (command) => saved.push(command),
      }),
      now: () => new Date(),
    });

    expect(execute(integration())).toEqual({ status: "rejected", reason: "already-exists" });
    expect(saved).toEqual([]);
  });

  it("rejects an update for an integration that does not exist", () => {
    const saved: SaveAtsIntegrationCommand[] = [];
    const execute = createSaveAtsIntegration({
      integrations: registry({ save: (command) => saved.push(command) }),
      now: () => new Date(),
    });

    expect(execute(integration({ isNew: false }))).toEqual({
      status: "rejected",
      reason: "not-found",
    });
    expect(saved).toEqual([]);
  });

  it("requires custom integrations to declare a hostname rule", () => {
    const saved: SaveAtsIntegrationCommand[] = [];
    const execute = createSaveAtsIntegration({
      integrations: registry({ save: (command) => saved.push(command) }),
      now: () => new Date(),
    });

    expect(execute(integration({ hostnames: [], hostSuffixes: [] }))).toEqual({
      status: "rejected",
      reason: "missing-host-rule",
    });
    expect(saved).toEqual([]);
  });

  it("preserves protocol capabilities only for built-in integrations", () => {
    const saved: SaveAtsIntegrationCommand[] = [];
    const execute = createSaveAtsIntegration({
      integrations: registry({
        isBuiltIn: () => true,
        save: (command) => saved.push(command),
      }),
      now: () => new Date(),
    });
    const command = integration({
      atsType: "greenhouse",
      supportsBoardSync: true,
      endpoints: { board: "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs" },
    });

    expect(execute(command)).toEqual({
      status: "saved",
      atsType: "greenhouse",
      label: "Teamtailor",
      created: true,
    });
    expect(saved).toEqual([command]);
  });

  it("strips protocol endpoints from custom integrations", () => {
    const saved: SaveAtsIntegrationCommand[] = [];
    const execute = createSaveAtsIntegration({
      integrations: registry({ save: (command) => saved.push(command) }),
      now: () => new Date(),
    });

    expect(execute(integration({ endpoints: { board: "https://example.com/jobs" } })).status).toBe(
      "saved",
    );
    expect(saved).toEqual([expect.objectContaining({ supportsBoardSync: false, endpoints: {} })]);
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
    save: () => undefined,
    ...overrides,
  };
}
