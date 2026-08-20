# ADR 0002: Versioned design system packages

## Status

Accepted on 2026-08-20.

## Decision

Job Radar uses three independently versioned workspace packages:

```text
packages/
├── design-system/
│   ├── tokens/       @job-radar/design-tokens
│   └── ui/           @job-radar/ui
└── discovery/
    └── ui/           @job-radar/discovery-ui
```

`@job-radar/design-tokens` owns the visual vocabulary: semantic colour variables,
typography, spacing, radii, shadows, and motion values. It contains no React code or
product language.

`@job-radar/ui` owns context-neutral React primitives and their states. Its public API
accepts primitive presentation values and React callbacks. It cannot import the Job
Radar application, a bounded context, React Router, SQLite, or provider code. Its
Storybook is the reference catalogue for tokens and generic components.

`@job-radar/discovery-ui` belongs to the Discovery bounded context. It composes the
generic UI around Discovery terms and view DTOs. It may depend on the two design-system
packages and browser framework libraries. It cannot import Discovery infrastructure or
construct application services.

The executable application remains the composition and delivery host. Routes map
application results and read models into the props accepted by
`@job-radar/discovery-ui`.

Design tokens are a shared technical capability, not a DDD subdomain or shared kernel.
They have no business model. Discovery UI is not a second bounded context; it is a
versioned presentation package owned by Discovery.

## Dependency direction

```text
@job-radar/design-tokens
          ↑
    @job-radar/ui
          ↑
@job-radar/discovery-ui
          ↑
      Job Radar app
```

Reverse imports are forbidden. Workspace packages expose explicit exports, and
architecture tests check source imports and package manifests.

## Versioning and releases

Changesets owns SemVer changes and changelogs. Packages are not linked or fixed, so a
token change does not force the UI packages to take the same version number. Internal
dependencies use `workspace:^`; pnpm replaces those ranges with normal SemVer ranges in
published packages.

A monorepo contains one working source version of each package. Independent adoption
starts after packages are published: another application or repository may stay on an
older compatible release while this repository develops the next version. The workspace
does not pretend to maintain two source versions of `@job-radar/ui` at once.

Publishing is opt-in. The release workflow requires an npm automation token and never
publishes from an ordinary pull request.

## Tooling

pnpm workspaces provide package discovery, strict dependency resolution, and local
linking. Changesets provides independent package versions and changelogs. Storybook uses
the React/Vite framework and lives in `@job-radar/ui` because that package owns the
context-neutral component contract.

Turbo and Nx are deferred. The current workspace has one application and three small
libraries, so recursive pnpm scripts provide the complete task graph without another
cache or project model. Add an orchestrator only when measured CI time or graph size
justifies it.

## Consequences

Package boundaries add manifests, exports, build checks, release notes, and upgrade work.
That cost is accepted because independent versioning is now a stated product-engineering
requirement. Components stay in the application until their ownership is clear; a file
is not promoted to generic UI merely because two screens look similar.
