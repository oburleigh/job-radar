import { describe, expect, it, vi } from "vitest";

import { createAddJobSource } from "./use-case";

describe("add job source", () => {
  it("registers the public URL at the application clock time", () => {
    const registeredAt = new Date("2026-08-20T13:00:00.000Z");
    const register = vi.fn(() => ({ status: "board-added" as const, atsType: "greenhouse" }));
    const add = createAddJobSource({ sources: { register }, now: () => registeredAt });
    const command = { url: "https://boards.example.com/acme", companyName: "Acme" };

    expect(add(command)).toEqual({ status: "board-added", atsType: "greenhouse" });
    expect(register).toHaveBeenCalledWith(command, registeredAt);
  });
});
