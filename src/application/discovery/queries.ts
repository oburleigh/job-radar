import type { AtsType, DiscoveryQuery, MatchProfile } from "./types";

export interface QuerySource {
  atsType: AtsType;
  pattern: string;
}

export const BOARD_DISCOVERY_TITLE = "Board discovery";
export const WORLDWIDE_REMOTE_TITLE_SUFFIX = " (worldwide remote)";

export function buildQueries(
  profile: Pick<MatchProfile, "titleTerms" | "locationTerms" | "includeRemote">,
  sources: readonly QuerySource[],
  titleSearchMode: "title" | "anywhere",
  worldwideRemoteTerms: readonly string[],
): DiscoveryQuery[] {
  const titles = uniqueTerms(profile.titleTerms);
  const locations = uniqueTerms(profile.locationTerms);

  if (titles.length === 0 || locations.length === 0) {
    return [];
  }

  const locationClause = orClause(locations);

  const remoteClause = orClause(uniqueTerms([...worldwideRemoteTerms]));

  return sources.flatMap((source) =>
    titles.flatMap((titleTerm) => {
      const titleSearch = titleClause(titleTerm, titleSearchMode);
      const queries: DiscoveryQuery[] = [
        {
          atsType: source.atsType,
          sourcePattern: source.pattern,
          titleTerm,
          text: `site:${source.pattern} ${titleSearch} ${locationClause}`,
        },
      ];
      if (profile.includeRemote) {
        queries.push({
          atsType: source.atsType,
          sourcePattern: source.pattern,
          titleTerm: `${titleTerm}${WORLDWIDE_REMOTE_TITLE_SUFFIX}`,
          text: `site:${source.pattern} ${titleSearch} ${remoteClause}`,
        });
      }
      return queries;
    }),
  );
}

export function buildBoardDiscoveryQueries(
  profile: Pick<MatchProfile, "locationTerms">,
  sources: readonly QuerySource[],
): DiscoveryQuery[] {
  const locations = uniqueTerms(profile.locationTerms);
  if (locations.length === 0) {
    return [];
  }
  const locationClause = orClause(locations);
  const uniqueSources = [
    ...new Map(sources.map((source) => [`${source.atsType}:${source.pattern}`, source])).values(),
  ];

  return uniqueSources.map((source) => ({
    atsType: source.atsType,
    sourcePattern: source.pattern,
    titleTerm: BOARD_DISCOVERY_TITLE,
    text: `site:${source.pattern} ${locationClause}`,
  }));
}

function titleClause(term: string, titleSearchMode: "title" | "anywhere"): string {
  if (titleSearchMode === "anywhere") {
    return orClause([term]);
  }
  const tokens = term.replaceAll('"', "").split(/\s+/).filter(Boolean);
  return `(${tokens.map((token) => `intitle:"${token}"`).join(" ")})`;
}

function orClause(terms: string[], prefix = ""): string {
  return `(${terms.map((term) => `${prefix}"${term.replaceAll('"', "")}"`).join(" OR ")})`;
}

function uniqueTerms(terms: string[]): string[] {
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
}
