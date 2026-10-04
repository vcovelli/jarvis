# Source versions and release records

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
