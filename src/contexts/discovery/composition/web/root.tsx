import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "@/contexts/discovery/presentation/web/styles.css";

import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "react-router";

import { discoveryWeb } from "@/contexts/discovery/composition/discovery-web.server";
import { AppNavigation } from "@/contexts/discovery/presentation/web/components/app-navigation";
import { DiscoveryNotifications } from "@/contexts/discovery/presentation/web/components/discovery-notifications";
import { recruiterActivityContract } from "@/contexts/recruiter-engagement/public-contract.server";

export async function loader() {
  const ui = discoveryWeb.getUiSettings();
  const activeResearchRunCount = await recruiterActivityContract.countActiveResearchRuns();
  const activeDiscoveryRunCount = discoveryWeb.countActiveDiscoveryRuns();
  return {
    activeRunCount: activeDiscoveryRunCount + activeResearchRunCount,
    discoveryNotificationDurationMs: ui.discoveryNotificationDurationMs,
    discoveryPollIntervalMs: ui.discoveryPollIntervalMs,
  };
}

export const meta = () => [
  { title: "Job Radar" },
  {
    name: "description",
    content:
      "A private opportunity catalogue for searching public job boards and reviewing evidence-ranked roles.",
  },
];

export function Layout({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script src="/theme-boot.js" />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function DiscoveryWebApplication() {
  const { activeRunCount, discoveryNotificationDurationMs, discoveryPollIntervalMs } =
    useLoaderData<typeof loader>();

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="app-shell">
        <AppNavigation activeRunCount={activeRunCount} />
        <main className="app-main" id="main-content">
          <Outlet />
        </main>
        <DiscoveryNotifications
          notificationDurationMs={discoveryNotificationDurationMs}
          pollIntervalMs={discoveryPollIntervalMs}
        />
      </div>
    </>
  );
}
