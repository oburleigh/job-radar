# Contributing

Job Radar uses a small set of local checks so a clean checkout behaves the same
way for every contributor.

## Set up the repository

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:setup
```

Add one supported search provider key to `.env` before running a real
discovery. The database and credentials stay local and are not committed.

## Work locally

```bash
pnpm dev
pnpm check
pnpm build
```

Use `pnpm format` or `pnpm lint:fix` to apply Biome fixes. Zod validates web input, vendor JSON, and
SQLite-backed configuration at the adapter that receives it. Domain factories validate values read
from persistence. Do not pass unchecked external data into application or domain code.

## Commit changes

Commit messages use this form:

```text
type(scope): short imperative summary
```

The accepted types are `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`,
`refactor`, `revert`, `style`, and `test`.

The accepted scopes are `app`, `config`, `db`, `deps`, `discovery`, `docs`,
`profiles`, `repo`, `search`, `sources`, `tests`, `tooling`, and `ui`.

Examples:

```text
feat(search): add a source-specific discovery query
fix(profiles): preserve jobs with an unknown salary
docs(repo): explain clean database setup
chore(tooling): update lint dependencies
```

Lefthook runs Biome against staged files and Commitlint against the message. It runs type checking
and unit tests before a push. Run `pnpm check`, `pnpm test:coverage`, and `pnpm test:mutation` before
handing off a production behaviour change. Run `pnpm build` when a change can affect the production
bundle.
