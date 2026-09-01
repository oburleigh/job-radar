import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export default function teardownPlaywrightArtifacts() {
  const directory = process.env.JOB_RADAR_E2E_DIRECTORY;
  if (directory) {
    const expectedParent = path.resolve(tmpdir());
    const resolvedDirectory = path.resolve(directory);
    if (
      path.dirname(resolvedDirectory) !== expectedParent ||
      !path.basename(resolvedDirectory).startsWith("job-radar-playwright-")
    ) {
      throw new Error(`Refusing to remove unexpected Playwright directory: ${resolvedDirectory}`);
    }

    removeDirectory(resolvedDirectory);
  }

  const buildDirectory = process.env.JOB_RADAR_E2E_BUILD_DIRECTORY;
  if (buildDirectory) {
    const expectedParent = path.resolve("build");
    const resolvedBuildDirectory = path.resolve(buildDirectory);
    if (
      path.dirname(resolvedBuildDirectory) !== expectedParent ||
      !path.basename(resolvedBuildDirectory).startsWith("playwright-")
    ) {
      throw new Error(
        `Refusing to remove unexpected Playwright build directory: ${resolvedBuildDirectory}`,
      );
    }

    removeDirectory(resolvedBuildDirectory);
  }
}

function removeDirectory(directory: string) {
  rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
