import type { DiagnoseKnownRoleCommand } from "./command";
import type { DiagnoseKnownRoleResult } from "./result";

export interface KnownRoleDiagnostics {
  diagnose(command: DiagnoseKnownRoleCommand): DiagnoseKnownRoleResult;
}
