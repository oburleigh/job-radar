import type { Evidence } from "./observation";
import type {
  DirectoryEvidence,
  Recruiter,
  RecruiterDirectory,
  RecruitmentFirm,
} from "./recruiter-directory";
import {
  evidenceForRecruiter,
  normaliseWorkEmail,
  resolveFirmId,
  resolveRecruiterId,
} from "./recruiter-directory";

export type ShortlistProspect = {
  readonly addedAt: Date;
  readonly contactExclusion: "none" | "suppressed" | "do-not-contact";
  readonly recruiterId: string;
};

export type Shortlist = {
  readonly createdAt: Date;
  readonly id: string;
  readonly name: string;
  readonly prospects: readonly ShortlistProspect[];
};

export type ProspectContactRoute = {
  readonly evidence: readonly Evidence[];
  readonly kind: "work-email";
  readonly value: string;
};

export type AssessedShortlistProspect = ShortlistProspect & {
  readonly campaignPreparation: {
    readonly eligible: boolean;
    readonly reasons: readonly string[];
  };
  readonly contactRoutes: readonly ProspectContactRoute[];
  readonly evidence: readonly DirectoryEvidence[];
  readonly firm: RecruitmentFirm | null;
  readonly recruiter: Recruiter;
};

export type AssessedShortlist = Omit<Shortlist, "prospects"> & {
  readonly prospects: readonly AssessedShortlistProspect[];
};

export function createShortlist(command: {
  readonly createdAt: Date;
  readonly id: string;
  readonly name: string;
}): Shortlist {
  const name = command.name.trim();
  if (!name) {
    throw new Error("A Shortlist name is required.");
  }
  return { ...command, name, prospects: [] };
}

export function addRecruiterToShortlist(
  shortlist: Shortlist,
  directory: RecruiterDirectory,
  command: { readonly addedAt: Date; readonly recruiterId: string },
): Shortlist {
  requireRecruiter(directory, command.recruiterId);
  const recruiterId = resolveRecruiterId(directory, command.recruiterId);
  const normalised = normaliseShortlist(shortlist, directory);
  if (normalised.prospects.some((prospect) => prospect.recruiterId === recruiterId)) {
    return normalised;
  }
  return {
    ...normalised,
    prospects: [
      ...normalised.prospects,
      { addedAt: command.addedAt, contactExclusion: "none", recruiterId },
    ],
  };
}

export function assessShortlist(
  shortlist: Shortlist,
  directory: RecruiterDirectory,
): AssessedShortlist {
  const normalised = normaliseShortlist(shortlist, directory);
  return {
    ...normalised,
    prospects: normalised.prospects.map((prospect) => {
      const recruiterId = resolveRecruiterId(directory, prospect.recruiterId);
      const recruiter = requireRecruiter(directory, recruiterId);
      const evidence = evidenceForRecruiter(directory, recruiterId);
      const contactRoutes = evidencedWorkEmailContactRoutes(directory, evidence, recruiterId);
      const reasons = campaignPreparationReasons(prospect, contactRoutes);
      const firmId = recruiter.firmId ? resolveFirmId(directory, recruiter.firmId) : null;
      return {
        ...prospect,
        campaignPreparation: { eligible: reasons.length === 0, reasons },
        contactRoutes,
        evidence,
        firm: firmId ? (directory.firms.find((firm) => firm.id === firmId) ?? null) : null,
        recruiter,
      };
    }),
  };
}

export function setProspectContactExclusion(
  shortlist: Shortlist,
  directory: RecruiterDirectory,
  command: {
    readonly contactExclusion: ShortlistProspect["contactExclusion"];
    readonly recruiterId: string;
  },
): Shortlist {
  const normalised = normaliseShortlist(shortlist, directory);
  requireRecruiter(directory, command.recruiterId);
  const recruiterId = resolveRecruiterId(directory, command.recruiterId);
  requireProspect(normalised, recruiterId);
  return {
    ...normalised,
    prospects: normalised.prospects.map((prospect) =>
      prospect.recruiterId === recruiterId
        ? { ...prospect, contactExclusion: command.contactExclusion }
        : prospect,
    ),
  };
}

export function removeProspectFromShortlist(
  shortlist: Shortlist,
  directory: RecruiterDirectory,
  command: { readonly recruiterId: string },
): Shortlist {
  const normalised = normaliseShortlist(shortlist, directory);
  requireRecruiter(directory, command.recruiterId);
  const recruiterId = resolveRecruiterId(directory, command.recruiterId);
  requireProspect(normalised, recruiterId);
  return {
    ...normalised,
    prospects: normalised.prospects.filter((prospect) => prospect.recruiterId !== recruiterId),
  };
}

function normaliseShortlist(shortlist: Shortlist, directory: RecruiterDirectory): Shortlist {
  const prospectsByRecruiterId = new Map<string, ShortlistProspect>();
  for (const prospect of shortlist.prospects) {
    const recruiterId = resolveRecruiterId(directory, prospect.recruiterId);
    const existing = prospectsByRecruiterId.get(recruiterId);
    if (!existing) {
      prospectsByRecruiterId.set(recruiterId, { ...prospect, recruiterId });
      continue;
    }
    prospectsByRecruiterId.set(recruiterId, {
      addedAt: existing.addedAt < prospect.addedAt ? existing.addedAt : prospect.addedAt,
      contactExclusion:
        contactExclusionPriority(existing.contactExclusion) >=
        contactExclusionPriority(prospect.contactExclusion)
          ? existing.contactExclusion
          : prospect.contactExclusion,
      recruiterId,
    });
  }
  return { ...shortlist, prospects: [...prospectsByRecruiterId.values()] };
}

function contactExclusionPriority(contactExclusion: ShortlistProspect["contactExclusion"]): number {
  return { "do-not-contact": 2, none: 0, suppressed: 1 }[contactExclusion];
}

function campaignPreparationReasons(
  prospect: ShortlistProspect,
  contactRoutes: readonly ProspectContactRoute[],
): readonly string[] {
  if (prospect.contactExclusion === "suppressed") {
    return ["Suppression excludes this Prospect from Campaign preparation."];
  }
  if (prospect.contactExclusion === "do-not-contact") {
    return ["Do Not Contact excludes this Prospect from Campaign preparation."];
  }
  return contactRoutes.length === 0
    ? ["No current publicly evidenced work Contact route is available."]
    : [];
}

function requireProspect(shortlist: Shortlist, recruiterId: string): ShortlistProspect {
  const prospect = shortlist.prospects.find((item) => item.recruiterId === recruiterId);
  if (!prospect) {
    throw new Error(`Prospect ${recruiterId} does not exist in Shortlist ${shortlist.id}.`);
  }
  return prospect;
}

function requireRecruiter(directory: RecruiterDirectory, recruiterId: string): Recruiter {
  const recruiter = directory.recruiters.find((item) => item.id === recruiterId);
  if (!recruiter) {
    throw new Error(`Recruiter ${recruiterId} does not exist.`);
  }
  return recruiter;
}

function evidencedWorkEmailContactRoutes(
  directory: RecruiterDirectory,
  evidence: readonly DirectoryEvidence[],
  recruiterId: string,
): readonly ProspectContactRoute[] {
  const evidenceByAddress = new Map<string, Evidence[]>();
  for (const item of evidence) {
    if (item.observation.kind !== "recruiter" || !item.observation.workEmail) {
      continue;
    }
    const address = normaliseWorkEmail(item.observation.workEmail.address);
    evidenceByAddress.set(address, [
      ...(evidenceByAddress.get(address) ?? []),
      item.observation.workEmail.evidence,
    ]);
  }
  const correction = directory.corrections.findLast(
    (item) =>
      item.kind === "recruiter" &&
      item.field === "workEmail" &&
      resolveRecruiterId(directory, item.recordId) === recruiterId,
  );
  const address = correction
    ? normaliseWorkEmail(correction.value)
    : evidenceByAddress.size === 1
      ? evidenceByAddress.keys().next().value
      : undefined;
  const routeEvidence = address ? evidenceByAddress.get(address) : undefined;
  return address && routeEvidence
    ? [{ evidence: routeEvidence, kind: "work-email", value: address }]
    : [];
}
