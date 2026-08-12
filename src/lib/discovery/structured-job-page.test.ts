import { describe, expect, it } from "vitest";

import { fetchStructuredJobPage } from "./structured-job-page";

const activePosting = {
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  title: "Head of Engineering",
  description: "<p>Lead the software engineering function. Work from anywhere.</p>",
  datePosted: "2026-07-20T00:00:00Z",
  validThrough: "2026-09-30T00:00:00Z",
  employmentType: "FULL_TIME",
  jobLocationType: "TELECOMMUTE",
  applicantLocationRequirements: {
    "@type": "Country",
    name: "Worldwide",
  },
  hiringOrganization: {
    "@type": "Organization",
    name: "Acme",
  },
};

describe("structured job-board page lookup", () => {
  it("normalizes an active schema.org JobPosting", async () => {
    const lookup = await fetchStructuredJobPage(
      "web3-career",
      "147252",
      "https://web3.career/head-of-engineering/147252",
      async () =>
        new Response(`
          <html>
            <script type="application/ld+json">
              ${JSON.stringify(activePosting)}
            </script>
          </html>
        `),
      new Date("2026-08-08T00:00:00Z"),
    );

    expect(lookup.status).toBe("verified");
    if (lookup.status !== "verified") {
      return;
    }
    expect(lookup.job).toMatchObject({
      atsType: "web3-career",
      externalId: "147252",
      title: "Head of Engineering",
      companyName: "Acme",
      locations: ["Worldwide"],
      workplaceType: "remote",
      employmentType: "FULL_TIME",
      description: "Lead the software engineering function. Work from anywhere.",
    });
    expect(lookup.job.publishedAt?.toISOString()).toBe("2026-07-20T00:00:00.000Z");
  });

  it("rejects a listing after its structured expiry date", async () => {
    const lookup = await fetchStructuredJobPage(
      "cryptocurrencyjobs",
      "acme-head-of-engineering",
      "https://cryptocurrencyjobs.co/engineering/acme-head-of-engineering/",
      async () =>
        new Response(`
          <script type=application/ld+json>
            ${JSON.stringify({
              ...activePosting,
              validThrough: "2026-08-01T00:00:00Z",
            })}
          </script>
        `),
      new Date("2026-08-08T00:00:00Z"),
    );

    expect(lookup).toEqual({ status: "closed" });
  });

  it("leaves a protected page unverified", async () => {
    const lookup = await fetchStructuredJobPage(
      "cryptojobslist",
      "head-of-engineering-at-acme",
      "https://cryptojobslist.com/jobs/head-of-engineering-at-acme",
      async () => new Response("challenge", { status: 403 }),
    );

    expect(lookup).toEqual({ status: "unavailable" });
  });

  it("does not fail discovery when a source page times out", async () => {
    const lookup = await fetchStructuredJobPage(
      "web3-career",
      "147252",
      "https://web3.career/head-of-engineering/147252",
      async () => {
        throw new Error("request timed out");
      },
    );

    expect(lookup).toEqual({ status: "unavailable" });
  });
});
