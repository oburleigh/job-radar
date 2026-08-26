import { describe, expect, it } from "vitest";

import { githubActionsPolicyErrors } from "./check-github-actions";

describe("GitHub Actions reference policy", () => {
  it("accepts an immutable third-party action reference with its release version", () => {
    expect(
      githubActionsPolicyErrors(
        "steps:\n  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n",
        ".github/workflows/ci.yml",
      ),
    ).toEqual([]);
  });

  it("accepts a quoted immutable action reference", () => {
    expect(
      githubActionsPolicyErrors(
        'steps:\n  - uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1" # v7.0.1\n',
        ".github/workflows/ci.yml",
      ),
    ).toEqual([]);
  });

  it("rejects a mutable tag reference", () => {
    expect(
      githubActionsPolicyErrors(
        "steps:\n  - uses: actions/checkout@v7.0.1\n",
        ".github/workflows/ci.yml",
      ),
    ).toEqual([
      ".github/workflows/ci.yml:2: third-party action actions/checkout must use a full 40-character lowercase commit SHA",
    ]);
  });

  it("cannot hide a mutable tag behind a longer comment", () => {
    expect(
      githubActionsPolicyErrors(
        "steps:\n  - uses: actions/checkout@v7.0.1 # v7.0.1 mutable tag\n",
        ".github/workflows/ci.yml",
      ),
    ).toEqual([
      ".github/workflows/ci.yml:2: third-party action actions/checkout must use a full 40-character lowercase commit SHA",
    ]);
  });

  it("requires the release version beside a pinned action", () => {
    expect(
      githubActionsPolicyErrors(
        "steps:\n  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n",
        ".github/workflows/ci.yml",
      ),
    ).toEqual([
      ".github/workflows/ci.yml:2: pinned third-party action actions/checkout must end with a release comment such as # v7.0.1",
    ]);
  });

  it("allows repository-local actions without a release comment", () => {
    expect(
      githubActionsPolicyErrors(
        "steps:\n  - uses: ./.github/actions/setup\n",
        ".github/workflows/ci.yml",
      ),
    ).toEqual([]);
  });
});
