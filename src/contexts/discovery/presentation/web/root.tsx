import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "./styles.css";

import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "react-router";

import { discoveryWeb } from "../../composition/discovery-web.server";
import { AppNavigation } from "./components/app-navigation";
import { DiscoveryNotifications } from "./components/discovery-notifications";

const directionContract = {
  thesis: "Job Radar is an opportunity catalogue, not a generic dashboard of cards.",
  world:
    "Bone paper, navy ink, cobalt index tabs, persimmon actions, compressed display type, and ruled records.",
  story:
    "Start discovery, understand its coverage, inspect evidence-ranked roles, and record decisions without losing context.",
  firstViewport:
    "A numbered page thesis and discovery command lead into a compact evidence strip, filter index, and opportunity ledger.",
  form: "Contemporary library finding aid, concept seed f555f182.",
  finish:
    "unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md",
};

export function loader() {
  return { discoveryPollIntervalMs: discoveryWeb.getUiSettings().discoveryPollIntervalMs };
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
    <html lang="en">
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
  const { discoveryPollIntervalMs } = useLoaderData<typeof loader>();

  return (
    <>
      <script id="impeccable-direction-contract" type="application/json">
        {JSON.stringify(directionContract)}
      </script>
      <a className="skip-link" href="#main-content">
        Skip to opportunities
      </a>
      <div className="app-shell">
        <AppNavigation />
        <main className="app-main" id="main-content">
          <Outlet />
        </main>
        <DiscoveryNotifications pollIntervalMs={discoveryPollIntervalMs} />
      </div>
    </>
  );
}
