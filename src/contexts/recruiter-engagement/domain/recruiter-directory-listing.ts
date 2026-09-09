import {
  isDirectoryRecordRemoved,
  type Recruiter,
  type RecruiterDirectory,
  resolveFirmId,
} from "./recruiter-directory";

export type DirectoryRecruiter = {
  readonly companyName: string;
  readonly id: string;
  readonly name: string;
  /** The profile URL only where its host is a configured public professional profile source. */
  readonly publicProfileUrl: string | null;
  readonly removed: boolean;
  readonly title: string;
};

export type DirectoryFirm = {
  readonly id: string;
  readonly name: string;
  readonly recruiters: readonly DirectoryRecruiter[];
  readonly removed: boolean;
  readonly specialisms: readonly string[];
  readonly targetMarkets: readonly string[];
  readonly websiteUrl: string;
};

export type RecruiterDirectoryListing = {
  readonly availableSpecialisms: readonly string[];
  readonly availableTargetMarkets: readonly string[];
  readonly firmCount: number;
  readonly firms: readonly DirectoryFirm[];
  readonly recruiterCount: number;
  /** Every removal in the directory, not only those matching the active filter. */
  readonly removedCount: number;
  readonly unassociatedRecruiters: readonly DirectoryRecruiter[];
};

export function listRecruiterDirectory(
  directory: RecruiterDirectory,
  command: {
    readonly includeRemoved?: boolean;
    readonly profileHosts: readonly string[];
    readonly specialism?: string;
    readonly targetMarket?: string;
    readonly targetMarketLabels: Readonly<Record<string, string>>;
  },
): RecruiterDirectoryListing {
  const keep = (kind: "firm" | "recruiter", recordId: string) =>
    command.includeRemoved === true || !isDirectoryRecordRemoved(directory, kind, recordId);

  const specialismsByFirm = new Map<string, readonly string[]>(
    directory.firms.map((firm) => [firm.id, firmSpecialisms(directory, firm.id)]),
  );
  const targetMarketsByFirm = new Map<string, readonly string[]>(
    directory.firms.map((firm) => [
      firm.id,
      firmTargetMarkets(directory, firm.id, command.targetMarketLabels),
    ]),
  );

  const firms = directory.firms
    .filter(
      (firm) =>
        firm.mergedInto === null &&
        keep("firm", firm.id) &&
        matchesSelected(specialismsByFirm.get(firm.id) ?? [], command.specialism) &&
        matchesSelected(targetMarketsByFirm.get(firm.id) ?? [], command.targetMarket),
    )
    .map(
      (firm): DirectoryFirm => ({
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
          .map((recruiter) => toDirectoryRecruiter(directory, recruiter, command.profileHosts))
          .toSorted(byName),
        removed: isDirectoryRecordRemoved(directory, "firm", firm.id),
        specialisms: specialismsByFirm.get(firm.id) ?? [],
        targetMarkets: targetMarketsByFirm.get(firm.id) ?? [],
        websiteUrl: firm.websiteUrl,
      }),
    )
    .toSorted(byName);

  /*
   * A recruiter is without a firm when the Directory holds no firm for it, which is not the same as
   * its firm failing the active specialism filter. Testing against the filtered firms listed every
   * recruiter at every non-matching firm as unassociated, so a filter added recruiters to the very
   * count that claims to be filtered.
   */
  const directoryFirmIds = new Set(
    directory.firms
      .filter((firm) => firm.mergedInto === null && keep("firm", firm.id))
      .map((firm) => firm.id),
  );
  const unassociatedRecruiters = directory.recruiters
    .filter(
      (recruiter) =>
        recruiter.mergedInto === null &&
        keep("recruiter", recruiter.id) &&
        (recruiter.firmId === null ||
          !directoryFirmIds.has(resolveFirmId(directory, recruiter.firmId))),
    )
    .map((recruiter) => toDirectoryRecruiter(directory, recruiter, command.profileHosts))
    .toSorted(byName);

  return {
    availableSpecialisms: [...new Set([...specialismsByFirm.values()].flat())].toSorted(),
    availableTargetMarkets: [...new Set([...targetMarketsByFirm.values()].flat())].toSorted(),
    firmCount: firms.length,
    firms,
    recruiterCount:
      firms.reduce((total, firm) => total + firm.recruiters.length, 0) +
      unassociatedRecruiters.length,
    removedCount: directory.removals.length,
    unassociatedRecruiters,
  };
}

function firmTargetMarkets(
  directory: RecruiterDirectory,
  firmId: string,
  targetMarketLabels: Readonly<Record<string, string>>,
): readonly string[] {
  const targetMarkets = directory.evidence
    .filter(
      (entry) =>
        entry.observation.kind === "firm" && resolveFirmId(directory, entry.recordId) === firmId,
    )
    .flatMap((entry) =>
      entry.observation.kind === "firm" ? entry.observation.rankingSignals.targetMarkets : [],
    )
    .flatMap((targetMarket) => {
      const label = targetMarketLabels[targetMarket];
      return Object.hasOwn(targetMarketLabels, targetMarket) && label ? [label] : [];
    });
  return [...new Set(targetMarkets)].toSorted();
}

function toDirectoryRecruiter(
  directory: RecruiterDirectory,
  recruiter: Recruiter,
  profileHosts: readonly string[],
): DirectoryRecruiter {
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
    .filter(
      (entry) =>
        entry.observation.kind === "firm" && resolveFirmId(directory, entry.recordId) === firmId,
    )
    .flatMap((entry) => (entry.observation.kind === "firm" ? entry.observation.specialisms : []));
  return [...new Set(specialisms)].toSorted();
}

function matchesSelected(values: readonly string[], selected: string | undefined): boolean {
  return selected === undefined || values.includes(selected);
}

function isPublicProfileUrl(profileUrl: string, profileHosts: readonly string[]): boolean {
  const normalised = profileUrl.toLowerCase();
  return profileHosts.some((host) => normalised.includes(host.toLowerCase()));
}

function byName(left: { readonly name: string }, right: { readonly name: string }): number {
  return left.name.localeCompare(right.name);
}
