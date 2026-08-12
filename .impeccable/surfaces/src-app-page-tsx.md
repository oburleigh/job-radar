---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets:
  ["src/app/layout.tsx", "src/components/app-navigation.tsx", "src/components/job-card.tsx"]
---

# Jobs workspace and application shell

Mode: Operate. This brief covers the shared shell and the jobs workspace, with the other routes inheriting the same catalogue system.

The user is an individual running a private job search from a local database. They need to start discovery, understand what was searched, inspect ranked roles, and move a role into saved, applied, or hidden without losing context.

The chosen direction is a contemporary library finding aid. Navigation reads as a compact catalogue index. Jobs are evidence-rich records rather than interchangeable cards. Runs form an audit ledger, while profiles, sources, and settings use workbench layouts.

The memorable moment is the first viewport: a strong page thesis and discovery command area lead directly into a ruled opportunity catalogue. The approved composition is `.impeccable/mocks/jobs-catalogue-approved.png`.

The build uses bone white, navy ink, cobalt navigation, and persimmon actions. It uses compressed display type, practical UI type, square-to-lightly-rounded controls, one-pixel rules, flat surfaces, and high information density. The real product content and controls stay semantic HTML and CSS. Icons remain Lucide. No image assets are needed in the interface.

Do not invent analytics, scheduling, pagination, export, user accounts, or source counts. Keep the current server actions, query parameters, local SQLite behavior, and all empty and error states.
