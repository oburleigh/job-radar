import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const workflowsRoot = path.join(repositoryRoot, ".github", "workflows");
const ciWorkflow = readFileSync(path.join(workflowsRoot, "ci.yml"), "utf8");
const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8")) as {
  packageManager?: string;
  scripts?: Record<string, string>;
};

describe("GitHub Actions quality gates", () => {
  it("keeps the pull-request triggers, read-only permissions, matrix, and repository gates", () => {
    expect(ciWorkflow).toMatch(/on:\s*\n\s+push:\s*\n\s+branches:\s+\[main\]\s*\n\s+pull_request:/);
    expect(ciWorkflow).toMatch(/permissions:\s*\n\s+contents:\s*read/);
    expect(ciWorkflow).toContain("os: [ubuntu-latest, macos-latest, windows-latest]");

    for (const command of [
      "pnpm install --frozen-lockfile",
      "pnpm setup:check",
      "pnpm db:setup",
      "pnpm exec vitest run",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm test:coverage",
      "pnpm storybook:build",
      "pnpm build",
      "pnpm test:e2e",
      "pnpm format:check",
      "pnpm test:mutation:focused",
    ]) {
      expect(ciWorkflow, command).toContain(command);
    }

    expect(packageJson.packageManager).toBe("pnpm@11.1.3");
    expect(ciWorkflow).toContain("pnpm/action-setup@v6.0.10");
  });

  it("defines the focused mutation command and exact production mutation targets", async () => {
    expect(packageJson.scripts?.["test:mutation"]).toBe("stryker run");
    expect(packageJson.scripts?.["test:mutation:focused"]).toContain("stryker.focused.config.mjs");

    const configPath = path.join(repositoryRoot, "stryker.focused.config.mjs");
    expect(existsSync(configPath)).toBe(true);
    if (!existsSync(configPath)) {
      return;
    }

    const { default: config } = await import(configPath);
    expect(config.mutate).toEqual([
      "src/contexts/discovery/domain/evaluate-job.ts",
      "src/contexts/discovery/application/discovery-runs/planning/plan-search-queries.ts",
      "!src/**/*.test.ts",
      "!src/**/test-support/**",
    ]);
  });

  it("retains focused mutation reports when the focused gate fails", () => {
    const focusedMutationSteps = workflowJobSteps(ciWorkflow, "focused-mutation");
    const focusedMutationStep = findStep(focusedMutationSteps, (step) =>
      step.includes("pnpm test:mutation:focused"),
    );
    const focusedReportStep = findStep(focusedMutationSteps, (step) =>
      step.includes("actions/upload-artifact"),
    );

    expect(focusedMutationStep).toContain("pnpm test:mutation:focused");
    expect(focusedReportStep).toMatch(/if:\s*always\(\)/);
    expect(focusedReportStep).toMatch(/name:.*(?:focused|mutation).*report/i);
    expect(focusedReportStep).toMatch(/path:.*reports\//);
  });

  it("uses outcome-based system Chrome fallback for every managed browser install", () => {
    const steps = workflowSteps(ciWorkflow);
    const installSteps = steps.filter((step) => /playwright install\b/.test(step));
    const browserTestSteps = steps.filter((step) => /pnpm test:e2e/.test(step));

    expect(installSteps.length).toBeGreaterThan(0);
    expect(browserTestSteps.length).toBeGreaterThan(0);

    for (const installStep of installSteps) {
      expect(installStep).toMatch(/continue-on-error:\s*true/);
      const installId = installStep.match(/id:\s*([\w-]+)/)?.[1];
      expect(installId, installStep).toBeDefined();
      expect(
        browserTestSteps.some(
          (testStep) =>
            testStep.includes("PLAYWRIGHT_USE_SYSTEM_CHROME=1") ||
            (testStep.includes("PLAYWRIGHT_USE_SYSTEM_CHROME") &&
              testStep.includes(`steps.${installId}.outcome`) &&
              testStep.includes("failure")),
        ),
        installId,
      ).toBe(true);
    }
  });

  it("runs full mutation on schedule or manual dispatch and retains its report on failure", () => {
    const mutationPath = path.join(workflowsRoot, "mutation.yml");
    expect(existsSync(mutationPath)).toBe(true);
    if (!existsSync(mutationPath)) {
      return;
    }

    const mutationWorkflow = readFileSync(mutationPath, "utf8");
    expect(mutationWorkflow).toMatch(/on:\s*\n\s+schedule:\s*\n\s+- cron:/);
    expect(mutationWorkflow).toMatch(/\n\s+workflow_dispatch:\s*(?:\n|$)/);
    expect(mutationWorkflow).not.toMatch(/\n\s+(?:pull_request|push):/);
    expect(mutationWorkflow).toMatch(/permissions:\s*\n\s+contents:\s*read/);
    expect(mutationWorkflow).toContain("pnpm test:mutation");

    const reportStep = findStep(mutationWorkflow, (step) =>
      step.includes("actions/upload-artifact"),
    );
    expect(reportStep).toMatch(/if:\s*always\(\)/);
    expect(reportStep).toMatch(/name:.*(?:full|mutation).*report/i);
    expect(reportStep).toMatch(/path:.*reports\//);

    const focusedName = findStep(workflowJobSteps(ciWorkflow, "focused-mutation"), (step) =>
      step.includes("actions/upload-artifact"),
    ).match(/name:\s*([^\n]+)/i)?.[1];
    const fullName = reportStep.match(/name:\s*([^\n]+)/i)?.[1];
    expect(focusedName).toBeDefined();
    expect(fullName).toBeDefined();
    expect(focusedName).not.toBe(fullName);
  });
});

function workflowSteps(workflow: string): string[] {
  const lines = workflow.split("\n");
  const stepStarts = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\s{6}-\s/.test(line));

  return stepStarts.map(({ index }, stepIndex) => {
    const nextIndex = stepStarts[stepIndex + 1]?.index ?? lines.length;
    return lines.slice(index, nextIndex).join("\n");
  });
}

function workflowJobSteps(workflow: string, jobName: string): string[] {
  const lines = workflow.split("\n");
  const jobStart = lines.indexOf(`  ${jobName}:`);
  expect(jobStart, jobName).toBeGreaterThanOrEqual(0);

  const nextJob = lines.findIndex((line, index) => index > jobStart && /^ {2}[\w-]+:$/.test(line));
  return workflowSteps(lines.slice(jobStart, nextJob === -1 ? undefined : nextJob).join("\n"));
}

function findStep(workflow: string | string[], predicate: (step: string) => boolean): string {
  const steps = typeof workflow === "string" ? workflowSteps(workflow) : workflow;
  const step = steps.find(predicate);
  expect(step).toBeDefined();
  return step ?? "";
}
