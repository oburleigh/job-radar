import path from "node:path";

export function resolveDatabasePath(
  configuredDatabasePath = process.env.DB_PATH ?? "data/job-radar.sqlite",
): string {
  return configuredDatabasePath === ":memory:"
    ? configuredDatabasePath
    : path.resolve(process.cwd(), configuredDatabasePath);
}
