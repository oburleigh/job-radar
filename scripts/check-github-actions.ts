import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const USES_REFERENCE = /^\s*-?\s*uses:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))(?:\s+#\s*(.*?)\s*)?$/;
const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/;
const RELEASE_VERSION = /^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export function githubActionsPolicyErrors(workflow: string, filePath: string): string[] {
  const errors: string[] = [];

  for (const [index, line] of workflow.split("\n").entries()) {
    const match = USES_REFERENCE.exec(line);
    if (!match) {
      continue;
    }

    const reference = match[1] ?? match[2] ?? match[3] ?? "";
    if (reference.startsWith("./") || reference.startsWith("docker://")) {
      continue;
    }

    const separator = reference.lastIndexOf("@");
    const action = separator === -1 ? reference : reference.slice(0, separator);
    const revision = separator === -1 ? "" : reference.slice(separator + 1);
    const lineNumber = index + 1;

    if (!FULL_COMMIT_SHA.test(revision)) {
      errors.push(
        `${filePath}:${lineNumber}: third-party action ${action} must use a full 40-character lowercase commit SHA`,
      );
      continue;
    }

    if (!RELEASE_VERSION.test(match[4] ?? "")) {
      errors.push(
        `${filePath}:${lineNumber}: pinned third-party action ${action} must end with a release comment such as # v7.0.1`,
      );
    }
  }

  return errors;
}

async function checkWorkflows(): Promise<void> {
  const workflowsDirectory = path.resolve(process.cwd(), ".github/workflows");
  const workflowFiles = (await readdir(workflowsDirectory))
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .sort();
  const errors = (
    await Promise.all(
      workflowFiles.map(async (file) => {
        const filePath = path.join(".github/workflows", file);
        return githubActionsPolicyErrors(await readFile(filePath, "utf8"), filePath);
      }),
    )
  ).flat();

  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  }
}

const entryPoint = process.argv[1];
if (entryPoint && path.resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  await checkWorkflows();
}
