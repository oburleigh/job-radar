import { describe, expect, it } from "vitest";

import {
  type CompanySiteBoard,
  type CompanySitesSort,
  getCompanySiteHealth,
  getNextCompanySitesSort,
  sortCompanySites,
} from "./company-sites-table";

const atsLabels = {
  ashby: "Ashby",
  custom: "Aardvark ATS",
  greenhouse: "Greenhouse",
  lever: "Lever",
};

const boards: readonly CompanySiteBoard[] = [
  board({
    id: 1,
    companyName: "Zeta Labs",
    slug: "zeta",
    atsType: "ashby",
    lastSyncedAt: new Date("2026-01-02T12:00:00Z"),
    enabled: true,
  }),
  board({
    id: 2,
    companyName: "",
    slug: "Acme 10",
    atsType: "lever",
    lastSyncedAt: null,
    lastError: "Synchronization failed",
    enabled: false,
  }),
  board({
    id: 3,
    companyName: "Acme 2",
    slug: "acme-2",
    atsType: "greenhouse",
    lastSyncedAt: new Date("2026-03-01T12:00:00Z"),
    enabled: false,
  }),
  board({
    id: 4,
    companyName: "Beta",
    slug: "beta-four",
    atsType: "custom",
    lastSyncedAt: new Date("2026-01-01T12:00:00Z"),
    lastError: "Synchronization failed",
    enabled: true,
  }),
  board({
    id: 5,
    companyName: "beta",
    slug: "beta-five",
    atsType: "ashby",
    lastSyncedAt: new Date("2026-02-01T12:00:00Z"),
    enabled: true,
  }),
];

describe("company sites sorting", () => {
  it("defaults to company display name ascending with numeric-friendly matching and stable ties", () => {
    expect(ids(sortCompanySites(boards, atsLabels))).toEqual([3, 2, 4, 5, 1]);
  });

  it.each<[CompanySitesSort, readonly number[]]>([
    [{ key: "company", direction: "descending" }, [1, 4, 5, 2, 3]],
    [{ key: "ats", direction: "ascending" }, [4, 5, 1, 3, 2]],
    [{ key: "ats", direction: "descending" }, [2, 3, 5, 1, 4]],
    [{ key: "last-synchronized", direction: "ascending" }, [4, 1, 5, 3, 2]],
    [{ key: "last-synchronized", direction: "descending" }, [3, 5, 1, 4, 2]],
    [{ key: "health", direction: "ascending" }, [2, 4, 3, 5, 1]],
    [{ key: "health", direction: "descending" }, [3, 5, 1, 2, 4]],
    [{ key: "enabled", direction: "ascending" }, [3, 2, 4, 5, 1]],
    [{ key: "enabled", direction: "descending" }, [4, 5, 1, 3, 2]],
  ])("sorts by $key $direction", (sort, expectedIds) => {
    expect(ids(sortCompanySites(boards, atsLabels, sort))).toEqual(expectedIds);
  });

  it("keeps never-synchronized boards last in both directions", () => {
    const ascending = sortCompanySites(boards, atsLabels, {
      key: "last-synchronized",
      direction: "ascending",
    });
    const descending = sortCompanySites(boards, atsLabels, {
      key: "last-synchronized",
      direction: "descending",
    });

    expect(ascending.at(-1)?.id).toBe(2);
    expect(descending.at(-1)?.id).toBe(2);
  });

  it("does not mutate the loader-owned board array", () => {
    const input = [...boards];
    const originalIds = ids(input);

    const sorted = sortCompanySites(input, atsLabels, {
      key: "ats",
      direction: "ascending",
    });

    expect(ids(input)).toEqual(originalIds);
    expect(sorted).not.toBe(input);
  });
});

describe("company sites sort selection", () => {
  it.each<[CompanySitesSort, CompanySitesSort["key"], CompanySitesSort]>([
    [
      { key: "company", direction: "ascending" },
      "company",
      { key: "company", direction: "descending" },
    ],
    [
      { key: "company", direction: "descending" },
      "company",
      { key: "company", direction: "ascending" },
    ],
    [{ key: "ats", direction: "descending" }, "health", { key: "health", direction: "ascending" }],
  ])("selects $1 from $0", (current, requestedKey, expected) => {
    expect(getNextCompanySitesSort(current, requestedKey)).toEqual(expected);
  });
});

describe("company site health", () => {
  it("classifies a partial synchronization warning separately from a failure", () => {
    const lastWarning =
      "Skipped 1 invalid vendor record. Ashby ashby:example job-7: title is invalid";

    expect(getCompanySiteHealth(board({ lastWarning }))).toEqual({
      label: "Partial",
      className: "health health-warning",
      detail: lastWarning,
    });
  });

  it("classifies a failed synchronization and gives errors precedence over warnings", () => {
    expect(
      getCompanySiteHealth(
        board({ lastError: "Synchronization failed", lastWarning: "Skipped 1 record" }),
      ),
    ).toEqual({
      label: "Needs attention",
      className: "health health-error",
      detail: "Synchronization failed",
    });
  });

  it("classifies a clean sync as ready without detail", () => {
    expect(getCompanySiteHealth(board({}))).toEqual({
      label: "Ready",
      className: "health health-ok",
      detail: "",
    });
  });
});

function board(overrides: Partial<CompanySiteBoard>): CompanySiteBoard {
  return {
    id: 100,
    atsType: "ashby",
    companyName: "Example",
    slug: "example",
    baseUrl: "https://jobs.ashbyhq.com/example",
    enabled: true,
    lastSyncedAt: null,
    lastError: "",
    lastWarning: "",
    ...overrides,
  };
}

function ids(values: readonly CompanySiteBoard[]): number[] {
  return values.map(({ id }) => id);
}
