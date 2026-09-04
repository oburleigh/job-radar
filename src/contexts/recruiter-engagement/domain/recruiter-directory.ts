import type { ResearchObservation } from "./observation";
import type { SearchBrief } from "./research-run";

export type RecruitmentFirm = {
  readonly id: string;
  readonly firstObservedAt: Date;
  readonly lastObservedAt: Date;
  readonly mergedInto: string | null;
  readonly name: string;
  readonly websiteUrl: string;
};

export type Recruiter = {
  readonly companyName: string;
  readonly firmId: string | null;
  readonly firstObservedAt: Date;
  readonly id: string;
  readonly lastObservedAt: Date;
  readonly profileUrl: string;
  readonly mergedInto: string | null;
  readonly name: string;
  readonly title: string;
  readonly workEmail: string | null;
};

export type DirectoryEvidence = {
  readonly id: string;
  readonly observation: ResearchObservation;
  readonly recordId: string;
  readonly runIds: readonly string[];
};

export type DirectoryIdentityReview = {
  readonly candidateRecordId: string;
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
  readonly id: string;
  readonly kind: "firm" | "recruiter";
  readonly primaryRecordId: string;
  readonly reason: string;
  readonly status: "pending" | "merged" | "kept-separate";
};

export type DirectoryCorrection = {
  readonly correctedAt: Date;
  readonly field: "name" | "title" | "companyName" | "workEmail";
  readonly kind: "firm" | "recruiter";
  readonly previousValue: string | null;
  readonly recordId: string;
  readonly value: string;
};

export type DirectoryRemoval = {
  readonly kind: "firm" | "recruiter";
  readonly recordId: string;
  readonly removedAt: Date;
  /** The firm whose removal took this recruiter with it, so restoring that firm restores it too. */
  readonly removedWithFirmId: string | null;
};

export type RecruiterDirectory = {
  readonly corrections: readonly DirectoryCorrection[];
  readonly evidence: readonly DirectoryEvidence[];
  readonly firms: readonly RecruitmentFirm[];
  readonly identityReviews: readonly DirectoryIdentityReview[];
  readonly recruiters: readonly Recruiter[];
  readonly removals: readonly DirectoryRemoval[];
};

export type DirectoryMatchWeights = {
  readonly currentMandatesOrActivity: number;
  readonly evidenceFreshnessAndQuality: number;
  readonly namedRecruiterOrTeamEvidence: number;
  readonly recruiterRoleAndSeniority: number;
  readonly scaleOrTrackRecord: number;
  readonly specialism: number;
  readonly targetMarketOperatingDepth: number;
};

export type DirectoryRankingFactor = keyof DirectoryMatchWeights;

export type RankingContribution = {
  readonly factor: DirectoryRankingFactor;
  readonly points: number;
  readonly reason: string;
};

export type FirmQualification = {
  readonly qualified: boolean;
  readonly reasons: readonly string[];
  readonly unavailableFactors: readonly string[];
};

export type DirectoryConflict = {
  readonly field: string;
  readonly values: readonly string[];
};

export type RankedRecruiter = Recruiter & {
  readonly conflicts: readonly DirectoryConflict[];
  readonly evidence: readonly DirectoryEvidence[];
  readonly matchReasons: readonly string[];
  readonly rankingContributions: readonly RankingContribution[];
  readonly removed: boolean;
  readonly score: number;
  readonly unavailableFactors: readonly string[];
};

export type RankedFirm = RecruitmentFirm & {
  readonly conflicts: readonly DirectoryConflict[];
  readonly evidence: readonly DirectoryEvidence[];
  readonly matchReasons: readonly string[];
  readonly qualification: FirmQualification;
  readonly rankingContributions: readonly RankingContribution[];
  readonly recruiters: readonly RankedRecruiter[];
  readonly removed: boolean;
  readonly score: number;
  readonly unavailableFactors: readonly string[];
};

export type RankedRecruiterDirectory = {
  readonly firms: readonly RankedFirm[];
  readonly identityReviews: readonly DirectoryIdentityReview[];
  readonly unassociatedRecruiters: readonly RankedRecruiter[];
};

export function createEmptyRecruiterDirectory(): RecruiterDirectory {
  return {
    corrections: [],
    evidence: [],
    firms: [],
    identityReviews: [],
    recruiters: [],
    removals: [],
  };
}

export function removeDirectoryRecord(
  directory: RecruiterDirectory,
  command: {
    readonly cascadeRecruiters?: boolean;
    readonly kind: "firm" | "recruiter";
    readonly recordId: string;
    readonly removedAt: Date;
  },
): RecruiterDirectory {
  if (isDirectoryRecordRemoved(directory, command.kind, command.recordId)) {
    return directory;
  }
  const removals: DirectoryRemoval[] = [
    {
      kind: command.kind,
      recordId: command.recordId,
      removedAt: command.removedAt,
      removedWithFirmId: null,
    },
  ];
  if (command.kind === "firm" && command.cascadeRecruiters) {
    for (const recruiter of recruitersAtFirm(directory, command.recordId)) {
      if (isDirectoryRecordRemoved(directory, "recruiter", recruiter.id)) {
        continue;
      }
      removals.push({
        kind: "recruiter",
        recordId: recruiter.id,
        removedAt: command.removedAt,
        removedWithFirmId: command.recordId,
      });
    }
  }
  return { ...directory, removals: [...directory.removals, ...removals] };
}

export function restoreDirectoryRecord(
  directory: RecruiterDirectory,
  command: { readonly kind: "firm" | "recruiter"; readonly recordId: string },
): RecruiterDirectory {
  return {
    ...directory,
    removals: directory.removals.filter(
      (removal) =>
        !(removal.kind === command.kind && removal.recordId === command.recordId) &&
        !(command.kind === "firm" && removal.removedWithFirmId === command.recordId),
    ),
  };
}

export function isDirectoryRecordRemoved(
  directory: RecruiterDirectory,
  kind: "firm" | "recruiter",
  recordId: string,
): boolean {
  return directory.removals.some(
    (removal) => removal.kind === kind && removal.recordId === recordId,
  );
}

function recruitersAtFirm(directory: RecruiterDirectory, firmId: string): readonly Recruiter[] {
  return directory.recruiters.filter(
    (recruiter) =>
      recruiter.mergedInto === null &&
      recruiter.firmId !== null &&
      resolveFirmId(directory, recruiter.firmId) === firmId,
  );
}

export function reconcileRecruiterDirectory(
  directory: RecruiterDirectory,
  command: {
    readonly observations: readonly ResearchObservation[];
    readonly recordedAt: Date;
    readonly runId: string;
  },
): RecruiterDirectory {
  return command.observations.reduce(
    (current, observation) =>
      observation.kind === "firm"
        ? reconcileFirm(current, observation, command)
        : reconcileRecruiter(current, observation, command),
    directory,
  );
}

export function resolveIdentityReview(
  directory: RecruiterDirectory,
  command: {
    readonly decision: "merge" | "keep-separate";
    readonly decidedAt: Date;
    readonly reviewId: string;
  },
): RecruiterDirectory {
  const review = directory.identityReviews.find((item) => item.id === command.reviewId);
  if (!review) {
    throw new Error(`Identity review ${command.reviewId} does not exist.`);
  }
  if (review.status !== "pending") {
    return directory;
  }

  const status: DirectoryIdentityReview["status"] =
    command.decision === "merge" ? "merged" : "kept-separate";
  const identityReviews = directory.identityReviews.map((item) =>
    item.id === review.id ? { ...item, decidedAt: command.decidedAt, status } : item,
  );
  if (command.decision === "keep-separate") {
    return { ...directory, identityReviews };
  }

  if (review.kind === "firm") {
    requireFirm(directory, review.primaryRecordId);
    requireFirm(directory, review.candidateRecordId);
    return {
      ...directory,
      firms: directory.firms.map((firm) =>
        firm.id === review.candidateRecordId
          ? { ...firm, mergedInto: review.primaryRecordId }
          : firm,
      ),
      identityReviews,
    };
  }

  requireRecruiter(directory, review.primaryRecordId);
  requireRecruiter(directory, review.candidateRecordId);
  return {
    ...directory,
    identityReviews,
    recruiters: directory.recruiters.map((recruiter) =>
      recruiter.id === review.candidateRecordId
        ? { ...recruiter, mergedInto: review.primaryRecordId }
        : recruiter,
    ),
  };
}

export function correctDirectoryFact(
  directory: RecruiterDirectory,
  command: {
    readonly correctedAt: Date;
    readonly field: DirectoryCorrection["field"];
    readonly kind: DirectoryCorrection["kind"];
    readonly recordId: string;
    readonly value: string;
  },
): RecruiterDirectory {
  const value =
    command.field === "workEmail" ? normaliseWorkEmail(command.value) : command.value.trim();
  if (!value) {
    throw new Error("A corrected directory value cannot be empty.");
  }

  if (command.kind === "firm") {
    if (command.field !== "name") {
      throw new Error(`${command.field} is not a recruitment firm field.`);
    }
    const firm = requireFirm(directory, command.recordId);
    const previousValue = firm.name;
    if (previousValue === value) {
      return directory;
    }
    return {
      ...directory,
      corrections: [...directory.corrections, { ...command, previousValue, value }],
      firms: directory.firms.map((item) => (item.id === firm.id ? { ...item, name: value } : item)),
    };
  }

  if (!(["name", "title", "companyName", "workEmail"] as const).includes(command.field)) {
    throw new Error(`${command.field} is not a recruiter field.`);
  }
  const recruiter = requireRecruiter(directory, command.recordId);
  const field = command.field;
  const previousValue = recruiter[field];
  if (previousValue === value) {
    return directory;
  }
  return {
    ...directory,
    corrections: [...directory.corrections, { ...command, previousValue, value }],
    recruiters: directory.recruiters.map((item) =>
      item.id === recruiter.id ? { ...item, [field]: value } : item,
    ),
  };
}

export function rankRecruiterDirectory(
  directory: RecruiterDirectory,
  command: {
    readonly asOf: Date;
    readonly brief: SearchBrief;
    readonly includeRemoved?: boolean;
    readonly weights: DirectoryMatchWeights;
  },
): RankedRecruiterDirectory {
  const keep = (kind: "firm" | "recruiter", recordId: string) =>
    command.includeRemoved === true || !isDirectoryRecordRemoved(directory, kind, recordId);
  const firms = directory.firms
    .filter((firm) => firm.mergedInto === null && keep("firm", firm.id))
    .map((firm): RankedFirm => {
      const evidence = evidenceForRecord(directory, firm.id, "firm");
      const specialism = matchingSpecialism(evidence, command.brief);
      const evidenceScore = scoreEvidence(evidence, command.asOf, command.weights);
      const targetMarket = matchingTargetMarket(evidence, command.brief, command.asOf);
      const hasCurrentActivity = hasCurrentFirmActivity(evidence, command.asOf);
      const hasNamedRecruiterOrTeam = hasFirmSignal(evidence, "namedRecruiterOrTeamEvidence");
      const hasScaleOrTrackRecord = hasFirmSignal(evidence, "scaleOrTrackRecord");
      const rankingContributions = firmRankingContributions({
        asOf: command.asOf,
        evidence,
        evidenceScore,
        hasCurrentActivity,
        hasNamedRecruiterOrTeam,
        hasScaleOrTrackRecord,
        specialism,
        targetMarket,
        weights: command.weights,
      });
      const matchReasons = awardedReasons(rankingContributions);
      const score = totalContributions(rankingContributions);
      const qualification = assessFirmEvidenceQualification(evidence, command.brief, command.asOf);

      const recruiters = directory.recruiters
        .filter(
          (recruiter) =>
            recruiter.mergedInto === null &&
            recruiter.firmId !== null &&
            resolveFirmId(directory, recruiter.firmId) === firm.id &&
            keep("recruiter", recruiter.id),
        )
        .map((recruiter) => rankRecruiter(directory, recruiter, command, specialism))
        .sort(compareRankedRecords);

      return {
        ...firm,
        conflicts: conflictsForFirm(evidence),
        evidence,
        matchReasons,
        qualification,
        rankingContributions,
        recruiters,
        removed: isDirectoryRecordRemoved(directory, "firm", firm.id),
        score,
        unavailableFactors: [
          ...rankingContributions
            .filter((contribution) => contribution.points === 0)
            .map((contribution) => contribution.reason),
          "Recruiter role and seniority do not apply to a firm result.",
          "No public contact route is retained for this firm.",
        ],
      };
    })
    .sort(compareRankedRecords);

  const activeFirmIds = new Set(firms.map((firm) => firm.id));
  const unassociatedRecruiters = directory.recruiters
    .filter(
      (recruiter) =>
        recruiter.mergedInto === null &&
        keep("recruiter", recruiter.id) &&
        (recruiter.firmId === null ||
          !activeFirmIds.has(resolveFirmId(directory, recruiter.firmId))),
    )
    .map((recruiter) => rankRecruiter(directory, recruiter, command, null))
    .sort(compareRankedRecords);

  return { firms, identityReviews: directory.identityReviews, unassociatedRecruiters };
}

export function assessFirmQualification(
  observation: Extract<ResearchObservation, { readonly kind: "firm" }>,
  brief: SearchBrief,
  asOf: Date,
): FirmQualification {
  return assessFirmEvidenceQualification(
    [{ id: "qualification", observation, recordId: "qualification", runIds: [] }],
    brief,
    asOf,
  );
}

function reconcileFirm(
  directory: RecruiterDirectory,
  observation: Extract<ResearchObservation, { readonly kind: "firm" }>,
  command: { readonly recordedAt: Date; readonly runId: string },
): RecruiterDirectory {
  const id = firmIdentity(observation.websiteUrl);
  const existing = directory.firms.find((firm) => firm.id === id);
  const firms = existing
    ? directory.firms.map((firm) =>
        firm.id === id ? { ...firm, lastObservedAt: command.recordedAt } : firm,
      )
    : [
        ...directory.firms,
        {
          firstObservedAt: command.recordedAt,
          id,
          lastObservedAt: command.recordedAt,
          mergedInto: null,
          name: observation.companyName,
          websiteUrl: observation.websiteUrl,
        },
      ];
  let next = addEvidence({ ...directory, firms }, id, observation, command.runId);
  if (!existing) {
    const possibleMatch = directory.firms.find(
      (firm) =>
        firm.mergedInto === null &&
        normaliseName(firm.name) === normaliseName(observation.companyName),
    );
    if (possibleMatch) {
      next = addIdentityReview(next, {
        candidateRecordId: id,
        createdAt: command.recordedAt,
        kind: "firm",
        primaryRecordId: possibleMatch.id,
        reason: "The firm names match but the public website domains differ.",
      });
    }
  }
  return next;
}

function reconcileRecruiter(
  directory: RecruiterDirectory,
  observation: Extract<ResearchObservation, { readonly kind: "recruiter" }>,
  command: { readonly recordedAt: Date; readonly runId: string },
): RecruiterDirectory {
  const id = recruiterIdentity(observation.profileUrl);
  const existing = directory.recruiters.find((recruiter) => recruiter.id === id);
  const matchingFirm = directory.firms.find(
    (firm) =>
      firm.mergedInto === null &&
      firmAliases(directory, firm).has(normaliseName(observation.companyName)),
  );
  const recruiters = existing
    ? directory.recruiters.map((recruiter) =>
        recruiter.id === id
          ? {
              ...recruiter,
              firmId: recruiter.firmId ?? matchingFirm?.id ?? null,
              lastObservedAt: command.recordedAt,
              workEmail:
                recruiter.workEmail ??
                (observation.workEmail ? normaliseWorkEmail(observation.workEmail.address) : null),
            }
          : recruiter,
      )
    : [
        ...directory.recruiters,
        {
          companyName: observation.companyName,
          firmId: matchingFirm?.id ?? null,
          firstObservedAt: command.recordedAt,
          id,
          lastObservedAt: command.recordedAt,
          profileUrl: observation.profileUrl,
          mergedInto: null,
          name: observation.name,
          title: observation.title,
          workEmail: observation.workEmail
            ? normaliseWorkEmail(observation.workEmail.address)
            : null,
        },
      ];
  let next = addEvidence({ ...directory, recruiters }, id, observation, command.runId);
  if (!existing) {
    const observedWorkEmail = observation.workEmail
      ? normaliseWorkEmail(observation.workEmail.address)
      : null;
    const possibleMatch = directory.recruiters.find(
      (recruiter) =>
        recruiter.mergedInto === null &&
        ((observedWorkEmail !== null && recruiter.workEmail === observedWorkEmail) ||
          (normaliseName(recruiter.name) === normaliseName(observation.name) &&
            normaliseName(recruiter.companyName) === normaliseName(observation.companyName))),
    );
    if (possibleMatch) {
      next = addIdentityReview(next, {
        candidateRecordId: id,
        createdAt: command.recordedAt,
        kind: "recruiter",
        primaryRecordId: possibleMatch.id,
        reason:
          observedWorkEmail !== null && possibleMatch.workEmail === observedWorkEmail
            ? "The public work email matches but the Public profiles differ."
            : "The recruiter name and firm match but the Public profiles differ.",
      });
    }
  }
  return next;
}

function addEvidence(
  directory: RecruiterDirectory,
  recordId: string,
  observation: ResearchObservation,
  runId: string,
): RecruiterDirectory {
  const id = evidenceIdentity(observation);
  const existing = directory.evidence.find(
    (item) =>
      item.id === id &&
      resolveRecordId(directory, item.recordId) === resolveRecordId(directory, recordId),
  );
  if (existing) {
    if (existing.runIds.includes(runId)) {
      return directory;
    }
    return {
      ...directory,
      evidence: directory.evidence.map((item) =>
        item === existing ? { ...item, runIds: [...item.runIds, runId].sort() } : item,
      ),
    };
  }
  return {
    ...directory,
    evidence: [...directory.evidence, { id, observation, recordId, runIds: [runId] }],
  };
}

function addIdentityReview(
  directory: RecruiterDirectory,
  review: Omit<DirectoryIdentityReview, "decidedAt" | "id" | "status">,
): RecruiterDirectory {
  const recordIds = [review.primaryRecordId, review.candidateRecordId].sort();
  const id = `identity-review:${review.kind}:${recordIds.map(encodeURIComponent).join(":")}`;
  if (directory.identityReviews.some((item) => item.id === id)) {
    return directory;
  }
  return {
    ...directory,
    identityReviews: [
      ...directory.identityReviews,
      { ...review, decidedAt: null, id, status: "pending" },
    ],
  };
}

function evidenceForRecord(
  directory: RecruiterDirectory,
  recordId: string,
  kind: ResearchObservation["kind"],
): readonly DirectoryEvidence[] {
  return directory.evidence.filter(
    (item) =>
      item.observation.kind === kind &&
      resolveRecordId(directory, item.recordId) === resolveRecordId(directory, recordId),
  );
}

export function evidenceForRecruiter(
  directory: RecruiterDirectory,
  recruiterId: string,
): readonly DirectoryEvidence[] {
  return evidenceForRecord(directory, recruiterId, "recruiter");
}

function rankRecruiter(
  directory: RecruiterDirectory,
  recruiter: Recruiter,
  command: {
    readonly asOf: Date;
    readonly brief: SearchBrief;
    readonly weights: DirectoryMatchWeights;
  },
  inheritedSpecialism: string | null,
): RankedRecruiter {
  const evidence = evidenceForRecord(directory, recruiter.id, "recruiter");
  const removed = isDirectoryRecordRemoved(directory, "recruiter", recruiter.id);
  const titleSpecialism = command.brief.criteria.specialisms.find((specialism) =>
    normaliseName(recruiter.title).includes(normaliseName(specialism)),
  );
  const evidenceScore = scoreEvidence(evidence, command.asOf, command.weights);
  const rankingContributions: RankingContribution[] = [
    contribution(
      "specialism",
      inheritedSpecialism ? command.weights.specialism : 0,
      inheritedSpecialism
        ? `Firm specialism matches ${inheritedSpecialism}.`
        : "Matching firm Specialism Evidence is unavailable.",
    ),
    contribution(
      "currentMandatesOrActivity",
      hasRecentEvidence(evidence, command.asOf) ? command.weights.currentMandatesOrActivity : 0,
      hasRecentEvidence(evidence, command.asOf)
        ? "Current recruitment activity is supported by public evidence."
        : "Current recruitment activity Evidence is unavailable.",
    ),
    contribution(
      "recruiterRoleAndSeniority",
      titleSpecialism ? command.weights.recruiterRoleAndSeniority : 0,
      titleSpecialism
        ? `Recruiter role matches ${titleSpecialism}.`
        : "Matching Recruiter role and seniority Evidence is unavailable.",
    ),
    contribution(
      "evidenceFreshnessAndQuality",
      evidenceScore,
      evidenceScore > 0
        ? evidenceReason(evidence, evidenceScore, command.asOf)
        : "Fresh public Evidence is unavailable.",
    ),
  ];
  const matchReasons = awardedReasons(rankingContributions);
  if (recruiter.workEmail) {
    matchReasons.push("A publicly evidenced work email is available.");
  }
  return {
    ...recruiter,
    conflicts: conflictsForRecruiter(evidence),
    evidence,
    matchReasons,
    rankingContributions,
    removed,
    score: totalContributions(rankingContributions),
    unavailableFactors: [
      "Geographic relevance is unavailable from the retained evidence.",
      ...rankingContributions.filter((item) => item.points === 0).map((item) => item.reason),
      ...(recruiter.workEmail ? [] : ["No publicly evidenced work email is retained."]),
    ],
  };
}

function firmRankingContributions(input: {
  readonly asOf: Date;
  readonly evidence: readonly DirectoryEvidence[];
  readonly evidenceScore: number;
  readonly hasCurrentActivity: boolean;
  readonly hasNamedRecruiterOrTeam: boolean;
  readonly hasScaleOrTrackRecord: boolean;
  readonly specialism: string | null;
  readonly targetMarket: string | null;
  readonly weights: DirectoryMatchWeights;
}): RankingContribution[] {
  return [
    contribution(
      "specialism",
      input.specialism ? input.weights.specialism : 0,
      input.specialism
        ? `Specialism matches ${input.specialism}.`
        : "Matching Specialism Evidence is unavailable.",
    ),
    contribution(
      "targetMarketOperatingDepth",
      input.targetMarket ? input.weights.targetMarketOperatingDepth : 0,
      input.targetMarket
        ? `Target-market operation is supported for ${input.targetMarket}.`
        : "Target-market operation Evidence is unavailable.",
    ),
    contribution(
      "currentMandatesOrActivity",
      input.hasCurrentActivity ? input.weights.currentMandatesOrActivity : 0,
      input.hasCurrentActivity
        ? "Current mandates or operating activity are supported by public evidence."
        : "Current mandates or operating activity Evidence is unavailable.",
    ),
    contribution(
      "namedRecruiterOrTeamEvidence",
      input.hasNamedRecruiterOrTeam ? input.weights.namedRecruiterOrTeamEvidence : 0,
      input.hasNamedRecruiterOrTeam
        ? "A named recruiter or team is supported by public evidence."
        : "Named Recruiter or team Evidence is unavailable.",
    ),
    contribution(
      "scaleOrTrackRecord",
      input.hasScaleOrTrackRecord ? input.weights.scaleOrTrackRecord : 0,
      input.hasScaleOrTrackRecord
        ? "Scale or track record is supported by public evidence."
        : "Scale or track record Evidence is unavailable.",
    ),
    contribution(
      "evidenceFreshnessAndQuality",
      input.evidenceScore,
      input.evidenceScore > 0
        ? evidenceReason(input.evidence, input.evidenceScore, input.asOf)
        : "Fresh public Evidence is unavailable.",
    ),
  ];
}

function assessFirmEvidenceQualification(
  evidence: readonly DirectoryEvidence[],
  brief: SearchBrief,
  asOf: Date,
): FirmQualification {
  const specialism = matchingSpecialism(evidence, brief);
  const targetMarket = matchingTargetMarket(evidence, brief, asOf);
  const hasCurrentActivity = hasCurrentFirmActivity(evidence, asOf);
  const reasons = [
    ...(specialism ? [`Specialism matches ${specialism}.`] : []),
    ...(targetMarket ? [`Target-market operation is supported for ${targetMarket}.`] : []),
    ...(hasCurrentActivity
      ? ["Current mandates or operating activity are supported by public evidence."]
      : []),
  ];
  const unavailableFactors = [
    ...(!specialism ? ["Matching Specialism Evidence is unavailable."] : []),
    ...(!targetMarket ? ["Current target-market operation Evidence is unavailable."] : []),
    ...(!hasCurrentActivity
      ? ["Current mandates or operating activity Evidence is unavailable."]
      : []),
  ];
  return { qualified: unavailableFactors.length === 0, reasons, unavailableFactors };
}

function matchingTargetMarket(
  evidence: readonly DirectoryEvidence[],
  brief: SearchBrief,
  asOf: Date,
): string | null {
  for (const targetLocation of brief.criteria.targetLocations) {
    if (
      evidence.some(
        (item) =>
          item.observation.kind === "firm" &&
          evidenceAgeDays(item, asOf) <= 365 &&
          item.observation.rankingSignals?.targetMarkets.some(
            (observed) => normaliseName(observed) === normaliseName(targetLocation),
          ),
      )
    ) {
      return targetLocation;
    }
  }
  return null;
}

function hasCurrentFirmActivity(evidence: readonly DirectoryEvidence[], asOf: Date): boolean {
  return evidence.some(
    (item) =>
      item.observation.kind === "firm" &&
      item.observation.rankingSignals?.currentMandatesOrActivity === true &&
      evidenceAgeDays(item, asOf) <= 365,
  );
}

function hasFirmSignal(
  evidence: readonly DirectoryEvidence[],
  signal: "namedRecruiterOrTeamEvidence" | "scaleOrTrackRecord",
): boolean {
  return evidence.some(
    (item) =>
      item.observation.kind === "firm" && item.observation.rankingSignals?.[signal] === true,
  );
}

function contribution(
  factor: DirectoryRankingFactor,
  points: number,
  reason: string,
): RankingContribution {
  return { factor, points, reason };
}

function awardedReasons(contributions: readonly RankingContribution[]): string[] {
  return contributions.filter((item) => item.points > 0).map((item) => item.reason);
}

function totalContributions(contributions: readonly RankingContribution[]): number {
  return contributions.reduce((total, item) => total + item.points, 0);
}

function scoreEvidence(
  evidence: readonly DirectoryEvidence[],
  asOf: Date,
  weights: DirectoryMatchWeights,
): number {
  if (evidence.length === 0) {
    return 0;
  }
  return Math.max(
    ...evidence.map((item) => {
      const ageDays = Math.max(
        0,
        (asOf.getTime() -
          new Date(`${item.observation.evidence.observedAt}T00:00:00.000Z`).getTime()) /
          86_400_000,
      );
      const confidence = { high: 1, medium: 0.65, low: 0.25 }[item.observation.evidence.confidence];
      const freshness = ageDays <= 365 ? 1 : ageDays <= 730 ? 0.5 : 0.25;
      return Math.round(weights.evidenceFreshnessAndQuality * confidence * freshness);
    }),
  );
}

function evidenceReason(evidence: readonly DirectoryEvidence[], score: number, asOf: Date): string {
  const hasRecentHighConfidence = evidence.some((item) => {
    return item.observation.evidence.confidence === "high" && evidenceAgeDays(item, asOf) <= 365;
  });
  return hasRecentHighConfidence
    ? `Recent high-confidence evidence contributes ${score} points.`
    : `Retained public evidence contributes ${score} point${score === 1 ? "" : "s"}.`;
}

function hasRecentEvidence(evidence: readonly DirectoryEvidence[], asOf: Date): boolean {
  return evidence.some((item) => evidenceAgeDays(item, asOf) <= 365);
}

function evidenceAgeDays(item: DirectoryEvidence, asOf: Date): number {
  return Math.max(
    0,
    (asOf.getTime() - new Date(`${item.observation.evidence.observedAt}T00:00:00.000Z`).getTime()) /
      86_400_000,
  );
}

function matchingSpecialism(
  evidence: readonly DirectoryEvidence[],
  brief: SearchBrief,
): string | null {
  for (const specialism of brief.criteria.specialisms) {
    if (
      evidence.some(
        (item) =>
          item.observation.kind === "firm" &&
          item.observation.specialisms.some(
            (observed) => normaliseName(observed) === normaliseName(specialism),
          ),
      )
    ) {
      return specialism;
    }
  }
  return null;
}

function conflictsForFirm(evidence: readonly DirectoryEvidence[]): readonly DirectoryConflict[] {
  return conflict(
    "name",
    evidence.flatMap((item) =>
      item.observation.kind === "firm" ? [item.observation.companyName] : [],
    ),
  );
}

function conflictsForRecruiter(
  evidence: readonly DirectoryEvidence[],
): readonly DirectoryConflict[] {
  return [
    ...conflict(
      "name",
      evidence.flatMap((item) =>
        item.observation.kind === "recruiter" ? [item.observation.name] : [],
      ),
    ),
    ...conflict(
      "title",
      evidence.flatMap((item) =>
        item.observation.kind === "recruiter" ? [item.observation.title] : [],
      ),
    ),
    ...conflict(
      "companyName",
      evidence.flatMap((item) =>
        item.observation.kind === "recruiter" ? [item.observation.companyName] : [],
      ),
    ),
    ...conflict(
      "workEmail",
      evidence.flatMap((item) =>
        item.observation.kind === "recruiter" && item.observation.workEmail
          ? [normaliseWorkEmail(item.observation.workEmail.address)]
          : [],
      ),
    ),
  ];
}

function conflict(field: string, values: readonly string[]): readonly DirectoryConflict[] {
  const uniqueValues = [...new Set(values)].sort((left, right) => left.localeCompare(right));
  return uniqueValues.length > 1 ? [{ field, values: uniqueValues }] : [];
}

function compareRankedRecords(
  left: { readonly name: string; readonly score: number },
  right: { readonly name: string; readonly score: number },
): number {
  return right.score - left.score || left.name.localeCompare(right.name, "en", { numeric: true });
}

function firmIdentity(websiteUrl: string): string {
  const hostname = new URL(websiteUrl).hostname.toLowerCase().replace(/^www\./, "");
  return `firm:${hostname}`;
}

function recruiterIdentity(profileUrl: string): string {
  const url = new URL(profileUrl);
  const pathname = url.pathname.toLowerCase().replace(/\/$/, "");
  return `recruiter:${url.hostname.toLowerCase().replace(/^www\./, "")}${pathname}`;
}

function evidenceIdentity(observation: ResearchObservation): string {
  const subject =
    observation.kind === "firm"
      ? [
          observation.companyName,
          observation.reason,
          [...observation.industries].sort(),
          [...observation.specialisms].sort(),
        ]
      : [
          observation.name,
          observation.title,
          observation.companyName,
          observation.workEmail
            ? [
                normaliseWorkEmail(observation.workEmail.address),
                observation.workEmail.evidence.adapterId,
                observation.workEmail.evidence.confidence,
                observation.workEmail.evidence.excerpt,
                observation.workEmail.evidence.observedAt,
                observation.workEmail.evidence.policyVersion,
                normalisePublicUrl(observation.workEmail.evidence.sourceUrl),
              ]
            : null,
        ];
  return `evidence:${encodeURIComponent(
    JSON.stringify([
      observation.kind,
      subject,
      observation.evidence.adapterId,
      observation.evidence.confidence,
      observation.evidence.excerpt,
      observation.evidence.observedAt,
      observation.evidence.policyVersion,
      normalisePublicUrl(observation.evidence.sourceUrl),
    ]),
  )}`;
}

function normalisePublicUrl(value: string): string {
  const url = new URL(value);
  return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.toLowerCase().replace(/\/$/, "")}`;
}

function normaliseName(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

export function normaliseWorkEmail(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

function firmAliases(directory: RecruiterDirectory, firm: RecruitmentFirm): ReadonlySet<string> {
  const values = [
    firm.name,
    ...directory.evidence.flatMap((item) =>
      resolveRecordId(directory, item.recordId) === firm.id && item.observation.kind === "firm"
        ? [item.observation.companyName]
        : [],
    ),
    ...directory.corrections.flatMap((correction) =>
      correction.kind === "firm" && resolveRecordId(directory, correction.recordId) === firm.id
        ? [correction.previousValue, correction.value]
        : [],
    ),
  ];
  return new Set(values.filter((value): value is string => value !== null).map(normaliseName));
}

function resolveRecordId(directory: RecruiterDirectory, recordId: string): string {
  return recordId.startsWith("firm:")
    ? resolveFirmId(directory, recordId)
    : resolveRecruiterId(directory, recordId);
}

export function resolveFirmId(directory: RecruiterDirectory, firmId: string): string {
  const firm = directory.firms.find((item) => item.id === firmId);
  return firm?.mergedInto ? resolveFirmId(directory, firm.mergedInto) : firmId;
}

export function resolveRecruiterId(directory: RecruiterDirectory, recruiterId: string): string {
  const recruiter = directory.recruiters.find((item) => item.id === recruiterId);
  return recruiter?.mergedInto ? resolveRecruiterId(directory, recruiter.mergedInto) : recruiterId;
}

function requireFirm(directory: RecruiterDirectory, firmId: string): RecruitmentFirm {
  const firm = directory.firms.find((item) => item.id === firmId);
  if (!firm) {
    throw new Error(`Recruitment firm ${firmId} does not exist.`);
  }
  return firm;
}

function requireRecruiter(directory: RecruiterDirectory, recruiterId: string): Recruiter {
  const recruiter = directory.recruiters.find((item) => item.id === recruiterId);
  if (!recruiter) {
    throw new Error(`Recruiter ${recruiterId} does not exist.`);
  }
  return recruiter;
}
