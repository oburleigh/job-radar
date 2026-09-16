export type NextActionState = "open" | "completed" | "deferred" | "dismissed";

export interface NextActionStateSnapshot {
  readonly state: NextActionState;
  readonly dueAt: Date | null;
}

export type NextActionChange =
  | { readonly kind: "complete" }
  | { readonly kind: "dismiss" }
  | { readonly kind: "defer"; readonly dueAt: Date }
  | { readonly kind: "reopen" };

export type NextActionChangeResult =
  | ({ readonly accepted: true } & NextActionStateSnapshot)
  | { readonly accepted: false; readonly reason: "invalid-next-action-change" };

export function changeNextAction(
  current: NextActionStateSnapshot,
  change: NextActionChange,
): NextActionChangeResult {
  if (current.state === "open") {
    if (change.kind === "complete") {
      return { accepted: true, state: "completed", dueAt: current.dueAt };
    }
    if (change.kind === "dismiss") {
      return { accepted: true, state: "dismissed", dueAt: current.dueAt };
    }
    if (change.kind === "defer") {
      return { accepted: true, state: "deferred", dueAt: change.dueAt };
    }
    return { accepted: false, reason: "invalid-next-action-change" };
  }

  if (change.kind === "reopen") {
    return {
      accepted: true,
      state: "open",
      dueAt: current.state === "deferred" ? null : current.dueAt,
    };
  }
  return { accepted: false, reason: "invalid-next-action-change" };
}
