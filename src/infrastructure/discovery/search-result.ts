import type { AtsType } from "@/application/discovery/types";

export interface NormalizedSearchResult {
  title: string;
  companyName: string;
  locationText: string;
  description: string;
}

export function normalizeSearchResult(
  atsType: AtsType,
  rawTitle: string,
  rawSnippet: string,
): NormalizedSearchResult {
  const title = cleanText(rawTitle);
  const description = cleanText(rawSnippet);

  if (atsType === "linkedin") {
    const match = title.match(/^(.*?) hiring (.+?) in (.+)$/i);
    if (match?.[1] && match[2] && match[3]) {
      return {
        title: match[2].trim(),
        companyName: match[1].trim(),
        locationText: match[3]
          .replace(/\s*\|\s*LinkedIn$/i, "")
          .replace(/\s*\.{3}$/, "")
          .trim(),
        description,
      };
    }
  }

  if (atsType === "smartrecruiters") {
    const match = title.match(/^(.*?) is looking for an? (.+) in (.+)$/i);
    if (match?.[1] && match[2] && match[3]) {
      return {
        title: match[2].trim(),
        companyName: match[1].trim(),
        locationText: match[3].trim(),
        description,
      };
    }
  }

  if (atsType === "greenhouse") {
    const match = title.match(/^Job Application for (.+?)(?: at (.+))?$/i);
    if (match?.[1]) {
      return {
        title: match[1].trim(),
        companyName: match[2]?.trim() ?? "",
        locationText: "",
        description,
      };
    }
  }

  if (atsType === "ashby") {
    return {
      title: title.replace(/\s+-\s+Jobs\s+-\s+Ashby$/i, "").trim(),
      companyName: "",
      locationText: "",
      description,
    };
  }

  return {
    title,
    companyName: "",
    locationText: "",
    description,
  };
}

export function inferLocationHint(
  locationTerms: string[],
  result: Pick<NormalizedSearchResult, "title" | "description">,
): string {
  const text = normalizeForMatching(`${result.title} ${result.description}`);
  return locationTerms.find((term) => text.includes(normalizeForMatching(term))) ?? "";
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatching(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
