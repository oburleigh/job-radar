import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

import { lockSync } from "proper-lockfile";

export interface DatabaseLease {
  release(): void;
}

export class DatabaseLeaseUnavailable extends Error {
  constructor(databasePath: string) {
    super(`Database is already in use: ${databasePath}`);
    this.name = "DatabaseLeaseUnavailable";
  }
}

export function acquireDatabaseLease(databasePath: string): DatabaseLease {
  const resolvedPath = canonicalLeasePath(databasePath);
  let releaseLock: () => void;
  try {
    releaseLock = lockSync(resolvedPath, {
      realpath: false,
      retries: 0,
      stale: 30_000,
      update: 10_000,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ELOCKED") {
      throw new DatabaseLeaseUnavailable(resolvedPath);
    }
    throw error;
  }

  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      releaseLock();
    },
  };
}

function canonicalLeasePath(databasePath: string): string {
  const resolvedPath = path.resolve(databasePath);
  if (existsSync(resolvedPath)) return realpathSync(resolvedPath);
  return path.join(realpathSync(path.dirname(resolvedPath)), path.basename(resolvedPath));
}
