import "dotenv/config";

import { restoreDatabase } from "@/contexts/discovery/infrastructure/sqlite/migrations/restore-database";

async function main(): Promise<void> {
  const { databasePath, backupPath } = parseArguments(process.argv.slice(2));
  const result = await restoreDatabase({ databasePath, backupPath });
  console.log(`Restored database: ${result.restoredPath}`);
  console.log(`Retained failed database: ${result.retainedFailedPath}`);
}

function parseArguments(arguments_: string[]): { databasePath: string; backupPath: string } {
  const values = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  if (
    values.length !== 4 ||
    values[0] !== "--database" ||
    !values[1] ||
    values[2] !== "--backup" ||
    !values[3]
  ) {
    throw new Error("Expected --database <path> and --backup <path>.");
  }
  return { databasePath: values[1], backupPath: values[3] };
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Database restore failed: ${message}`);
  process.exitCode = 1;
});
