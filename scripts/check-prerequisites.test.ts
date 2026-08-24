import { describe, expect, it } from "vitest";

import {
  SUPPORTED_NODE_MAJOR,
  SUPPORTED_PNPM_MAJOR,
  setupPrerequisiteErrors,
} from "./check-prerequisites";

const validSetup = {
  nodeVersion: `${SUPPORTED_NODE_MAJOR}.15.0`,
  pnpmVersion: `${SUPPORTED_PNPM_MAJOR}.1.3`,
  environmentFileExists: true,
  providerKeys: {
    BRAVE_SEARCH_API_KEY: "",
    SERPAPI_KEY: "",
    SERPER_API_KEY: "configured",
  },
};

describe("setup prerequisites", () => {
  it("accepts the supported runtime and one configured provider", () => {
    expect(setupPrerequisiteErrors(validSetup)).toEqual([]);
  });

  it("reports unsupported Node and pnpm versions directly", () => {
    expect(
      setupPrerequisiteErrors({
        ...validSetup,
        nodeVersion: "25.1.0",
        pnpmVersion: "10.9.0",
      }),
    ).toEqual([
      "Job Radar requires Node.js 24.x; found 25.1.0.",
      "Job Radar requires pnpm 11.x through Corepack; found 10.9.0.",
    ]);
  });

  it("explains how to create the missing environment file", () => {
    expect(
      setupPrerequisiteErrors({
        ...validSetup,
        environmentFileExists: false,
        providerKeys: {
          BRAVE_SEARCH_API_KEY: undefined,
          SERPAPI_KEY: undefined,
          SERPER_API_KEY: undefined,
        },
      }),
    ).toContain("Copy .env.example to .env before setup.");
  });

  it("requires one non-empty provider key", () => {
    expect(
      setupPrerequisiteErrors({
        ...validSetup,
        providerKeys: {
          BRAVE_SEARCH_API_KEY: "  ",
          SERPAPI_KEY: "",
          SERPER_API_KEY: "",
        },
      }),
    ).toContain(
      "Add one search provider key to .env: BRAVE_SEARCH_API_KEY, SERPAPI_KEY, or SERPER_API_KEY.",
    );
  });

  it("accepts provider credentials injected by the process without an env file", () => {
    expect(
      setupPrerequisiteErrors({
        ...validSetup,
        environmentFileExists: false,
      }),
    ).toEqual([]);
  });

  it("keeps database setup independent of provider credentials", () => {
    expect(
      setupPrerequisiteErrors(
        {
          ...validSetup,
          environmentFileExists: false,
          providerKeys: {
            BRAVE_SEARCH_API_KEY: undefined,
            SERPAPI_KEY: undefined,
            SERPER_API_KEY: undefined,
          },
        },
        { requireProviderKey: false },
      ),
    ).toEqual([]);
  });
});
