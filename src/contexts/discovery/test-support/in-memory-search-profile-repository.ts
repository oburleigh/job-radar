import type { SearchProfileRepository } from "../application/search-profiles/save/port";
import type { SearchProfileDefinition } from "../domain/search-profile";

export type StoredSearchProfile = {
  readonly id: number;
  readonly profile: SearchProfileDefinition;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type InMemorySearchProfileRepository = SearchProfileRepository & {
  readonly records: ReadonlyArray<StoredSearchProfile>;
};

export function createInMemorySearchProfileRepository(
  initialRecords: ReadonlyArray<StoredSearchProfile> = [],
): InMemorySearchProfileRepository {
  let records = [...initialRecords];

  return {
    get records() {
      return records;
    },

    findIdByName(name) {
      return records.find((record) => record.profile.name === name)?.id;
    },

    insert(profile, timestamp) {
      const id = Math.max(0, ...records.map((record) => record.id)) + 1;
      records = [...records, { id, profile, createdAt: timestamp, updatedAt: timestamp }];
      return id;
    },

    update(id, profile, timestamp) {
      records = records.map((record) =>
        record.id === id ? { ...record, profile, updatedAt: timestamp } : record,
      );
    },
  };
}
