# Deployment Readiness

Status date: 2026-09-06

## Current recommendation

Jarvis is ready for a controlled personal, homelab, or invited-user deployment after environment-specific smoke testing. It is not ready for open paid registration or a supportable mass-market self-host package.

The application has a production build path, authenticated workspaces, per-user data ownership, registration gates, account/password controls, local-first synchronization, and optional integrations. The remaining risk is concentrated in account recovery, abuse prevention, commercial entitlement, operations, policy, and packaging rather than the basic app shell.

## Verified in this repository

- `npm run verify` covers ESLint, the configured Node test suite, and a production Next.js build.
- `/v2` is protected at the server layout with `getServerSession`.
- Registration can be disabled or protected by a shared access code.
- Core workspace records synchronize per `userId` with ETag conflict detection.
- Mood, mood-tag, and todo deletions use tombstones during cross-device merges.
- Finance and assistant records are relational and user-owned.
- Plaid tokens are encrypted at rest and omitted from dashboard responses.
- Account deletion cascades through user-owned relational data.
- Demo mode isolates generated showcase state from personal workspace state and live finance data.
- The PWA manifest, standalone display mode, safe-area handling, and responsive navigation are present.

The configured automated test script is still narrow: it currently targets finance classification and registration logic. A passing build is not a substitute for browser and integration testing.

## Suitable today

- A single owner on a private host
- A small access-code-gated preview
- A managed database plus conventional Node host
- Demonstrations using the isolated demo workspace
- Read-only Plaid sandbox/development evaluation
- A host-local homelab console where filesystem and private-network access are intentional

## Multi-user and security gaps

The ownership model supports multiple private users, but public exposure still needs:

- verified email ownership
- password reset and recovery
- brute-force, per-user, and per-IP rate limiting
- stronger access-code lifecycle and invite management
- session/device management and revocation controls
- administrator tools for disabling or supporting accounts
- user data export/import and an explicit retention/deletion policy
- security headers and deployment-specific content security policy review
- audit logging for sensitive account and finance operations
- formal privacy policy and terms

Treat assistant, transcription, live listings, finance sync, login, and registration as rate-limit priorities.

## Payment readiness

The landing page can describe hosted and self-hosted options, but the app should not collect payment until authorization is backed by an entitlement model.

Minimum hosted commerce work:

1. Add `Subscription` or `Entitlement` records tied to `userId`.
2. Add verified checkout and customer-portal flows plus signed webhooks.
3. Gate registration or workspace activation behind an invite or valid entitlement.
4. Enforce entitlement server-side in the `/v2` layout and paid APIs.
5. Define trials, cancellation, grace periods, failed payment, refunds, and read-only expiration behavior.
6. Add admin/support tooling and reconciliation jobs.

No current route should be described as payment-gated.

## Optional integration gaps

- **Plaid:** no webhook receiver or scheduled/background synchronization; the configured webhook URL is only passed to Plaid Link. Production access and provider compliance are separate launch requirements.
- **OpenClaw:** assumes a reachable gateway and local credential/device configuration; deployment health and availability need monitoring.
- **OpenAI:** usage budgets, rate limits, and privacy disclosures are not implemented as a product layer.
- **RentCast:** the cache and monthly usage ledger are local files, so quota enforcement is not reliable across ephemeral or multi-instance hosts.
- **Homelab:** current default paths, service definitions, and URLs are deployment-specific and must be overridden or generalized.

## Self-host package gaps

The stack is self-hostable, but a saleable distribution still needs:

- license terms and release artifacts
- Docker Compose or an equally explicit supported install path
- health endpoints and an operations dashboard/runbook
- automated backup/restore instructions and a tested upgrade path
- supported configuration profiles that do not assume the original homelab
- documented external-integration support boundaries
- versioned release notes, schema compatibility notes, and rollback policy
- export/import for migration between hosted and self-hosted installations

## Release gate

For each controlled deployment:

1. Run `npm run verify` from `apps/web`.
2. Apply `npm run prisma:migrate:deploy` against the target database.
3. Confirm HTTPS, `NEXTAUTH_URL`, secret persistence, and registration policy.
4. Run the browser smoke checklist in [deployment.md](./deployment.md).
5. Verify a database backup and restore procedure.
6. Verify every enabled optional integration from the application host.

## Recommended work order

1. Keep registration disabled or access-code gated.
2. Add rate limiting and security/operations telemetry.
3. Add password recovery and email verification.
4. Expand reducer, sync-conflict, route-authorization, and browser coverage.
5. Add database backup automation and a rehearsed restore runbook.
6. Add payment entitlements before accepting subscriptions.
7. Replace host-local provider quotas with shared durable controls.
8. Add user export/import and formal product policies.
9. Package and test the supported self-host installation and upgrade path.
