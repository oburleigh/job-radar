import { describe, expect, it } from "vitest";

import { createDeleteSearchProfile } from "./use-case";

describe("delete search profile", () => {
  it("deletes an existing profile and returns the next profile", () => {
    const deletedProfileIds: number[] = [];
    const remove = createDeleteSearchProfile({
      profiles: {
        exists: () => true,
        findNextProfileId: () => 12,
        delete: (profileId) => deletedProfileIds.push(profileId),
      },
    });

    expect(remove({ profileId: 7 })).toEqual({ status: "deleted", nextProfileId: 12 });
    expect(deletedProfileIds).toEqual([7]);
  });

  it("does not delete an unknown profile", () => {
    const deletedProfileIds: number[] = [];
    const remove = createDeleteSearchProfile({
      profiles: {
        exists: () => false,
        findNextProfileId: () => null,
        delete: (profileId) => deletedProfileIds.push(profileId),
      },
    });

    expect(remove({ profileId: 7 })).toEqual({ status: "not-found" });
    expect(deletedProfileIds).toEqual([]);
  });
});
