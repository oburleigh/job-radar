import type { RecruiterDirectory } from "@/contexts/recruiter-engagement/domain/recruiter-directory";

export interface RecruiterDirectoryStore {
  readonly load: () => Promise<RecruiterDirectory>;
  readonly save: (directory: RecruiterDirectory) => Promise<void>;
}
