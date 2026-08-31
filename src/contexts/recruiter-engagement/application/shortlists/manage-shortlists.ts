import type { RecruiterDirectoryStore } from "@/contexts/recruiter-engagement/application/directory/port";
import {
  type AssessedShortlist,
  addRecruiterToShortlist,
  assessShortlist,
  createShortlist,
  removeProspectFromShortlist,
  type Shortlist,
  type ShortlistProspect,
  setProspectContactExclusion,
} from "@/contexts/recruiter-engagement/domain/shortlist";
import type { ShortlistStore } from "./port";

export type ShortlistResult = AssessedShortlist;
export type ShortlistProspectResult = ShortlistResult["prospects"][number];

export interface ForManagingShortlists {
  readonly addProspect: (command: {
    readonly recruiterId: string;
    readonly shortlistId: string;
  }) => Promise<Shortlist>;
  readonly create: (command: { readonly name: string }) => Promise<Shortlist>;
  readonly delete: (command: { readonly shortlistId: string }) => Promise<void>;
  readonly list: () => Promise<readonly ShortlistResult[]>;
  readonly removeProspect: (command: {
    readonly recruiterId: string;
    readonly shortlistId: string;
  }) => Promise<Shortlist>;
  readonly setContactExclusion: (command: {
    readonly contactExclusion: ShortlistProspect["contactExclusion"];
    readonly recruiterId: string;
    readonly shortlistId: string;
  }) => Promise<Shortlist>;
}

export function createShortlistManagement({
  createId,
  directory,
  now,
  shortlists,
}: {
  readonly createId: () => string;
  readonly directory: RecruiterDirectoryStore;
  readonly now: () => Date;
  readonly shortlists: ShortlistStore;
}): ForManagingShortlists {
  return {
    async addProspect(command) {
      const shortlist = await requireShortlist(shortlists, command.shortlistId);
      const updated = addRecruiterToShortlist(shortlist, await directory.load(), {
        addedAt: now(),
        recruiterId: command.recruiterId,
      });
      await shortlists.save(updated);
      return updated;
    },
    async create(command) {
      const name = command.name.trim();
      const existing = (await shortlists.list()).find(
        (shortlist) => normaliseName(shortlist.name) === normaliseName(name),
      );
      if (existing) {
        throw new Error(`A Shortlist named ${existing.name} already exists.`);
      }
      const shortlist = createShortlist({ createdAt: now(), id: createId(), name });
      await shortlists.save(shortlist);
      return shortlist;
    },
    async delete(command) {
      await requireShortlist(shortlists, command.shortlistId);
      await shortlists.delete(command.shortlistId);
    },
    async list() {
      const [items, recruiterDirectory] = await Promise.all([shortlists.list(), directory.load()]);
      return items.map((shortlist) => assessShortlist(shortlist, recruiterDirectory));
    },
    async removeProspect(command) {
      const shortlist = await requireShortlist(shortlists, command.shortlistId);
      const updated = removeProspectFromShortlist(shortlist, await directory.load(), command);
      await shortlists.save(updated);
      return updated;
    },
    async setContactExclusion(command) {
      const shortlist = await requireShortlist(shortlists, command.shortlistId);
      const updated = setProspectContactExclusion(shortlist, await directory.load(), command);
      await shortlists.save(updated);
      return updated;
    },
  };
}

async function requireShortlist(
  shortlists: ShortlistStore,
  shortlistId: string,
): Promise<Shortlist> {
  const shortlist = await shortlists.get(shortlistId);
  if (!shortlist) {
    throw new Error(`Shortlist ${shortlistId} does not exist.`);
  }
  return shortlist;
}

function normaliseName(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}
