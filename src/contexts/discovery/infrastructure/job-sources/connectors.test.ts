import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BoardInput } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import { fetchBoardJobs, fetchBoardJobsWithDiagnostics } from "./connectors";

const greenhouseBoard: BoardInput = {
  id: 1,
  atsType: "greenhouse",
  canonicalKey: "greenhouse:acme",
  companyName: "Acme",
  slug: "acme",
  baseUrl: "https://boards.greenhouse.io/acme",
  config: {},
};

describe("ATS connectors", () => {
  it("rejects a malformed vendor response at the connector boundary", async () => {
    await expect(
      fetchBoardJobs(greenhouseBoard, {
        fetcher: async () => Response.json({ results: [] }),
      }),
    ).rejects.toThrow("Greenhouse returned an invalid response");
  });

  it("reports JSON connector HTTP failures", async () => {
    await expect(
      fetchBoardJobs(greenhouseBoard, {
        fetcher: async () => new Response("unavailable", { status: 503 }),
      }),
    ).rejects.toThrow("ATS request returned HTTP 503");
  });

  it("reports HTML connector HTTP failures", async () => {
    await expect(
      fetchBoardJobs(board("jobvite", "https://jobs.jobvite.com/acme"), {
        fetcher: async () => new Response("unavailable", { status: 502 }),
      }),
    ).rejects.toThrow("ATS request returned HTTP 502");
  });

  it("normalizes a Greenhouse response", async () => {
    const fetcher = async () =>
      Response.json({
        jobs: [
          {
            id: 123,
            internal_job_id: null,
            title: "Head of Engineering",
            company_name: "Acme",
            absolute_url: "https://boards.greenhouse.io/acme/jobs/123",
            location: { name: "Dubai" },
            content: "<p>Lead the engineering team.</p>",
            departments: [{ name: "Engineering" }],
            first_published: "2026-07-20T00:00:00Z",
          },
        ],
      });

    const result = await fetchBoardJobs(greenhouseBoard, {
      fetcher,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      atsType: "greenhouse",
      externalId: "123",
      title: "Head of Engineering",
      companyName: "Acme",
      locations: ["Dubai"],
      description: "Lead the engineering team.",
      department: "Engineering",
    });
  });

  it("omits a Greenhouse job without a usable identifier", async () => {
    const result = await fetchBoardJobs(greenhouseBoard, {
      fetcher: async () =>
        Response.json({
          jobs: [
            {
              internal_job_id: null,
              title: "Head of Engineering",
            },
          ],
        }),
    });

    expect(result).toEqual([]);
  });

  it("uses a Greenhouse internal identifier when the public identifier is absent", async () => {
    const result = await fetchBoardJobs(greenhouseBoard, {
      fetcher: async () =>
        Response.json({
          jobs: [
            {
              internal_job_id: 456,
              title: "Head of Engineering",
            },
          ],
        }),
    });

    expect(result[0]).toMatchObject({
      externalId: "456",
      canonicalUrl: "https://boards.greenhouse.io/acme/jobs/456",
    });
  });

  it("normalizes an Ashby response", async () => {
    const result = await fetchBoardJobs(board("ashby", "https://jobs.ashbyhq.com/acme"), {
      fetcher: async () =>
        Response.json({
          jobs: [
            {
              id: "ashby-1",
              title: "VP Engineering",
              location: "Dubai",
              jobUrl: "https://jobs.ashbyhq.com/acme/ashby-1",
              isListed: true,
              compensation: {
                summaryComponents: [
                  {
                    compensationType: "Salary",
                    interval: "1 YEAR",
                    currencyCode: "USD",
                    minValue: 180_000,
                    maxValue: 220_000,
                  },
                ],
              },
            },
          ],
        }),
    });

    expect(result[0]).toMatchObject({
      atsType: "ashby",
      externalId: "ashby-1",
      title: "VP Engineering",
      locations: ["Dubai"],
      publishedSalary: {
        currency: "USD",
        min: 180_000,
        max: 220_000,
      },
    });
  });

  it("preserves valid Ashby jobs and reports one malformed record", async () => {
    const result = await fetchBoardJobsWithDiagnostics(
      board("ashby", "https://jobs.ashbyhq.com/acme"),
      {
        fetcher: async () => Response.json(fixture("ashby-mixed-response.json")),
      },
    );

    expect(result.jobs.map((job) => job.externalId)).toEqual([
      "ashby-valid-remote",
      "ashby-valid-null-workplace",
    ]);
    expect(result.jobs[1]).toMatchObject({
      workplaceType: "",
      locations: [],
      publishedSalary: null,
    });
    expect(result).toMatchObject({ acceptedCount: 2, rejectedCount: 1 });
    expect(result.rejectedRecords).toEqual([
      {
        vendor: "Ashby",
        board: "ashby:acme",
        recordIdentity: "ashby-invalid-title",
        reason: expect.stringContaining("title"),
      },
    ]);
  });

  it("normalizes a Lever response", async () => {
    const result = await fetchBoardJobs(board("lever", "https://jobs.lever.co/acme"), {
      fetcher: async () =>
        Response.json([
          {
            id: "lever-1",
            text: "Engineering Director",
            hostedUrl: "https://jobs.lever.co/acme/lever-1",
            categories: { location: "London", department: "Engineering" },
          },
        ]),
    });

    expect(result[0]).toMatchObject({
      atsType: "lever",
      externalId: "lever-1",
      title: "Engineering Director",
      locations: ["London"],
      department: "Engineering",
    });
  });

  it("normalizes a BambooHR response", async () => {
    const result = await fetchBoardJobs(board("bamboohr", "https://acme.bamboohr.com/careers"), {
      fetcher: async () =>
        Response.json({
          result: [
            {
              id: "bamboo-1",
              jobOpeningName: "Head of Platform",
              location: { city: "Dubai", addressCountry: "AE" },
              departmentLabel: "Engineering",
            },
          ],
        }),
    });

    expect(result[0]).toMatchObject({
      atsType: "bamboohr",
      externalId: "bamboo-1",
      title: "Head of Platform",
      locations: ["Dubai, AE"],
      department: "Engineering",
    });
  });

  it("normalizes a Workable response", async () => {
    const result = await fetchBoardJobs(board("workable", "https://apply.workable.com/acme"), {
      fetcher: async () =>
        Response.json({
          jobs: [
            {
              shortcode: "workable-1",
              title: "Director of Engineering",
              url: "https://apply.workable.com/acme/j/workable-1",
              city: "Abu Dhabi",
              country: "AE",
            },
          ],
        }),
    });

    expect(result[0]).toMatchObject({
      atsType: "workable",
      externalId: "workable-1",
      title: "Director of Engineering",
      locations: ["Abu Dhabi, AE"],
    });
  });

  it("preserves valid Workable jobs and reports one malformed record", async () => {
    const result = await fetchBoardJobsWithDiagnostics(
      board("workable", "https://apply.workable.com/acme"),
      {
        fetcher: async () => Response.json(fixture("workable-mixed-response.json")),
      },
    );

    expect(result.jobs.map((job) => job.externalId)).toEqual([
      "workable-valid-null-fields",
      "workable-valid-new-fields",
    ]);
    expect(result.jobs).toMatchObject([
      { locations: ["Singapore"], workplaceType: "", department: "" },
      { locations: ["Tokyo, Japan"] },
    ]);
    expect(result).toMatchObject({ acceptedCount: 2, rejectedCount: 1 });
    expect(result.rejectedRecords).toEqual([
      {
        vendor: "Workable",
        board: "workable:acme",
        recordIdentity: "workable-invalid-title",
        reason: expect.stringContaining("title"),
      },
    ]);
  });

  it("quarantines otherwise valid records without a usable vendor identity", async () => {
    const ashby = await fetchBoardJobsWithDiagnostics(
      board("ashby", "https://jobs.ashbyhq.com/acme"),
      {
        fetcher: async () => Response.json({ jobs: [{ title: "Engineering Director" }] }),
      },
    );
    const workable = await fetchBoardJobsWithDiagnostics(
      board("workable", "https://apply.workable.com/acme"),
      {
        fetcher: async () => Response.json({ jobs: [{ title: "VP Engineering" }] }),
      },
    );

    expect(ashby).toMatchObject({ acceptedCount: 0, rejectedCount: 1 });
    expect(workable).toMatchObject({ acceptedCount: 0, rejectedCount: 1 });
    expect(ashby.rejectedRecords[0]).toMatchObject({
      vendor: "Ashby",
      board: "ashby:acme",
      reason: "record: missing a usable job identifier or URL",
    });
    expect(workable.rejectedRecords[0]).toMatchObject({
      vendor: "Workable",
      board: "workable:acme",
      reason: "record: missing a usable job identifier or URL",
    });
  });

  it("reports rejected records only from the requested ingestion window", async () => {
    const result = await fetchBoardJobsWithDiagnostics(
      board("ashby", "https://jobs.ashbyhq.com/acme"),
      {
        limit: 1,
        fetcher: async () =>
          Response.json({
            jobs: [
              {
                id: "within-limit",
                title: "Engineering Director",
                jobUrl: "https://jobs.ashbyhq.com/acme/within-limit",
              },
              {
                id: "outside-limit",
                title: null,
                jobUrl: "https://jobs.ashbyhq.com/acme/outside-limit",
              },
            ],
          }),
      },
    );

    expect(result).toMatchObject({ acceptedCount: 1, rejectedCount: 0 });
  });

  it("preserves URL-only Workable identity semantics", async () => {
    const canonicalUrl = "https://apply.workable.com/acme/j/url-only";
    const result = await fetchBoardJobs(board("workable", "https://apply.workable.com/acme"), {
      fetcher: async () =>
        Response.json({ jobs: [{ title: "VP Engineering", url: canonicalUrl }] }),
    });

    expect(result[0]).toMatchObject({ externalId: "", canonicalUrl });
  });

  it("uses the configured Workday endpoint and normalizes relative dates", async () => {
    let requestedUrl = "";
    const workdayBoard: BoardInput = {
      id: 2,
      atsType: "workday",
      canonicalKey: "workday:acme.wd5.myworkdayjobs.com:acme:external",
      companyName: "Acme",
      slug: "acme",
      baseUrl: "https://acme.wd5.myworkdayjobs.com/External",
      config: {
        host: "acme.wd5.myworkdayjobs.com",
        tenant: "acme",
        site: "External",
      },
    };
    const fetcher = async (input: string | URL | Request) => {
      requestedUrl = String(input);
      return Response.json({
        jobPostings: [
          {
            title: "Director of Engineering",
            externalPath: "/job/Dubai/Director_R-9",
            locationsText: "Dubai",
            postedOn: "Posted yesterday",
          },
        ],
      });
    };

    const result = await fetchBoardJobs(workdayBoard, {
      fetcher,
      limit: 1,
    });

    expect(requestedUrl).toBe("https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External/jobs");
    expect(result[0]).toMatchObject({
      externalId: "Director_R-9",
      canonicalUrl: "https://acme.wd5.myworkdayjobs.com/External/job/Dubai/Director_R-9",
      title: "Director of Engineering",
      locations: ["Dubai"],
    });
    expect(result[0]?.publishedAt).toBeInstanceOf(Date);
  });

  it("treats Workday 30+ day labels as older than a 30 day profile", async () => {
    const workdayBoard: BoardInput = {
      id: 2,
      atsType: "workday",
      canonicalKey: "workday:acme.wd5.myworkdayjobs.com:acme:external",
      companyName: "Acme",
      slug: "acme",
      baseUrl: "https://acme.wd5.myworkdayjobs.com/External",
      config: {
        host: "acme.wd5.myworkdayjobs.com",
        tenant: "acme",
        site: "External",
      },
    };
    const result = await fetchBoardJobs(workdayBoard, {
      fetcher: async () =>
        Response.json({
          jobPostings: [
            {
              title: "Director of Engineering",
              externalPath: "/job/Dubai/Director_R-10",
              locationsText: "Dubai",
              postedOn: "Posted 30+ Days Ago",
            },
          ],
        }),
      limit: 1,
    });

    expect(result[0]?.publishedAt).toBeInstanceOf(Date);
    expect(Date.now() - (result[0]?.publishedAt?.getTime() ?? Date.now())).toBeGreaterThan(
      30 * 86_400_000,
    );
  });

  it("uses the public SmartRecruiters job page instead of its API ref", async () => {
    const result = await fetchBoardJobs(
      {
        id: 3,
        atsType: "smartrecruiters",
        canonicalKey: "smartrecruiters:acme",
        companyName: "Acme",
        slug: "Acme",
        baseUrl: "https://jobs.smartrecruiters.com/Acme",
        config: {},
      },
      {
        fetcher: async () =>
          Response.json({
            content: [
              {
                id: "744000139866919",
                name: "Engineering Director",
                ref: "https://api.smartrecruiters.com/v1/companies/Acme/postings/744000139866919",
                location: { city: "London", country: "gb" },
              },
            ],
          }),
        limit: 1,
      },
    );

    expect(result[0]?.canonicalUrl).toBe("https://jobs.smartrecruiters.com/Acme/744000139866919");
  });

  it("parses Jobvite's public view-all careers page", async () => {
    let requestedUrl = "";
    const result = await fetchBoardJobs(
      {
        id: 4,
        atsType: "jobvite",
        canonicalKey: "jobvite:acme",
        companyName: "Acme",
        slug: "acme",
        baseUrl: "https://jobs.jobvite.com/acme",
        config: {},
      },
      {
        fetcher: async (input) => {
          requestedUrl = String(input);
          return new Response(`
            <h3 class="h2">Engineering &amp; Technology</h3>
            <table class="jv-job-list">
              <a class="jv-job-name" href="/acme/job/abc123">
                Director of Engineering
                <span>Dubai, United Arab Emirates</span>
              </a>
            </table>
          `);
        },
      },
    );

    expect(requestedUrl).toBe("https://jobs.jobvite.com/acme/jobs/viewall");
    expect(result[0]).toMatchObject({
      atsType: "jobvite",
      externalId: "abc123",
      title: "Director of Engineering",
      companyName: "Acme",
      locations: ["Dubai, United Arab Emirates"],
      department: "Engineering & Technology",
      description: "Engineering & Technology",
      publishedAt: null,
    });
  });
});

function board(atsType: string, baseUrl: string): BoardInput {
  return {
    id: 10,
    atsType,
    canonicalKey: `${atsType}:acme`,
    companyName: "Acme",
    slug: "acme",
    baseUrl,
    config: {},
  };
}

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./test-fixtures/${name}`, import.meta.url), "utf8"),
  ) as unknown;
}
