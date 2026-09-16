import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";

const templatePath = process.env.JOB_RADAR_TEST_DATABASE_TEMPLATE;
const poolId = process.env.VITEST_POOL_ID;

if (!templatePath) throw new Error("Expected the Vitest database template path.");
if (!poolId) throw new Error("Expected the Vitest pool identifier.");

const workerDatabasePath = path.join(path.dirname(templatePath), `worker-${poolId}.sqlite`);
if (!existsSync(workerDatabasePath)) copyFileSync(templatePath, workerDatabasePath);
process.env.DB_PATH = workerDatabasePath;
