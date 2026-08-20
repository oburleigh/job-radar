import { describe, expect, it } from "vitest";

import { createAddJobSource } from "./use-case";

describe("add job source", () => {
  it("registers the public URL at the application clock time", () => {
    const registeredAt = new Date("2026-08-20T13:00:00.000Z");
    const registrations: { command: { url: string; companyName: string }; at: Date }[] = [];
    const add = createAddJobSource({
      sources: {
        register(command, at) {
          registrations.push({ command, at });
          return { status: "board-added", atsType: "greenhouse" };
        },
      },
      now: () => registeredAt,
    });
    const command = { url: "https://boards.example.com/acme", companyName: "Acme" };

    expect(add(command)).toEqual({ status: "board-added", atsType: "greenhouse" });
    expect(registrations).toEqual([{ command, at: registeredAt }]);
  });
});
