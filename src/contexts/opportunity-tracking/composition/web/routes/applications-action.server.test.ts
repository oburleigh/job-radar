import { describe, expect, it } from "vitest";

import type {
  StartApplicationCommand,
  StartApplicationResult,
} from "@/contexts/opportunity-tracking/application/opportunity-workflow";
import { createApplicationsAction } from "./applications-action.server";

describe("Applications route action", () => {
  it("starts an Application through the validated localhost request", async () => {
    const received: StartApplicationCommand[] = [];
    const action = createApplicationsAction({
      startApplication(command) {
        received.push(command);
        return {
          status: "created",
          application: {
            id: 41,
            searchProfileId: command.searchProfileId,
            jobListingId: command.jobListingId,
            stage: command.stage,
            createdAt: new Date("2026-09-14T15:00:00.000Z"),
            updatedAt: new Date("2026-09-14T15:00:00.000Z"),
          },
        };
      },
    });

    await expect(action(localRequest(validFields()))).resolves.toEqual({
      ok: true,
      applicationId: 41,
      status: "created",
      message: "Application started.",
    });
    expect(received).toEqual([
      {
        searchProfileId: 7,
        jobListingId: 11,
        stage: "preparing",
      },
    ]);
  });

  it.each([
    [
      "existing",
      existingResult(),
      { ok: true, applicationId: 41, status: "existing", message: "Application already exists." },
    ],
    [
      "unavailable",
      { status: "opportunity-not-found" } satisfies StartApplicationResult,
      { ok: false, message: "This Opportunity is no longer available to start." },
    ],
  ])("reports the %s workflow result honestly", async (_label, result, expected) => {
    const action = createApplicationsAction({ startApplication: () => result });
    await expect(action(localRequest(validFields()))).resolves.toEqual(expected);
  });

  it("rejects invalid input before calling the workflow", async () => {
    let calls = 0;
    const action = createApplicationsAction({
      startApplication() {
        calls += 1;
        return { status: "opportunity-not-found" };
      },
    });
    const fields = validFields();
    fields.set("stage", "screening");
    await expect(action(localRequest(fields))).resolves.toEqual({
      ok: false,
      message: "Check the Application start details and try again.",
    });
    expect(calls).toBe(0);
  });

  it("rejects remote mutation requests", async () => {
    const action = createApplicationsAction({ startApplication: () => existingResult() });
    await expect(action(localRequest(validFields(), "jobs.example.test"))).rejects.toThrow(
      /restricted to localhost/,
    );
  });
});

function validFields(): FormData {
  const fields = new FormData();
  fields.set("searchProfileId", "7");
  fields.set("jobListingId", "11");
  fields.set("stage", "preparing");
  return fields;
}

function localRequest(fields: FormData, host = "127.0.0.1:5173"): Request {
  return new Request("http://127.0.0.1:5173/applications", {
    method: "POST",
    headers: { host },
    body: fields,
  });
}

function existingResult(): StartApplicationResult {
  return {
    status: "existing",
    application: {
      id: 41,
      searchProfileId: 7,
      jobListingId: 11,
      stage: "preparing",
      createdAt: new Date("2026-09-14T15:00:00.000Z"),
      updatedAt: new Date("2026-09-14T15:00:00.000Z"),
    },
  };
}
