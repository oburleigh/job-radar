# Contributing

Job Radar uses a small set of local checks so a clean checkout behaves the same
way for every contributor.

## Set up the repository

```bash
npm ci
cp .env.example .env
npm run db:setup
```

Add one supported search provider key to `.env` before running a real
discovery. The database and credentials stay local and are not committed.

## Work locally

```bash
npm run dev
npm run check
npm run build
```

Use `npm run format` for Prettier and `npm run lint:fix` for ESLint fixes. Zod is
the runtime boundary for form data and configurable provider or ATS settings.
New input paths should be parsed before values enter the domain or database
layers.

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

Husky runs lint-staged before a commit and Commitlint against the message. Run
`npm run check` before handing work off; run `npm run build` when a change can
affect the production bundle.
