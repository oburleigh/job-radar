import { endpoint } from "@/contexts/discovery/adapters/driven/configuration/job-radar-config";
import type { RawJob } from "@/contexts/discovery/adapters/driven/job-sources/ats-integration";

import { type BoardConnector, lastPathPart, rawJob, requestText, stripHtml } from "./shared";

export const fetchJobvite: BoardConnector = async (board, limit, fetcher) => {
  const html = await requestText(endpoint("jobvite", "jobs", { slug: board.slug }), fetcher);
  const results: RawJob[] = [];
  const sectionPattern =
    /<h3\b[^>]*class=["'][^"']*\bh2\b[^"']*["'][^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3\b|$)/gi;
  const sections = [...html.matchAll(sectionPattern)];
  const searchableSections =
    sections.length > 0
      ? sections.map((section) => ({
          department: stripHtml(section[1] ?? ""),
          html: section[2] ?? "",
        }))
      : [{ department: "", html }];

  for (const section of searchableSections) {
    const jobPattern =
      /<a\b[^>]*class=["'][^"']*\bjv-job-name\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of section.html.matchAll(jobPattern)) {
      const href = match[1] ?? "";
      const content = match[2] ?? "";
      const locationMatch = content.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i);
      const location = stripHtml(locationMatch?.[1] ?? "");
      const title = stripHtml(content.replace(/<span\b[^>]*>[\s\S]*?<\/span>/gi, ""));
      const canonicalUrl = new URL(href, board.baseUrl).toString();
      const externalId = lastPathPart(canonicalUrl);
      if (!externalId || !title) {
        continue;
      }
      results.push(
        rawJob(
          "jobvite",
          board,
          {
            source: "jobvite-public-careers-page",
            department: section.department,
            href,
          },
          {
            externalId,
            canonicalUrl,
            applyUrl: canonicalUrl,
            title,
            locations: [location].filter(Boolean),
            description: section.department,
            department: section.department,
            workplaceType: location.toLowerCase().includes("remote") ? "remote" : "",
          },
        ),
      );
      if (results.length >= limit) {
        return results;
      }
    }
  }

  return results;
};
