import type { RecruiterDirectoryStore } from "@/contexts/recruiter-engagement/application/directory/port";
import {
  createEmptyRecruiterDirectory,
  type RecruiterDirectory,
} from "@/contexts/recruiter-engagement/domain/recruiter-directory";

export function createFakeRecruiterDirectoryStore(
  initial = createEmptyRecruiterDirectory(),
): RecruiterDirectoryStore {
  let directory: RecruiterDirectory = initial;
  return {
    load: async () => directory,
    async save(next) {
      directory = next;
    },
  };
}
