import { describe, expect, it } from "vitest";
import type { BoardInput } from "@/application/discovery/types";
import { fetchBoardJobs } from "./connectors";

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
  it("normalizes a Greenhouse response", async () => {
    const fetcher = async () =>
      Response.json({
        jobs: [
          {
            id: 123,
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
