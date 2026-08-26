# Job Radar release management design

- **Status:** Draft for review
- **Parent issue:** ADM-31
- **Decision owner:** Oli Burleigh
- **Date:** 2026-08-26

## Purpose

Job Radar needs a release process that can be proved while the GitHub repository remains private,
then carried into a public repository without changing the versioning model. Releases must be
reviewable, use Semantic Versioning, produce a maintained changelog, and support release candidate
tags such as `v0.1.0-rc.1`.

The release process covers one deployable application. Packages under `apps/` and `packages/` are
parts of that application and do not have independent release streams.

## Current state

The root package is private and declares version `0.1.0`. Conventional Commit messages are already
checked by Commitlint, and GitHub Actions are checked for pinned action revisions. There are no Git
tags, GitHub Releases, release workflow, Release Please configuration, or tracked changelog.

The GitHub repository is private. It will stay private throughout implementation and calibration.
Changing repository visibility is a separate, manual launch action.

## Goals

- Keep one Semantic Version for the Job Radar application.
- Derive release proposals from reviewed Conventional Commit signals.
- Put every version and changelog change in a release pull request.
- Support optional release candidates from a passing release pull request.
- Keep stable tags and releases under human control.
- Establish Apache-2.0 licensing under Oli Burleigh's name.
- Make the release mechanism testable without package publication or deployment credentials.
- Create focused Linear backlog items for publication safety, repository presentation, agent advice,
  and the eventual `1.0.0` contract.

## Non-goals

- Changing the repository from private to public.
- Publishing any workspace package to npm.
- Deploying Job Radar or coupling releases to Cloudflare work.
- Giving an agent permission to tag, release, merge, or change repository settings.
- Independently versioning design tokens, UI components, or documentation applications.
- Replacing the existing quality workflows.
- Releasing `v0.1.0` before the private publication gate is approved.

## Release contract

Semantic Versioning applies to the behavior that users and operators rely on. Job Radar's versioned
contract includes:

- SQLite schema compatibility and automated migration behavior;
- environment variable names, meanings, and safe defaults;
- CLI command names, inputs, exit behavior, and durable output consumed by people or automation;
- saved profile, source, job, match, and run-history behavior;
- documented local setup and supported runtime versions;
- user workflows whose removal or incompatible replacement requires intervention.

Internal TypeScript modules, CSS structure, test helpers, and database implementation details are not
public contracts unless a documented consumer starts relying on them.

### Versions below 1.0.0

Job Radar remains in initial development until the `1.0.0` compatibility contract is accepted.
Before that point:

| Change | Conventional signal | Version result |
| --- | --- | --- |
| Compatible correction | `fix(scope):` | Patch |
| Compatible feature | `feat(scope):` | Patch |
| Incompatible contract change | `type(scope)!:` or `BREAKING CHANGE:` | Minor |
| Maintenance without product impact | `build`, `chore`, `ci`, `docs`, `refactor`, `style`, `test` | No release |

A shipped performance correction uses `fix(scope):` so it produces a patch. `perf(scope):` remains
available for measurement and implementation work that does not itself require a release.

After `1.0.0`, a compatible feature increments the minor version and an incompatible contract change
increments the major version.

## Change signal

Each product pull request carries one release signal in its Conventional Commit title. The target
GitHub configuration will allow squash merging so the reviewed pull request title becomes the commit
that Release Please reads on `main`.

The pull request template records:

- change type: `none`, `fix`, `feature`, or `breaking`;
- resolved version bump under the current pre-1.0 policy;
- one user-facing changelog summary;
- affected release-contract surfaces;
- migration or operator action, or `None`;
- the reason when the declared impact is `none`.

The title remains the deterministic input to Release Please. The template gives reviewers the
evidence needed to validate that title. Agent assessment is advisory and belongs to a later story.

## Release Please workflow

Release Please Action v5.0.0 will be pinned to its full reviewed commit SHA. The workflow runs after a
push to `main` and supports manual dispatch for recovery. It uses a concurrency group that permits one
release operation for `main` at a time.

The workflow uses the manifest configuration for one package at `.` with the Node release strategy.
The package configuration will:

- update the root `package.json` and `CHANGELOG.md`;
- use tags in the form `vX.Y.Z` without a component prefix;
- map breaking changes to a minor bump below `1.0.0`;
- map features to a patch bump below `1.0.0`;
- exclude hidden maintenance sections from public release notes where they do not help users;
- open one release pull request against `main`.

The initial manifest is bootstrapped from
`25a443717576c722ed3620eb2ded0c24fad79d83`. The first release pull request therefore describes the
known-board-first and live-progress work that followed that commit, rather than replaying the whole
repository history.

The workflow starts with the repository `GITHUB_TOKEN`. Job permissions are declared explicitly. The
release job receives only the write permissions Release Please needs for contents, pull requests, and
its lifecycle labels. No personal access token is added during the foundation.

If GitHub requires approval before checks run on an automation-created release pull request, the
maintainer approves those checks manually. Replacing this with a GitHub App installation token needs a
separate decision.

### Stable release

Merging an ordinary product pull request never creates a tag. Release Please opens or updates the
release pull request instead.

Merging the release pull request creates the stable `vX.Y.Z` tag and a GitHub Release from the reviewed
release notes. Branch protection and the release pull request remain the human approval boundary.

## Release candidates

Release candidates are optional. A patch release may go directly to stable. A maintainer can create an
RC when installation, migration, or acceptance testing is useful before the stable release.

The `Create release candidate` workflow is manually dispatched with a release pull request number. It
does not accept a version, tag, branch, or commit from the caller.

Before writing anything, it confirms that:

1. the pull request is open in `oburleigh/job-radar`;
2. its base branch is `main` and its head belongs to the same repository;
3. it is the active Release Please pull request;
4. all configured release-gate checks have completed successfully;
5. the release manifest at the pull request head contains one valid proposed version;
6. the proposed version matches the release pull request metadata;
7. the target is the exact pull request head commit;
8. no stable release already exists for that version.

The workflow lists existing tags for the proposed version and selects one greater than the highest
existing `rc.N`. With no candidates it creates `rc.1`; after `rc.1` and `rc.2` it creates `rc.3`.
Malformed suffixes do not participate in the counter.

The resulting tag is `vX.Y.Z-rc.N`. GitHub records it as a prerelease targeted at the reviewed release
pull request commit. Its notes name the source release pull request and candidate commit.

If the release pull request changes after an RC, the old candidate remains immutable and is considered
superseded. A new dispatch creates the next candidate against the new head. No workflow force-updates
or deletes a tag.

### RC failure and recovery

Validation failures occur before tag or release creation. The workflow reports the failed condition and
makes no change.

Candidate creation must reconcile these states:

- neither tag nor prerelease exists: create the candidate;
- both exist for the expected commit: report the existing candidate without changing it;
- a tag exists without its prerelease: create the missing prerelease for that tag;
- a prerelease or tag points to another commit: stop and require manual investigation.

The workflow never skips an unexplained candidate number and never overwrites an existing reference.

## Repository artifacts

The foundation adds:

- `LICENSE`, containing Apache License 2.0;
- `NOTICE`, naming Oli Burleigh as the copyright holder;
- this release design and a shorter operator-facing release guide;
- `release-please-config.json`;
- `.release-please-manifest.json`;
- `.github/workflows/release.yml`;
- `.github/workflows/release-candidate.yml`;
- `.github/pull_request_template.md`;
- release-policy validation and RC planning code with behavior tests;
- contributor guidance for release titles, impact declarations, and squash merges;
- `CHANGELOG.md`, owned by Release Please after bootstrap.

Workflow configuration stays in `.github`. Deterministic validation and candidate planning code stays
under `scripts/`, alongside the existing GitHub Actions policy check. It must keep GitHub API access at
the boundary so version and validation rules can be tested without network calls.

## Security boundary

The release workflows run only from the default branch. Pull request code cannot replace the trusted
workflow before it receives write permissions. The RC workflow reads the proposed manifest through the
GitHub API and never executes or sources code from the release pull request while holding write
permission.

Every third-party action uses a full commit SHA and a release-version comment. Workflow permissions are
set per job. Release credentials are not passed to build or test jobs, and the release jobs do not load
provider keys, personal data, or the local SQLite database.

RC creation uses a read-only validation job followed by a narrow contents-write job. The second job
receives only validated scalar outputs such as pull request number, commit SHA, version, and candidate
number. It fetches trusted implementation code from the default branch and does not pass an
unrestricted credential through artifacts.

## Verification

### Behavior tests

Tests cover:

- pre-1.0 release impact mapping;
- valid and invalid release manifest shapes;
- release pull request ownership, base, state, and lifecycle label validation;
- candidate-number selection with missing, sequential, and malformed tags;
- changed release pull request heads after an earlier candidate;
- existing tag and prerelease reconciliation;
- rejection of mismatched commits and an existing stable release.

### Repository tests

Architecture tests assert:

- one release package at the repository root;
- exact pre-1.0 options;
- `v`-prefixed, component-free tags;
- explicit workflow permissions and concurrency;
- manual-only RC creation;
- full action SHA pins with release comments;
- no npm publication or deployment step;
- the release workflows do not receive provider secrets.

### Required gates

The final implementation tree runs:

```bash
pnpm lint
pnpm typecheck
pnpm test
PLAYWRIGHT_USE_SYSTEM_CHROME=1 pnpm test:e2e
pnpm build
```

Focused mutation testing applies to new deterministic release-policy code when Stryker can reach it.
Workflow wiring uses architecture tests, actionlint, a private GitHub run, and API outcome inspection as
the proportionate evidence.

An independent Claude Opus review runs from the repository root under the review contract in
`AGENTS.md`. The lead reproduces every load-bearing finding before accepting the result.

## Private rollout

1. Merge the verified foundation pull request while the repository remains private.
2. Confirm that Release Please opens the expected `v0.1.0` release pull request.
3. Approve and run every required check on that pull request.
4. Inspect the proposed version, manifest update, changelog, and release notes.
5. Dispatch `Create release candidate` for the release pull request.
6. Confirm that `v0.1.0-rc.1` points to its reviewed head and is marked as a prerelease.
7. Exercise the candidate through the clean-clone and application quality gates.
8. Leave the stable release pull request unmerged until the publication-safety and launch stories pass.

The repository remains private if any step fails. A failed rollout is diagnosed without deleting or
moving release references.

## Backlog structure

ADM-31 remains the parent publication outcome. The approved child stories are:

1. Maintainer gets reviewable semantic release proposals and optional RC tags. This is the first
   implementation slice described by this specification.
2. Local agent assesses release impact before a pull request. The result is advisory and includes the
   change type, resolved version bump, contract evidence, and proposed changelog text.
3. GitHub reviews declared release impact. A read-only agent comments on disagreement and cannot tag,
   release, merge, or modify code.
4. Maintainer proves the repository is safe to publish. This covers tracked files, history, secrets,
   databases, personal data, generated reports, security policy, CodeQL, secret scanning, Dependabot,
   CODEOWNERS, and community files.
5. Visitor understands Job Radar from the repository landing page. This covers synthetic screenshots,
   concise positioning, privacy and architecture summaries, roadmap status, badges, topics, and GitHub
   metadata.
6. Maintainer publishes the verified private `v0.1.0` release. This requires a green RC, branch
   protection, publication-safety evidence, repository settings, and final review before visibility can
   change.
7. Maintainer declares the `1.0.0` compatibility contract. This settles stable database,
   configuration, CLI, and operator guarantees before standard major/minor/patch semantics begin.

ADM-152 will move from the sandbox project to Job Radar, become a child of ADM-31, and be rewritten as
the GitHub settings and safeguards story. This avoids a duplicate and removes claims that do not match
the current repository.

## Acceptance criteria

- The release mechanism owns one root application version.
- A normal product merge can update a release pull request but cannot tag or publish directly.
- A reviewed release pull request shows the proposed version, changelog, and release notes.
- The pre-1.0 mapping is documented and checked by tests.
- An RC request derives its version and commit from a passing release pull request.
- RC tags use `vX.Y.Z-rc.N`, increment without overwriting, and create GitHub prereleases.
- Stable release creation remains a separate human-approved release pull request merge.
- Workflows use explicit minimal permissions and pinned actions.
- Apache-2.0 licensing names Oli Burleigh.
- The repository stays private throughout foundation implementation and calibration.
- The private rollout proves the release pull request and first RC before the stable release is allowed.
- The next-stage work is represented in Linear without duplicating ADM-152.

## References

- [Semantic Versioning 2.0.0](https://semver.org/)
- [Release Please](https://github.com/googleapis/release-please)
- [Release Please manifest configuration](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md)
- [Release Please Action v5.0.0](https://github.com/googleapis/release-please-action/releases/tag/v5.0.0)
- [GitHub Actions security hardening](https://docs.github.com/en/code-security/tutorials/secure-your-organization/protect-against-threats)
