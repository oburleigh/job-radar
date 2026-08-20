# Package ownership

Every leaf below `packages/` is a real pnpm workspace package with its own public exports,
version, build, and tests.

```text
packages/
├── design-system/
│   ├── tokens/       semantic visual values only
│   └── ui/           context-neutral React components and Storybook
└── discovery/
    └── ui/           Discovery-specific presentation components
```

Put a value in `design-system/tokens` when it describes the shared visual language and
has no product meaning. Put a component in `design-system/ui` when its props make sense
without knowing what Job Radar does. Put Discovery language, workflow states, routes,
and view DTOs in `discovery/ui`.

Do not add `shared`, `common`, `helpers`, or package-per-component folders. A new package
needs an independent public contract, release reason, and owner.

Changes to a published contract require a Changeset:

```bash
pnpm changeset
```

Build and inspect all packages from the repository root:

```bash
pnpm packages:build
pnpm storybook
pnpm storybook:build
```
