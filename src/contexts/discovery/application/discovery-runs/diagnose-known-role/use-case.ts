import type { DiagnoseKnownRoleCommand } from "./command";
import type { KnownRoleDiagnostics } from "./port";
import type { DiagnoseKnownRoleResult } from "./result";

interface DiagnoseKnownRoleDependencies {
  readonly diagnostics: KnownRoleDiagnostics;
}

export type DiagnoseKnownRole = (command: DiagnoseKnownRoleCommand) => DiagnoseKnownRoleResult;

export function createDiagnoseKnownRole({
  diagnostics,
}: DiagnoseKnownRoleDependencies): DiagnoseKnownRole {
  return (command) => diagnostics.diagnose(command);
}
