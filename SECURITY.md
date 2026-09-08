# Security

## Reporting a vulnerability

Report a suspected vulnerability privately through GitHub's
[private vulnerability reporting](https://github.com/oburleigh/job-radar/security/advisories/new)
rather than opening a public issue. Include what you did, what happened, and the
version or commit you were on.

Expect an acknowledgement within a few days. This is a personal project with no
paid support, so there is no guaranteed response or fix time.

## What this project is

Job Radar runs locally, for one person, against a SQLite file on that machine.
It has no accounts, no multi-tenancy, and no authentication layer, and it is not
built to be exposed to a network. Running it on a public interface puts your
local database and your provider API keys within reach of anyone who can connect
to it.

## Secrets

API keys live in `.env`, which is gitignored. `.env.example` names every variable
the application reads and contains no credentials. Keys are never written to SQLite, to
source files, to test fixtures, or to client components.

If you believe a key has been exposed, revoke it with the provider first, then
report the exposure.

## Outbound requests

The application talks to the web search provider you configure, to the public ATS
endpoints of the sources you enable, and to the Codex CLI installed on your own
machine. It sends no telemetry and reports nothing to the author.
