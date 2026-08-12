import { describe, expect, it } from "vitest";

import { canonicalizeUrl, classifyUrl, makeDedupeKey } from "./urls";

describe("ATS URL classification", () => {
  it("classifies a Greenhouse job and removes tracking parameters", () => {
    const result = classifyUrl("https://boards.greenhouse.io/acme/jobs/123?utm_source=test");

    expect(result).toMatchObject({
      atsType: "greenhouse",
      externalId: "123",
      canonicalUrl: "https://boards.greenhouse.io/acme/jobs/123",
      board: {
        canonicalKey: "greenhouse:acme",
        slug: "acme",
      },
    });
  });

  it("uses the employer slug from a Greenhouse embed application URL", () => {
    const result = classifyUrl(
      "https://boards.greenhouse.io/embed/job_app?for=hubspotjobs&token=6440813",
    );

    expect(result).toMatchObject({
      atsType: "greenhouse",
      board: {
        canonicalKey: "greenhouse:hubspotjobs",
        slug: "hubspotjobs",
      },
    });
  });

  it("extracts the Workday host, tenant, and career site", () => {
    const result = classifyUrl(
      "https://acme.wd5.myworkdayjobs.com/en-US/External/job/Dubai/Head-of-Engineering_R-42",
    );

    expect(result).toMatchObject({
      atsType: "workday",
      externalId: "Head-of-Engineering_R-42",
      board: {
        canonicalKey: "workday:acme.wd5.myworkdayjobs.com:acme:external",
        config: {
          host: "acme.wd5.myworkdayjobs.com",
          tenant: "acme",
          site: "External",
          dataCenter: "wd5",
        },
      },
    });
  });

  it("skips a language-only Workday path before the career site", () => {
    const result = classifyUrl(
      "https://pfizer.wd1.myworkdayjobs.com/es/PfizerCareers/job/Dubai/Director_R-8",
    );

    expect(result?.board).toMatchObject({
      canonicalKey: "workday:pfizer.wd1.myworkdayjobs.com:pfizer:pfizercareers",
      config: {
        tenant: "pfizer",
        site: "PfizerCareers",
      },
    });
  });

  it("classifies LinkedIn as a job without a direct board", () => {
    const result = classifyUrl(
      "https://www.linkedin.com/jobs/view/head-of-engineering-at-acme-41000234/?trackingId=x",
    );

    expect(result?.atsType).toBe("linkedin");
    expect(result?.externalId).toBe("41000234");
    expect(result?.board).toBeNull();
  });

  it.each([
    ["https://web3.career/head-of-engineering-acme/147252", "web3-career", "147252"],
    [
      "https://cryptocurrencyjobs.co/engineering/acme-head-of-engineering/",
      "cryptocurrencyjobs",
      "acme-head-of-engineering",
    ],
    [
      "https://cryptojobslist.com/jobs/head-of-engineering-at-acme",
      "cryptojobslist",
      "head-of-engineering-at-acme",
    ],
  ])("classifies the seeded crypto job source %s", (url, atsType, externalId) => {
    expect(classifyUrl(url)).toMatchObject({
      atsType,
      externalId,
      board: null,
    });
  });

  it("classifies regional LinkedIn job URLs using their final numeric id", () => {
    const result = classifyUrl(
      "https://uk.linkedin.com/jobs/view/12-month-vp-engineering-at-acme-41000234",
    );

    expect(result?.atsType).toBe("linkedin");
    expect(result?.externalId).toBe("41000234");
  });

  it("extracts the numeric SmartRecruiters id before its title slug", () => {
    const result = classifyUrl(
      "https://jobs.smartrecruiters.com/Acme/744000136437109-director-of-engineering",
    );

    expect(result?.externalId).toBe("744000136437109");
  });

  it("keeps Greenhouse identity parameters and drops the rest", () => {
    expect(
      canonicalizeUrl(
        "https://boards.greenhouse.io/embed/job_app?token=x&gh_jid=123&utm_campaign=y",
      ),
    ).toBe("https://boards.greenhouse.io/embed/job_app?gh_jid=123");
  });

  it("builds stable deduplication keys", () => {
    expect(
      makeDedupeKey(
        "ashby",
        "https://jobs.ashbyhq.com/acme/abc?source=linkedin",
        "abc",
        "ashby:acme",
      ),
    ).toBe(makeDedupeKey("ashby", "https://jobs.ashbyhq.com/acme/abc", "abc", "ashby:acme"));
  });

  it("deduplicates regional LinkedIn URLs by the global job id", () => {
    expect(
      makeDedupeKey(
        "linkedin",
        "https://uk.linkedin.com/jobs/view/vp-engineering-at-acme-41000234",
        "41000234",
      ),
    ).toBe(
      makeDedupeKey(
        "linkedin",
        "https://www.linkedin.com/jobs/view/vp-engineering-at-acme-41000234",
        "41000234",
      ),
    );
  });
});
