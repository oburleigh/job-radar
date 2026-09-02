import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { DISCOVERY_NOTICE_REGION_LABEL, DiscoveryNotifications } from "./discovery-notifications";

/**
 * The browser journey located this landmark by name. It was sonner's default,
 * "Notifications alt+T", so the locator matched nothing, two absence assertions passed
 * vacuously and the one real assertion could never pass. This fails in milliseconds
 * instead of after a three-minute browser run.
 */

describe("discovery notification region", () => {
  it("names the landmark after what it holds, not after a library default", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: <DiscoveryNotifications notificationDurationMs={4_000} pollIntervalMs={1_000} />,
      },
    ]);

    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(html).toMatch(
      new RegExp(`<section[^>]*aria-label="${DISCOVERY_NOTICE_REGION_LABEL}[^"]*"`),
    );
    expect(DISCOVERY_NOTICE_REGION_LABEL).toBe("Discovery status");
    expect(html).not.toContain("Notifications alt+T");
  });
});
