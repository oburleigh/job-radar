import { z } from "zod";
import type { DiagnoseKnownRoleCommand } from "@/contexts/discovery/application/discovery-runs/diagnose-known-role/command";

const publicJobUrlSchema = z.httpUrl();

export type KnownRoleDiagnosticRequestResult =
  | { readonly status: "empty" }
  | { readonly status: "valid"; readonly command: DiagnoseKnownRoleCommand }
  | { readonly status: "invalid"; readonly message: string };

export function parseKnownRoleDiagnosticRequest(
  value: string | null,
  runId: number,
): KnownRoleDiagnosticRequestResult {
  if (value === null) {
    return { status: "empty" };
  }
  const normalized = value.trim();
  if (normalized === "") {
    return { status: "empty" };
  }
  const parsed = publicJobUrlSchema.safeParse(normalized);
  if (!parsed.success) {
    return {
      status: "invalid",
      message: "Enter a valid public job URL beginning with http:// or https://.",
    };
  }
  return {
    status: "valid",
    command: { runId, jobUrl: parsed.data },
  };
}
