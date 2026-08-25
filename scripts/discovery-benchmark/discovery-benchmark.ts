import type { AtsType } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";

export type DiscoveryBenchmarkMarket = "UK" | "UAE" | "Asia";
export type DiscoveryBenchmarkTrack = "leadership" | "individual-contributor";
export type DiscoveryBenchmarkVerification = "verified" | "unverified" | "inactive";
export type DiscoveryBenchmarkMatch = "matched" | "excluded" | "not-evaluated";
type MissStage = "provider" | "classification" | "verification" | "matching" | "presentation";

export interface DiscoveryBenchmarkProfileDefinition {
  readonly name: string;
  readonly market: DiscoveryBenchmarkMarket;
  readonly track: DiscoveryBenchmarkTrack;
}

export interface DiscoveryBenchmarkObservation {
  readonly id: string;
  readonly profile: string;
  readonly market: DiscoveryBenchmarkMarket;
  readonly track: DiscoveryBenchmarkTrack;
  readonly source: AtsType;
  readonly expectedVerification: DiscoveryBenchmarkVerification;
  readonly expectedMatch: DiscoveryBenchmarkMatch;
  readonly expectedVisible: boolean;
  readonly retrieved: boolean;
  readonly classified: boolean;
  readonly verification: DiscoveryBenchmarkVerification;
  readonly match: DiscoveryBenchmarkMatch;
  readonly visibleRank: number | null;
}

const requiredMarkets: readonly DiscoveryBenchmarkMarket[] = ["UK", "UAE", "Asia"];
const requiredTracks: readonly DiscoveryBenchmarkTrack[] = ["individual-contributor", "leadership"];
const targets = { recall: 0.9, top20Precision: 0.8 };

export function createDiscoveryBenchmarkReport(
  profileDefinitions: readonly DiscoveryBenchmarkProfileDefinition[],
  observations: readonly DiscoveryBenchmarkObservation[],
) {
  const profiles = profileDefinitions.map((profileDefinition) => {
    const profileObservations = observations.filter(
      (observation) => observation.profile === profileDefinition.name,
    );
    const expectedPositives = profileObservations.filter(
      (observation) => observation.expectedVisible,
    );
    const visiblePositives = expectedPositives.filter(
      (observation) => observation.visibleRank !== null,
    );
    const topTwenty = profileObservations.filter(
      (observation) => observation.visibleRank !== null && observation.visibleRank <= 20,
    );
    const positiveTopTwenty = topTwenty.filter((observation) => observation.expectedVisible);
    const recall = ratio(visiblePositives.length, expectedPositives.length);
    const top20Precision = ratio(positiveTopTwenty.length, topTwenty.length);

    return {
      profile: profileDefinition.name,
      market: profileDefinition.market,
      track: profileDefinition.track,
      expectedPositives: expectedPositives.length,
      visiblePositives: visiblePositives.length,
      recall,
      top20Results: topTwenty.length,
      relevantTop20Results: positiveTopTwenty.length,
      top20Precision,
      targetsMet: recall >= targets.recall && top20Precision >= targets.top20Precision,
    };
  });
  const misses = {
    provider: [] as string[],
    classification: [] as string[],
    verification: [] as string[],
    matching: [] as string[],
    presentation: [] as string[],
  };
  const stageMismatches = observations.flatMap((observation) => {
    const stage = firstUnexpectedStage(observation);
    return stage ? [{ observation, stage }] : [];
  });
  for (const { observation, stage } of stageMismatches) {
    misses[stage].push(observation.id);
  }
  const negativeAdmissions = observations
    .filter((observation) => !observation.expectedVisible && observation.visibleRank !== null)
    .map((observation) => observation.id);
  const markets = requiredMarkets.filter((market) =>
    profileDefinitions.some((profile) => profile.market === market),
  );
  const tracks = requiredTracks.filter((track) =>
    profileDefinitions.some((profile) => profile.track === track),
  );
  const coverage = {
    markets,
    tracks,
    missingMarkets: requiredMarkets.filter((market) => !markets.includes(market)),
    missingTracks: requiredTracks.filter((track) => !tracks.includes(track)),
  };
  const profileTargetsMet = profiles.every((profile) => profile.targetsMet);

  return {
    targets,
    coverage,
    profiles,
    observations,
    misses,
    negativeAdmissions,
    passed:
      coverage.missingMarkets.length === 0 &&
      coverage.missingTracks.length === 0 &&
      stageMismatches.length === 0 &&
      profileTargetsMet,
  };
}

function firstUnexpectedStage(observation: DiscoveryBenchmarkObservation): MissStage | null {
  if (!observation.retrieved) {
    return "provider";
  }
  if (!observation.classified) {
    return "classification";
  }
  if (observation.verification !== observation.expectedVerification) {
    return "verification";
  }
  if (observation.match !== observation.expectedMatch) {
    return "matching";
  }
  return (observation.visibleRank !== null) !== observation.expectedVisible ? "presentation" : null;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
