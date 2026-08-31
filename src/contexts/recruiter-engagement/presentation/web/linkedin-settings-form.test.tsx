import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { LinkedInSettingsForm } from "./linkedin-settings-form";

describe("LinkedIn settings form", () => {
  it("shows an unconfigured local MCP adapter without asking for LinkedIn credentials", () => {
    const html = renderForm({ mcpEndpoint: null }, null);

    expect(html).toContain("LinkedIn MCP");
    expect(html).toContain("Not configured");
    expect(html).toContain('name="mcpEndpoint" value=""');
    expect(html).toContain("127.0.0.1");
    expect(html).not.toContain("Password");
    expect(html).not.toContain("Email address");
  });

  it("shows the account and separately reports search, connect, and message readiness", () => {
    const html = renderForm(
      { mcpEndpoint: "http://127.0.0.1:8765/mcp" },
      {
        accountId: "personal-linkedin",
        capabilities: { connect: false, message: true, search: true },
        message: "LinkedIn is ready for Recruiter Search.",
        status: "ready",
      },
    );

    expect(html).toContain("Ready");
    expect(html).toContain("personal-linkedin");
    expect(html).toMatch(/Search[\s\S]*Available/);
    expect(html).toMatch(/Connect[\s\S]*Unavailable/);
    expect(html).toMatch(/Message[\s\S]*Available/);
  });
});

function renderForm(
  settings: { readonly mcpEndpoint: string | null },
  readiness: Parameters<typeof LinkedInSettingsForm>[0]["readiness"],
) {
  const router = createMemoryRouter([
    {
      path: "/",
      element: <LinkedInSettingsForm readiness={readiness} settings={settings} />,
    },
  ]);
  return renderToStaticMarkup(<RouterProvider router={router} />);
}
