export type QuerySource = {
  readonly atsType: string;
  readonly pattern: string;
};

export type PlannedSearchQuery = {
  readonly atsType: string;
  readonly sourcePattern: string;
  readonly titleTerm: string;
  readonly text: string;
};

export type SearchQueryCriteria = {
  readonly titleTerms: readonly string[];
  readonly locationTerms: readonly string[];
  readonly includeRemote: boolean;
};

export const BOARD_DISCOVERY_TITLE = "Board discovery";
export const WORLDWIDE_REMOTE_TITLE_SUFFIX = " (worldwide remote)";

export function planSearchQueries(
  criteria: SearchQueryCriteria,
  sources: readonly QuerySource[],
  titleSearchMode: "title" | "anywhere",
  worldwideRemoteTerms: readonly string[],
): PlannedSearchQuery[] {
  const titles = uniqueTerms(criteria.titleTerms);
  const locations = uniqueTerms(criteria.locationTerms);

  if (titles.length === 0 || locations.length === 0) {
    return [];
  }

  const locationClause = orClause(locations);
  const remoteClause = orClause(uniqueTerms(worldwideRemoteTerms));

  return sources.flatMap((source) =>
    titles.flatMap((titleTerm) => {
      const titleSearch = titleClause(titleTerm, titleSearchMode);
      const queries: PlannedSearchQuery[] = [
        {
          atsType: source.atsType,
          sourcePattern: source.pattern,
          titleTerm,
          text: `site:${source.pattern} ${titleSearch} ${locationClause}`,
        },
      ];
      if (criteria.includeRemote) {
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

export function planBoardDiscoveryQueries(
  criteria: Pick<SearchQueryCriteria, "locationTerms">,
  sources: readonly QuerySource[],
): PlannedSearchQuery[] {
  const locations = uniqueTerms(criteria.locationTerms);
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

function orClause(terms: readonly string[], prefix = ""): string {
  return `(${terms.map((term) => `${prefix}"${term.replaceAll('"', "")}"`).join(" OR ")})`;
}

function uniqueTerms(terms: readonly string[]): string[] {
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
}
