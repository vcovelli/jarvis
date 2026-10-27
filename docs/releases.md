# Source versions and release records

## 17.14.0 — memory foundation, offline intelligence and security updates, 2026-10-27

Includes Memory Engine V2/V2.2 with ownership-scoped retrieval, evidence filtering,
explicit abstention and reproducible synthetic evaluations. Adds the V18 Intelligence
Router architecture and offline policy/provider proof; the live Assistant does not
use that router yet. Existing Operations approval and execution permissions are unchanged.

Updates Next.js and its ESLint preset to 16.4.3, NextAuth to 4.24.15, React/React DOM
to 19.2.9, and compatible transitive dependencies. The prior lockfile had critical
framework/authentication findings; the updated complete dependency audit reports
zero known vulnerabilities. These are advisory results, not a guarantee of absence
of vulnerabilities. See the upstream [Next.js advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw)
and [NextAuth advisory](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-x445-f3h2-j279).

Release gates: 168 unit/regression tests, 19 disposable-database integration tests,
the existing 42-assertion memory HTTP/Chromium harness, Prisma validation/generation,
TypeScript, lint, and an isolated production build. The updated lint preset adds
React Compiler diagnostics to existing UI files; two rules remain warnings in an
explicit eight-file legacy list, with errors retained elsewhere. No UI behavior
was changed to accommodate those diagnostics.

Production rollout keeps `MEMORY_V2_ENABLED=false`, vector retrieval disabled,
embedding providers disabled, and no new memory worker/backfill or paid provider
activation. The additive `20261026120000_memory_engine_v2` migration is intentionally
pending in production; disabled memory paths retain the existing schema. Migration
and memory activation require a separate backed-up rollout. The offline intelligence
modules have no production caller.

Deploy using a separate prepared build and dependency directory, then briefly stop
only the existing `jarvis` PM2 process, preserve its prior build/dependencies, switch
the artifacts and restart. Do not execute the in-place deployment helper against the
running build. Verify the exact SHA/version, health/readiness, authentication guards,
public rendering and static assets. Keep deployment evidence and rollback artifacts
outside Git. Previous compatible release: `v17.13.0` (`9f6d843`).

## 17.13.0 — tablet layouts and agent supervision, 2026-10-25

Home and Plan use compact layouts in short desktop windows and on tablets. Plan
consolidates date controls and places the week picker behind a disclosure. The
agent roster connects current jobs, approvals, usage, permissions, and dedicated
Assistant discussions. Conversation links remain stable through reloads and chat
switching. Background execution and provider permissions are unchanged.

Validation: 97 unit tests, 17 isolated operations integration tests, lint,
TypeScript, an isolated production build, and Chromium responsive/workflow checks
passed. The reasoning integration fixture now overrides per-agent configuration
explicitly. No schema or dependency changes are required. The previous compatible
source release is `v17.12.0` (`87a4c89`). See
[verification details](tablet-agent-supervision.md).

Deployment uses the existing `jarvis` PM2 process on port 3000. A separate build is
prepared before the brief stop/switch/start, preserving the previous `.next`
directory for rollback. Exact build identity and post-deploy checks are recorded
in the protected deployment artifact directory and exposed by `/api/version`.

## 17.8.0 — versioning adoption, 2026-10-04

The existing `V17.8` label is represented as package version `17.8.0`. The original
commit `cb76bde049d0eba358117f6ef9dcafbcfe66fd3c` retains its source and commit ID;
the local annotated tag `legacy/v17.8` records that original label. Historical
package versions are not rewritten. The new `v17.8.0` source tag identifies the
commit that adopts package metadata, version checks, and source-check CI.

This update changes release tooling and documentation, not application workflows.
The package version and both lockfile version fields agree. The existing build-info
helper uses this package version unless `APP_VERSION` explicitly overrides it.
An already running process/build is not updated by this source change. Existing
`GIT_COMMIT_SHA` and `BUILD_TIMESTAMP` metadata remain operator supplied.

`npm run version:check` validates package/lockfile consistency and, on release-tag
CI runs, the tag version. The new CI workflow runs metadata validation, lint, and
unit tests; the existing credential-scanning workflow remains in place. Neither
workflow deploys the application.

Local validation on 2026-10-04: `npm run version:check` and `npm run lint` passed;
`npm test` passed all 74 tests. The version checker also rejected a deliberately
mismatched tag in an isolated process. The new GitHub workflow has not run remotely.
No build, browser, database, or provider checks were rerun for this metadata-only
update. Production services, migrations, provider settings, and deployed versions
are unchanged.

## Future releases

Use `major.minor.patch`: compatible fixes increment patch, compatible features
increment minor, and intentional incompatible changes increment major. From the
server workspace, `python3 project-ops/projects.py bump jarvis patch` previews the
increment; append `--write` to update package metadata. The tool requires a clean
checkout and never commits, pushes, or deploys.

Without the workspace tool, run
`npm version patch --no-git-tag-version --ignore-scripts` from `apps/web`, then review
the diff. Update this release record and run `npm run version:check`, lint, and tests
from that directory. Runtime changes also require `npm run verify` and appropriate
browser/integration checks in an isolated environment. Avoid rebuilding over a
running production `.next` directory.

Commit reviewed files, then create an annotated `vMAJOR.MINOR.PATCH` tag at that
commit. The workspace `tag jarvis` command previews this and `--write` applies locally.
Never move published tags. Prefer descriptive commit messages; a version number is
not required in every commit message.

At actual deployment, record the exact source commit, version, host/service,
migration state, verification, and previous compatible release. Use the existing
[deployment runbook](deployment.md); a source tag alone is not a deployment record.
