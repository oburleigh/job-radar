import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export default function teardownPlaywrightDatabase() {
  const directory = process.env.JOB_RADAR_E2E_DIRECTORY;
  if (!directory) {
    return;
  }

  const expectedParent = path.resolve(tmpdir());
  const resolvedDirectory = path.resolve(directory);
  if (
    path.dirname(resolvedDirectory) !== expectedParent ||
    !path.basename(resolvedDirectory).startsWith("job-radar-playwright-")
  ) {
    throw new Error(`Refusing to remove unexpected Playwright directory: ${resolvedDirectory}`);
  }

  rmSync(resolvedDirectory, { recursive: true, force: true });
}
