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
  readonly linkedInUrl: string;
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

export type RecruiterDirectory = {
  readonly corrections: readonly DirectoryCorrection[];
  readonly evidence: readonly DirectoryEvidence[];
  readonly firms: readonly RecruitmentFirm[];
  readonly identityReviews: readonly DirectoryIdentityReview[];
  readonly recruiters: readonly Recruiter[];
};

export type DirectoryMatchWeights = {
  readonly currentActivity: number;
  readonly evidenceFreshnessAndQuality: number;
  readonly recruiterRoleAndSeniority: number;
  readonly specialism: number;
};

export type DirectoryConflict = {
  readonly field: string;
  readonly values: readonly string[];
};

export type RankedRecruiter = Recruiter & {
  readonly conflicts: readonly DirectoryConflict[];
  readonly evidence: readonly DirectoryEvidence[];
  readonly matchReasons: readonly string[];
  readonly score: number;
  readonly unavailableFactors: readonly string[];
};

export type RankedFirm = RecruitmentFirm & {
  readonly conflicts: readonly DirectoryConflict[];
  readonly evidence: readonly DirectoryEvidence[];
  readonly matchReasons: readonly string[];
  readonly recruiters: readonly RankedRecruiter[];
  readonly score: number;
  readonly unavailableFactors: readonly string[];
};

export type RankedRecruiterDirectory = {
  readonly firms: readonly RankedFirm[];
  readonly identityReviews: readonly DirectoryIdentityReview[];
  readonly unassociatedRecruiters: readonly RankedRecruiter[];
};

export function createEmptyRecruiterDirectory(): RecruiterDirectory {
  return { corrections: [], evidence: [], firms: [], identityReviews: [], recruiters: [] };
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
    readonly weights: DirectoryMatchWeights;
  },
): RankedRecruiterDirectory {
  const firms = directory.firms
    .filter((firm) => firm.mergedInto === null)
    .map((firm): RankedFirm => {
      const evidence = evidenceForRecord(directory, firm.id, "firm");
      const specialism = matchingSpecialism(evidence, command.brief);
      const evidenceScore = scoreEvidence(evidence, command.asOf, command.weights);
      const matchReasons: string[] = [];
      const hasCurrentActivity = hasRecentEvidence(evidence, command.asOf);
      let score = hasCurrentActivity ? command.weights.currentActivity : 0;
      if (specialism) {
        score += command.weights.specialism;
        matchReasons.push(`Specialism matches ${specialism}.`);
      }
      if (hasCurrentActivity) {
        matchReasons.push("Current recruitment activity is supported by public evidence.");
      }
      score += evidenceScore;
      if (evidenceScore > 0) {
        matchReasons.push(evidenceReason(evidence, evidenceScore, command.asOf));
      }

      const recruiters = directory.recruiters
        .filter(
          (recruiter) =>
            recruiter.mergedInto === null &&
            recruiter.firmId !== null &&
            resolveFirmId(directory, recruiter.firmId) === firm.id,
        )
        .map((recruiter) => rankRecruiter(directory, recruiter, command, specialism))
        .sort(compareRankedRecords);

      return {
        ...firm,
        conflicts: conflictsForFirm(evidence),
        evidence,
        matchReasons,
        recruiters,
        score,
        unavailableFactors: [
          "Geographic relevance is unavailable from the retained evidence.",
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
        (recruiter.firmId === null ||
          !activeFirmIds.has(resolveFirmId(directory, recruiter.firmId))),
    )
    .map((recruiter) => rankRecruiter(directory, recruiter, command, null))
    .sort(compareRankedRecords);

  return { firms, identityReviews: directory.identityReviews, unassociatedRecruiters };
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
  const id = recruiterIdentity(observation.linkedInUrl);
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
          linkedInUrl: observation.linkedInUrl,
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
            ? "The public work email matches but the public LinkedIn profiles differ."
            : "The recruiter name and firm match but the public LinkedIn profiles differ.",
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
  const titleSpecialism = command.brief.criteria.specialisms.find((specialism) =>
    normaliseName(recruiter.title).includes(normaliseName(specialism)),
  );
  const evidenceScore = scoreEvidence(evidence, command.asOf, command.weights);
  let score = 0;
  const matchReasons: string[] = [];
  if (inheritedSpecialism) {
    score += command.weights.specialism;
    matchReasons.push(`Firm specialism matches ${inheritedSpecialism}.`);
  }
  if (hasRecentEvidence(evidence, command.asOf)) {
    score += command.weights.currentActivity;
    matchReasons.push("Current recruitment activity is supported by public evidence.");
  }
  if (titleSpecialism) {
    score += command.weights.recruiterRoleAndSeniority;
    matchReasons.push(`Recruiter role matches ${titleSpecialism}.`);
  }
  score += evidenceScore;
  if (evidenceScore > 0) {
    matchReasons.push(evidenceReason(evidence, evidenceScore, command.asOf));
  }
  if (recruiter.workEmail) {
    matchReasons.push("A publicly evidenced work email is available.");
  }
  return {
    ...recruiter,
    conflicts: conflictsForRecruiter(evidence),
    evidence,
    matchReasons,
    score,
    unavailableFactors: [
      "Geographic relevance is unavailable from the retained evidence.",
      ...(recruiter.workEmail ? [] : ["No publicly evidenced work email is retained."]),
    ],
  };
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

function recruiterIdentity(linkedInUrl: string): string {
  const url = new URL(linkedInUrl);
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

function normaliseWorkEmail(value: string): string {
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

function resolveFirmId(directory: RecruiterDirectory, firmId: string): string {
  const firm = directory.firms.find((item) => item.id === firmId);
  return firm?.mergedInto ? resolveFirmId(directory, firm.mergedInto) : firmId;
}

function resolveRecruiterId(directory: RecruiterDirectory, recruiterId: string): string {
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
