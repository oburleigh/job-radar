import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { fetchStructuredJobPage } from "./structured-job-page";

const web3CareerActive = fixture("web3-career-active.html");
const cryptocurrencyJobsActive = fixture("cryptocurrency-jobs-active.html");
const cryptocurrencyJobsExpired = fixture("cryptocurrency-jobs-expired.html");
const cryptoJobsListProtected = fixture("cryptojobslist-protected.html");

describe("structured job-board page lookup", () => {
  it("normalizes the representative Web3 Career shape and falls back to its canonical URL", async () => {
    const canonicalUrl = "https://web3.career/platform-engineer-example-labs/153058";
    const lookup = await fetchStructuredJobPage(
      "web3-career",
      "153058",
      canonicalUrl,
      async () => new Response(web3CareerActive),
      new Date("2026-08-24T00:00:00Z"),
    );

    expect(lookup.status).toBe("verified");
    if (lookup.status !== "verified") {
      return;
    }
    expect(lookup.job).toMatchObject({
      atsType: "web3-career",
      externalId: "153058",
      canonicalUrl,
      applyUrl: canonicalUrl,
      title: "Platform Engineer",
      companyName: "Example Labs",
      locations: ["Anywhere", "Anywhere, United States"],
      workplaceType: "remote",
      employmentType: "Full-time",
      description: "Build and maintain the product.",
      evidence: "structured",
      rawPayload: expect.objectContaining({
        verifiedAt: "2026-08-24T00:00:00.000Z",
        verifiedSource: "schema.org/JobPosting",
      }),
    });
    expect(lookup.job.publishedAt?.toISOString()).toBe("2026-08-20T13:29:46.000Z");
  });

  it("normalizes the representative Cryptocurrency Jobs array and date shapes", async () => {
    const canonicalUrl = "https://cryptocurrencyjobs.co/engineering/example-protocol-engineer/";
    const lookup = await fetchStructuredJobPage(
      "cryptocurrencyjobs",
      "example-protocol-engineer",
      canonicalUrl,
      async () => new Response(cryptocurrencyJobsActive),
      new Date("2026-08-24T00:00:00Z"),
    );

    expect(lookup.status).toBe("verified");
    if (lookup.status !== "verified") {
      return;
    }
    expect(lookup.job).toMatchObject({
      atsType: "cryptocurrencyjobs",
      canonicalUrl,
      applyUrl: canonicalUrl,
      title: "Protocol Engineer",
      companyName: "Example Protocol",
      locations: ["Anywhere"],
      employmentType: "FULL_TIME",
      workplaceType: "remote",
    });
    expect(lookup.job.publishedAt?.toISOString()).toBe("2026-08-18T00:00:00.000Z");
  });

  it("rejects a listing after its structured expiry date", async () => {
    const lookup = await fetchStructuredJobPage(
      "cryptocurrencyjobs",
      "example-open-source-developer",
      "https://cryptocurrencyjobs.co/engineering/example-open-source-developer/",
      async () => new Response(cryptocurrencyJobsExpired),
      new Date("2026-08-24T00:00:00Z"),
    );

    expect(lookup).toEqual({ status: "closed", reason: "expired" });
  });

  it("keeps a listing active at the exact structured expiry instant", async () => {
    const lookup = await fetchStructuredJobPage(
      "cryptocurrencyjobs",
      "example-protocol-engineer",
      "https://cryptocurrencyjobs.co/engineering/example-protocol-engineer/",
      async () => new Response(cryptocurrencyJobsActive),
      new Date("2026-09-18T00:00:00Z"),
    );

    expect(lookup.status).toBe("verified");
  });

  it.each([401, 403, 429])("leaves a page protected by HTTP %i unverified", async (status) => {
    const lookup = await fetchStructuredJobPage(
      "cryptojobslist",
      "head-of-engineering-at-acme",
      "https://cryptojobslist.com/jobs/head-of-engineering-at-acme",
      async () => new Response(cryptoJobsListProtected, { status }),
    );

    expect(lookup).toEqual({ status: "unavailable", reason: "protected" });
  });

  it.each([404, 410])("marks an HTTP %i page as not found", async (status) => {
    const lookup = await fetchStructuredJobPage(
      "web3-career",
      "153058",
      "https://web3.career/platform-engineer-example-labs/153058",
      async () => new Response("", { status }),
    );

    expect(lookup).toEqual({ status: "not_found", reason: "not-found" });
  });

  it("treats other failed HTTP responses as request failures", async () => {
    const lookup = await fetchStructuredJobPage(
      "web3-career",
      "153058",
      "https://web3.career/platform-engineer-example-labs/153058",
      async () => new Response("", { status: 503 }),
    );

    expect(lookup).toEqual({ status: "unavailable", reason: "request-failed" });
  });

  it("retains an unstructured page as an explicitly unverified lead", async () => {
    const lookup = await fetchStructuredJobPage(
      "cryptojobslist",
      "head-of-engineering-at-acme",
      "https://cryptojobslist.com/jobs/head-of-engineering-at-acme",
      async () => new Response("<html><main>Head of Engineering at Acme</main></html>"),
    );

    expect(lookup).toEqual({ status: "unavailable", reason: "unstructured" });
  });

  it("closes an unstructured page that exposes a configured closed marker", async () => {
    const lookup = await fetchStructuredJobPage(
      "web3-career",
      "153058",
      "https://web3.career/platform-engineer-example-labs/153058",
      async () => new Response("<main>This job is no longer available.</main>"),
    );

    expect(lookup).toEqual({ status: "closed", reason: "closed-marker" });
  });

  it("closes a structured page with a current date when it exposes a closed marker", async () => {
    const lookup = await fetchStructuredJobPage(
      "web3-career",
      "153058",
      "https://web3.career/platform-engineer-example-labs/153058",
      async () =>
        new Response(
          web3CareerActive.replace(
            "</html>",
            "<main>This job is no longer available.</main></html>",
          ),
        ),
      new Date("2026-08-24T00:00:00Z"),
    );

    expect(lookup).toEqual({ status: "closed", reason: "closed-marker" });
  });

  it("does not label an on-site posting as remote", async () => {
    const lookup = await fetchStructuredJobPage(
      "web3-career",
      "on-site-platform-engineer",
      "https://web3.career/on-site-platform-engineer/153059",
      async () =>
        postingResponse({
          jobLocationType: ["ON_SITE", "HYBRID"],
          employmentType: ["FULL_TIME", "CONTRACTOR"],
        }),
    );

    expect(lookup.status).toBe("verified");
    if (lookup.status !== "verified") {
      return;
    }
    expect(lookup.job).toMatchObject({
      workplaceType: "",
      employmentType: "FULL_TIME, CONTRACTOR",
    });
  });

  it("uses Remote when a telecommute posting exposes no location objects", async () => {
    const lookup = await fetchStructuredJobPage(
      "web3-career",
      "remote-platform-engineer",
      "https://web3.career/remote-platform-engineer/153060",
      async () => postingResponse({ jobLocationType: ["ON_SITE", "TELECOMMUTE"] }),
    );

    expect(lookup.status).toBe("verified");
    if (lookup.status !== "verified") {
      return;
    }
    expect(lookup.job).toMatchObject({
      workplaceType: "remote",
      locations: ["Remote"],
    });
  });

  it("fails loudly when a recognized JobPosting loses a required field", async () => {
    await expect(
      fetchStructuredJobPage(
        "web3-career",
        "153058",
        "https://web3.career/platform-engineer-example-labs/153058",
        async () =>
          new Response(`
            <script type="application/ld+json">
              ${JSON.stringify({
                "@context": "https://schema.org",
                "@type": "JobPosting",
                title: "Platform Engineer",
                hiringOrganization: {},
              })}
            </script>
          `),
      ),
    ).rejects.toThrow(
      "Invalid schema.org JobPosting at https://web3.career/platform-engineer-example-labs/153058: missing hiringOrganization.name",
    );
  });

  it("names every missing required field in a malformed structured posting", async () => {
    await expect(
      fetchStructuredJobPage(
        "web3-career",
        "153058",
        "https://web3.career/platform-engineer-example-labs/153058",
        async () => postingResponse({ title: "", hiringOrganization: {} }),
      ),
    ).rejects.toThrow("missing title, hiringOrganization.name");
  });

  it("does not report a present company field as missing", async () => {
    await expect(
      fetchStructuredJobPage(
        "web3-career",
        "153058",
        "https://web3.career/platform-engineer-example-labs/153058",
        async () => postingResponse({ title: "" }),
      ),
    ).rejects.toThrow(/missing title$/);
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

    expect(lookup).toEqual({ status: "unavailable", reason: "request-failed" });
  });

  it("does not request a source that is not configured for structured verification", async () => {
    const lookup = await fetchStructuredJobPage(
      "greenhouse",
      "12345",
      "https://boards.greenhouse.io/example/jobs/12345",
      async () => {
        throw new Error("fetch should not be called");
      },
    );

    expect(lookup).toEqual({ status: "unavailable", reason: "unsupported-source" });
  });

  it("does not request a structured source without a job identifier", async () => {
    const lookup = await fetchStructuredJobPage(
      "web3-career",
      "",
      "https://web3.career/jobs",
      async () => {
        throw new Error("fetch should not be called");
      },
    );

    expect(lookup).toEqual({ status: "unavailable", reason: "missing-external-id" });
  });

  it("sends the configured HTML request contract to the source", async () => {
    let observedRequest:
      | { input: string | URL | Request; init: RequestInit | undefined }
      | undefined;
    await fetchStructuredJobPage(
      "web3-career",
      "153058",
      "https://web3.career/platform-engineer-example-labs/153058",
      async (input, init) => {
        observedRequest = { input, init };
        return new Response(web3CareerActive);
      },
    );

    expect(observedRequest).toMatchObject({
      input: "https://web3.career/platform-engineer-example-labs/153058",
      init: {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "JobRadar/1.0 (local application)",
        },
        signal: expect.any(AbortSignal),
      },
    });
  });
});

function fixture(name: string): string {
  return readFileSync(new URL(`./test-fixtures/${name}`, import.meta.url), "utf8");
}

function postingResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(`
    <script type="application/ld+json">
      ${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "JobPosting",
        title: "Platform Engineer",
        description: "Build and maintain the product.",
        datePosted: "2026-08-20T13:29:46+00:00",
        validThrough: "2026-11-18T13:29:46+00:00",
        employmentType: "FULL_TIME",
        hiringOrganization: {
          "@type": "Organization",
          name: "Example Labs",
        },
        ...overrides,
      })}
    </script>
  `);
}
