#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
if (value("-m") === "fixture-advisor-failure") {
  process.stderr.write("Fixture Advisor unavailable.");
  process.exit(1);
}
const schema = JSON.parse(readFileSync(value("--output-schema"), "utf8"));
if ("supported" in schema.properties) {
  writeFileSync(value("-o"), JSON.stringify({ supported: true }));
  process.exit(0);
}
const instructions = args.at(-1);
const planning = "publicPeople" in schema.properties;
const opportunity = planning
  ? JSON.parse(
      instructions
        .split("\n")
        .find((line) => line.startsWith("Opportunity: "))
        .slice(13),
    )
  : null;
const sourceUrl = planning
  ? opportunity.canonicalUrl
  : instructions
      .split("\n")
      .find((line) => line.startsWith("Listing URL: "))
      .slice(13);
const title = planning
  ? opportunity.title
  : instructions
      .split("\n")
      .find((line) => line.startsWith("Role: "))
      .slice(6);
const reply = planning
  ? {
      summary: "Review the listing before choosing a relationship path.",
      prospectReferences: [],
      publicPeople: [],
      recommendations: [
        {
          title: "Review the employer listing",
          reason: "Confirm the role before outreach.",
          evidenceUrls: [sourceUrl],
        },
        {
          title: "Prepare a role question",
          reason: "Use the advertised role to guide a conversation.",
          evidenceUrls: [sourceUrl],
        },
      ],
    }
  : {
      summary: {
        text: "The listing advertises an engineering leadership role.",
        evidenceUrls: [sourceUrl],
      },
      strengths: [
        { text: "The advertised title is Head of Engineering.", evidenceUrls: [sourceUrl] },
      ],
      gaps: [
        {
          text: "Clarify the responsibilities behind the advertised title.",
          evidenceUrls: [sourceUrl],
        },
      ],
      evidence: [{ sourceUrl, excerpt: title }],
      recommendations: [],
    };
writeFileSync(value("-o"), JSON.stringify(reply));
