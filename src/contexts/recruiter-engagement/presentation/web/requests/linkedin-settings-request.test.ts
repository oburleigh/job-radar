import { describe, expect, it } from "vitest";

import { parseLinkedInSettingsRequest } from "./linkedin-settings-request";

describe("LinkedIn settings request", () => {
  it("accepts a local MCP endpoint", () => {
    const formData = new FormData();
    formData.set("mcpEndpoint", " http://localhost:8765/mcp ");

    expect(parseLinkedInSettingsRequest(formData)).toEqual({
      command: { mcpEndpoint: "http://localhost:8765/mcp" },
      ok: true,
    });
  });

  it("treats an empty endpoint as disabling the integration", () => {
    const formData = new FormData();

    expect(parseLinkedInSettingsRequest(formData)).toEqual({
      command: { mcpEndpoint: null },
      ok: true,
    });
  });

  it("rejects remote and credential-bearing endpoints", () => {
    for (const endpoint of [
      "https://linkedin-mcp.example.com/mcp",
      "http://user:password@localhost:8765/mcp",
    ]) {
      const formData = new FormData();
      formData.set("mcpEndpoint", endpoint);

      expect(parseLinkedInSettingsRequest(formData)).toEqual({
        field: "mcpEndpoint",
        message: "Enter a loopback HTTP URL such as http://127.0.0.1:8765/mcp.",
        ok: false,
      });
    }
  });
});
