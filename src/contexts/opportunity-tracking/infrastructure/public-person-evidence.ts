import type { RelationshipPlanPublicPerson } from "@/contexts/opportunity-tracking/application/relationship-plan-workflow";
import type { WebSearchClient } from "@/platform/search/web-search-client";

export function createPublicPersonEvidenceVerifier(input: {
  readonly search: WebSearchClient;
  readonly resultsPerQuery: number;
  readonly requestLimit: number;
}) {
  return {
    async verify(
      people: readonly RelationshipPlanPublicPerson[],
      signal?: AbortSignal,
    ): Promise<boolean> {
      signal?.throwIfAborted();
      const urls = new Set(
        people.flatMap((person) => [
          person.profileUrl,
          ...person.evidence.map((item) => item.sourceUrl),
        ]),
      );
      if (urls.size > input.requestLimit) return false;
      const sources = new Map<string, string>();
      for (const url of urls) {
        signal?.throwIfAborted();
        const page = await input.search.search({
          query: JSON.stringify(url),
          count: input.resultsPerQuery,
          page: 1,
          ...(signal ? { signal } : {}),
        });
        const result = page.results.find((item) => item.url === url);
        if (!result) return false;
        sources.set(url, `${result.title}\n${result.snippet}`);
      }
      return people.every((person) => {
        const profile = sources.get(person.profileUrl)?.toLocaleLowerCase();
        return (
          profile !== undefined &&
          [person.name, person.title, person.companyName].every((fact) =>
            profile.includes(fact.toLocaleLowerCase()),
          ) &&
          person.evidence.length > 0 &&
          person.evidence.every(
            (item) =>
              item.excerpt.trim().length > 0 && sources.get(item.sourceUrl)?.includes(item.excerpt),
          )
        );
      });
    },
  };
}
