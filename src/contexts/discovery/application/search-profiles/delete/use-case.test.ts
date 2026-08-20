import { describe, expect, it, vi } from "vitest";

import { createDeleteSearchProfile } from "./use-case";

describe("delete search profile", () => {
  it("deletes an existing profile and returns the next profile", () => {
    const deleteProfile = vi.fn();
    const remove = createDeleteSearchProfile({
      profiles: {
        exists: () => true,
        findNextProfileId: () => 12,
        delete: deleteProfile,
      },
    });

    expect(remove({ profileId: 7 })).toEqual({ status: "deleted", nextProfileId: 12 });
    expect(deleteProfile).toHaveBeenCalledWith(7);
  });

  it("does not delete an unknown profile", () => {
    const deleteProfile = vi.fn();
    const remove = createDeleteSearchProfile({
      profiles: {
        exists: () => false,
        findNextProfileId: () => null,
        delete: deleteProfile,
      },
    });

    expect(remove({ profileId: 7 })).toEqual({ status: "not-found" });
    expect(deleteProfile).not.toHaveBeenCalled();
  });
});
