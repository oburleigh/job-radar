import { describe, expect, it, vi } from "vitest";

import { connectLinkedInMcpToolClient } from "./linkedin-mcp-tool-client";

describe("LinkedIn MCP tool client", () => {
  it("connects to the configured loopback endpoint and returns structured tool output", async () => {
    const connect = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const callTool = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "ignored transport rendering" }],
      isError: false,
      structuredContent: { account_id: "personal-linkedin" },
    }));
    const sdkClient = { callTool, close, connect };
    const transport = { kind: "streamable-http" };
    const createClient = vi.fn(() => sdkClient);
    const createTransport = vi.fn(() => transport);

    const client = await connectLinkedInMcpToolClient({
      endpoint: "http://127.0.0.1:8765/mcp",
      createClient,
      createTransport,
    });

    await expect(client.callTool("linkedin.session.status", { refresh: true })).resolves.toEqual({
      account_id: "personal-linkedin",
    });
    expect(createTransport).toHaveBeenCalledWith(new URL("http://127.0.0.1:8765/mcp"));
    expect(connect).toHaveBeenCalledWith(transport);
    expect(callTool).toHaveBeenCalledWith({
      arguments: { refresh: true },
      name: "linkedin.session.status",
    });

    await client.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects MCP endpoints outside the local machine before connecting", async () => {
    const createClient = vi.fn();

    await expect(
      connectLinkedInMcpToolClient({
        endpoint: "https://linkedin-mcp.example.com/mcp",
        createClient,
        createTransport: vi.fn(),
      }),
    ).rejects.toThrow("loopback HTTP URL");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects endpoint URLs containing credentials", async () => {
    await expect(
      connectLinkedInMcpToolClient({
        endpoint: "http://user:password@localhost:8765/mcp",
        createClient: vi.fn(),
        createTransport: vi.fn(),
      }),
    ).rejects.toThrow("loopback HTTP URL");
  });

  it("fails closed when a tool does not return structured content", async () => {
    const sdkClient = {
      callTool: vi.fn(async () => ({
        content: [{ type: "text" as const, text: "raw" }],
        isError: false,
        structuredContent: null,
      })),
      close: vi.fn(async () => undefined),
      connect: vi.fn(async () => undefined),
    };
    const client = await connectLinkedInMcpToolClient({
      endpoint: "http://[::1]:8765/mcp",
      createClient: () => sdkClient,
      createTransport: () => ({ kind: "streamable-http" }),
    });

    await expect(client.callTool("linkedin.capabilities.list")).rejects.toThrow(
      "did not return structured content",
    );
  });
});
