import { describe, expect, it } from "vitest";
import type { WebSearchRequest } from "@/platform/search/web-search-client";
import { createPublicPersonEvidenceVerifier } from "./public-person-evidence";

const person = {
  name: "Alex Morgan",
  title: "Engineering recruiter",
  companyName: "Example Search",
  profileUrl: "https://example.test/recruiters/alex",
  reason: "Relevant public person.",
  evidence: [
    {
      sourceUrl: "https://example.test/recruiters/alex",
      excerpt: "Alex Morgan is an Engineering recruiter at Example Search.",
    },
  ],
} as const;
const result = {
  url: person.profileUrl,
  title: "Alex Morgan",
  snippet: person.evidence[0].excerpt,
};

describe("public-person Evidence resolution", () => {
  it("resolves identities and quotations through the configured search client", async () => {
    const requests: WebSearchRequest[] = [];
    const verifier = createPublicPersonEvidenceVerifier({
      search: {
        search: async (request) => {
          requests.push(request);
          return { hasMore: false, results: [result] };
        },
      },
      resultsPerQuery: 7,
      requestLimit: 2,
    });
    await expect(verifier.verify([person])).resolves.toBe(true);
    expect(requests).toEqual([
      { count: 7, page: 1, query: '"https://example.test/recruiters/alex"' },
    ]);
  });

  it.each([
    { ...result, url: "https://example.test/someone-else" },
    { ...result, title: "Someone else", snippet: "Engineering recruiter at Example Search." },
    { ...result, snippet: "Alex Morgan is an accountant at Other Company." },
  ])("rejects an unresolved URL or unsupported identity", async (searchResult) => {
    const verifier = createPublicPersonEvidenceVerifier({
      search: { search: async () => ({ hasMore: false, results: [searchResult] }) },
      resultsPerQuery: 7,
      requestLimit: 2,
    });
    await expect(verifier.verify([person])).resolves.toBe(false);
  });

  it("rejects fabricated quotations even when the identity resolves", async () => {
    const verifier = createPublicPersonEvidenceVerifier({
      search: { search: async () => ({ hasMore: false, results: [result] }) },
      resultsPerQuery: 7,
      requestLimit: 2,
    });
    await expect(
      verifier.verify([
        {
          ...person,
          evidence: [{ sourceUrl: person.profileUrl, excerpt: "Alex guarantees a job offer." }],
        },
      ]),
    ).resolves.toBe(false);
  });

  it.each([
    { ...person, name: "Jamie Lee" },
    { ...person, title: "Finance recruiter" },
    { ...person, companyName: "Different Search" },
  ])("rejects each unsupported identity fact despite a genuine quotation", async (candidate) => {
    const verifier = createPublicPersonEvidenceVerifier({
      search: { search: async () => ({ hasMore: false, results: [result] }) },
      resultsPerQuery: 7,
      requestLimit: 2,
    });
    await expect(verifier.verify([candidate])).resolves.toBe(false);
    await expect(verifier.verify([person, candidate])).resolves.toBe(false);
  });

  it("requires every quotation to resolve when another quotation is genuine", async () => {
    const verifier = createPublicPersonEvidenceVerifier({
      search: { search: async () => ({ hasMore: false, results: [result] }) },
      resultsPerQuery: 7,
      requestLimit: 2,
    });
    await expect(
      verifier.verify([
        {
          ...person,
          evidence: [
            ...person.evidence,
            { sourceUrl: person.profileUrl, excerpt: "Invented promise." },
          ],
        },
      ]),
    ).resolves.toBe(false);
  });

  it("shares URL lookups and enforces the configured request limit before making requests", async () => {
    let calls = 0;
    const verifier = createPublicPersonEvidenceVerifier({
      search: {
        search: async () => {
          calls += 1;
          return { hasMore: false, results: [result] };
        },
      },
      resultsPerQuery: 3,
      requestLimit: 1,
    });
    await expect(verifier.verify([person, person])).resolves.toBe(true);
    expect(calls).toBe(1);
    await expect(
      verifier.verify([person, { ...person, profileUrl: "https://example.test/another" }]),
    ).resolves.toBe(false);
    expect(calls).toBe(1);
  });
});

it("passes cancellation to search and does not start a cancelled lookup", async () => {
  const controller = new AbortController();
  const requests: WebSearchRequest[] = [];
  const verifier = createPublicPersonEvidenceVerifier({
    search: {
      search: async (request) => {
        requests.push(request);
        return { hasMore: false, results: [result] };
      },
    },
    resultsPerQuery: 3,
    requestLimit: 2,
  });
  await expect(verifier.verify([person], controller.signal)).resolves.toBe(true);
  expect(requests[0]?.signal).toBe(controller.signal);
  controller.abort();
  await expect(verifier.verify([person], controller.signal)).rejects.toThrow();
  expect(requests).toHaveLength(1);
});
