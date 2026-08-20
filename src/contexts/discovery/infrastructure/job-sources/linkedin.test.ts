import { describe, expect, it } from "vitest";

import { fetchLinkedInJob } from "./linkedin";

const html = `
  <h2 class="top-card-layout__title">Head of Engineering &amp; AI</h2>
  <a class="topcard__org-name-link">Acme</a>
  <span class="topcard__flavor topcard__flavor--bullet">
    Dubai, United Arab Emirates
  </span>
  <span class="posted-time-ago__text topcard__flavor--metadata">
    2 days ago
  </span>
  <div class="show-more-less-html__markup">
    <strong>Lead</strong> the engineering team.
  </div>
`;

describe("LinkedIn live listing lookup", () => {
  it("normalizes a live public job page", async () => {
    const now = new Date("2026-07-29T12:00:00Z");
    const lookup = await fetchLinkedInJob(
      "4445138716",
      "https://www.linkedin.com/jobs/view/4445138716",
      async () => new Response(html),
      now,
    );

    expect(lookup.status).toBe("verified");
    if (lookup.status !== "verified") {
      return;
    }
    expect(lookup.job).toMatchObject({
      title: "Head of Engineering & AI",
      companyName: "Acme",
      locations: ["Dubai, United Arab Emirates"],
      description: "Lead the engineering team.",
    });
    expect(lookup.job.publishedAt?.toISOString()).toBe("2026-07-27T12:00:00.000Z");
  });

  it("marks a removed listing as not found", async () => {
    const lookup = await fetchLinkedInJob(
      "123",
      "https://www.linkedin.com/jobs/view/123",
      async () => new Response("", { status: 404 }),
    );

    expect(lookup).toEqual({ status: "not_found" });
  });

  it("marks a listing that no longer accepts applications as closed", async () => {
    const lookup = await fetchLinkedInJob(
      "2172548204",
      "https://www.linkedin.com/jobs/view/2172548204",
      async () =>
        new Response(`
          ${html}
          <figcaption class="closed-job__flavor--closed">
            No longer accepting applications
          </figcaption>
        `),
    );

    expect(lookup).toEqual({ status: "closed" });
  });

  it("normalizes year-old listings so profile age filtering can reject them", async () => {
    const lookup = await fetchLinkedInJob(
      "123",
      "https://www.linkedin.com/jobs/view/123",
      async () => new Response(html.replace("2 days ago", "1 year ago")),
      new Date("2026-07-29T12:00:00Z"),
    );

    expect(lookup.status === "verified" ? lookup.job.publishedAt?.toISOString() : null).toBe(
      "2025-07-29T12:00:00.000Z",
    );
  });
});
