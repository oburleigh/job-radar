import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { parseLoopbackHttpUrl } from "@/platform/http/loopback-http-url";
import type { LinkedInMcpToolClient } from "./linkedin-mcp-readiness";

type McpToolResult = {
  readonly isError: boolean;
  readonly structuredContent: Readonly<Record<string, unknown>> | null;
};

type McpClientConnection = {
  readonly callTool: (request: {
    readonly arguments?: Readonly<Record<string, unknown>>;
    readonly name: string;
  }) => Promise<McpToolResult>;
  readonly close: () => Promise<void>;
  readonly connect: (transport: unknown) => Promise<void>;
};

type ConnectLinkedInMcpToolClientOptions = {
  readonly endpoint: string;
  readonly createClient?: () => McpClientConnection;
  readonly createTransport?: (endpoint: URL) => unknown;
};

export async function connectLinkedInMcpToolClient({
  endpoint,
  createClient = createSdkClient,
  createTransport = (url) => new StreamableHTTPClientTransport(url),
}: ConnectLinkedInMcpToolClientOptions): Promise<LinkedInMcpToolClient> {
  const endpointUrl = parseLoopbackEndpoint(endpoint);
  const client = createClient();
  await client.connect(createTransport(endpointUrl));

  return {
    close: () => client.close(),
    async callTool(name, input) {
      const request = input === undefined ? { name } : { arguments: input, name };
      const result = await client.callTool(request);

      if (result.isError || !result.structuredContent) {
        throw new Error(`LinkedIn MCP tool ${name} did not return structured content.`);
      }

      return result.structuredContent;
    },
  };
}

function createSdkClient(): McpClientConnection {
  const client = new Client({ name: "job-radar", version: "0.1.0" });

  return {
    async callTool(request) {
      const result = await client.callTool(request);
      return {
        isError: "isError" in result && result.isError === true,
        structuredContent:
          "structuredContent" in result && isRecord(result.structuredContent)
            ? result.structuredContent
            : null,
      };
    },
    close: () => client.close(),
    connect: (transport) => client.connect(transport as Transport),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLoopbackEndpoint(value: string): URL {
  const endpoint = parseLoopbackHttpUrl(value);
  if (!endpoint) {
    throw new Error("The LinkedIn MCP endpoint must be a loopback HTTP URL.");
  }

  return endpoint;
}
