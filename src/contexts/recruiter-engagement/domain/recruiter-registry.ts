import {
  isDirectoryRecordRemoved,
  type Recruiter,
  type RecruiterDirectory,
  resolveFirmId,
} from "./recruiter-directory";

export type RegistryRecruiter = {
  readonly companyName: string;
  readonly id: string;
  readonly name: string;
  /** The profile URL only where its host is a configured public professional profile source. */
  readonly publicProfileUrl: string | null;
  readonly removed: boolean;
  readonly title: string;
};

export type RegistryFirm = {
  readonly id: string;
  readonly name: string;
  readonly recruiters: readonly RegistryRecruiter[];
  readonly removed: boolean;
  readonly specialisms: readonly string[];
  readonly websiteUrl: string;
};

export type RecruiterRegistry = {
  readonly availableSpecialisms: readonly string[];
  readonly firmCount: number;
  readonly firms: readonly RegistryFirm[];
  readonly recruiterCount: number;
  readonly removedCount: number;
  readonly unassociatedRecruiters: readonly RegistryRecruiter[];
};

export function listRecruiterRegistry(
  directory: RecruiterDirectory,
  command: {
    readonly includeRemoved?: boolean;
    readonly profileHosts: readonly string[];
    readonly specialism?: string;
  },
): RecruiterRegistry {
  const keep = (kind: "firm" | "recruiter", recordId: string) =>
    command.includeRemoved === true || !isDirectoryRecordRemoved(directory, kind, recordId);

  const specialismsByFirm = new Map<string, readonly string[]>(
    directory.firms.map((firm) => [firm.id, firmSpecialisms(directory, firm.id)]),
  );

  const firms = directory.firms
    .filter(
      (firm) =>
        firm.mergedInto === null &&
        keep("firm", firm.id) &&
        matchesSpecialism(specialismsByFirm.get(firm.id) ?? [], command.specialism),
    )
    .map(
      (firm): RegistryFirm => ({
        id: firm.id,
        name: firm.name,
        recruiters: directory.recruiters
          .filter(
            (recruiter) =>
              recruiter.mergedInto === null &&
              recruiter.firmId !== null &&
              resolveFirmId(directory, recruiter.firmId) === firm.id &&
              keep("recruiter", recruiter.id),
          )
          .map((recruiter) => toRegistryRecruiter(directory, recruiter, command.profileHosts))
          .toSorted(byName),
        removed: isDirectoryRecordRemoved(directory, "firm", firm.id),
        specialisms: specialismsByFirm.get(firm.id) ?? [],
        websiteUrl: firm.websiteUrl,
      }),
    )
    .toSorted(byName);

  const listedFirmIds = new Set(firms.map((firm) => firm.id));
  const unassociatedRecruiters = directory.recruiters
    .filter(
      (recruiter) =>
        recruiter.mergedInto === null &&
        keep("recruiter", recruiter.id) &&
        (recruiter.firmId === null ||
          !listedFirmIds.has(resolveFirmId(directory, recruiter.firmId))),
    )
    .map((recruiter) => toRegistryRecruiter(directory, recruiter, command.profileHosts))
    .toSorted(byName);

  return {
    availableSpecialisms: [...new Set([...specialismsByFirm.values()].flat())].toSorted(),
    firmCount: firms.length,
    firms,
    recruiterCount:
      firms.reduce((total, firm) => total + firm.recruiters.length, 0) +
      unassociatedRecruiters.length,
    removedCount: directory.removals.length,
    unassociatedRecruiters,
  };
}

function toRegistryRecruiter(
  directory: RecruiterDirectory,
  recruiter: Recruiter,
  profileHosts: readonly string[],
): RegistryRecruiter {
  return {
    companyName: recruiter.companyName,
    id: recruiter.id,
    name: recruiter.name,
    publicProfileUrl: isPublicProfileUrl(recruiter.profileUrl, profileHosts)
      ? recruiter.profileUrl
      : null,
    removed: isDirectoryRecordRemoved(directory, "recruiter", recruiter.id),
    title: recruiter.title,
  };
}

function firmSpecialisms(directory: RecruiterDirectory, firmId: string): readonly string[] {
  const specialisms = directory.evidence
    .filter((entry) => entry.recordId === firmId && entry.observation.kind === "firm")
    .flatMap((entry) => (entry.observation.kind === "firm" ? entry.observation.specialisms : []));
  return [...new Set(specialisms)].toSorted();
}

function matchesSpecialism(specialisms: readonly string[], selected: string | undefined): boolean {
  return selected === undefined || specialisms.includes(selected);
}

function isPublicProfileUrl(profileUrl: string, profileHosts: readonly string[]): boolean {
  const normalised = profileUrl.toLowerCase();
  return profileHosts.some((host) => normalised.includes(host.toLowerCase()));
}

function byName(left: { readonly name: string }, right: { readonly name: string }): number {
  return left.name.localeCompare(right.name);
}
