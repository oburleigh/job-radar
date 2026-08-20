import type { Metadata } from "next";
import Script from "next/script";
import { connection } from "next/server";

import { getJobRadarConfig } from "@/infrastructure/config/job-radar";
import { AppNavigation } from "@/presentation/components/app-navigation";
import { DiscoveryNotifications } from "@/presentation/components/discovery-notifications";

import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Job Radar",
    template: "%s | Job Radar",
  },
  description:
    "A private opportunity catalogue for searching public job boards and reviewing evidence-ranked roles.",
};

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  const { discoveryPollIntervalMs } = getJobRadarConfig().ui;

  return (
    <html lang="en">
      <body>
        <script id="impeccable-direction-contract" type="application/json">
          {JSON.stringify(directionContract)}
        </script>
        <a className="skip-link" href="#main-content">
          Skip to opportunities
        </a>
        <div className="app-shell">
          <AppNavigation />
          <main className="app-main" id="main-content">
            {children}
          </main>
          <DiscoveryNotifications pollIntervalMs={discoveryPollIntervalMs} />
        </div>
        <Script id="theme-boot" strategy="beforeInteractive">
          {`try{const theme=localStorage.getItem("job-radar-theme");if(theme==="light"||theme==="dark"){document.documentElement.dataset.theme=theme}}catch{}`}
        </Script>
      </body>
    </html>
  );
}
