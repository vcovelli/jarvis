# Deployment Readiness

Status date: 2026-09-06

## Shallow status

Jarvis OS is structurally close to a deployable personal SaaS: the app builds, authenticated `/v2` routes are session-protected, the main persisted records are keyed by `userId`, and the product has enough surface area to support a paid positioning.

It is not yet ready for open paid signups. The missing pieces are commercial gates, account recovery, email verification, abuse controls, operational monitoring, backup/restore runbooks, and a clearer self-host license package.

## Verified today

- `npm test` passes.
- `npm run lint` passes.
- `npm run build` passes.
- Production build root is pinned in `next.config.ts` with `turbopack.root`.
- Public registration can be closed with `REGISTRATION_DISABLED=true`.
- Public registration can require a shared access code with `REGISTRATION_ACCESS_CODE`.

## Multi-user readiness

The core architecture supports multiple private users because:

- `/v2` is protected by `getServerSession`.
- The primary JSON workspace state is stored in `UserState` with one record per `userId`.
- Finance, assistant, manual positions, conversations, and memory tables include `userId` ownership.
- Most API routes derive ownership from the session user instead of accepting user ids from the client.
- User deletion cascades through related data.

The current gaps before public launch are:

- No email verification.
- No password reset flow.
- No brute-force or per-IP rate limiting.
- No payment-backed entitlement model.
- No admin console for support, account status, refunds, or disabling accounts.
- No export/import flow for user-owned data.
- No formal privacy policy, terms, or data retention statement.

## Payment readiness

The app can present a hosted monthly offer now, but it should not collect payment until entitlement checks exist in the product.

Minimum payment model:

- Add `Subscription` or `Entitlement` records tied to `userId`.
- Add checkout and customer portal routes.
- Gate hosted registration behind payment, invite, or access code.
- Enforce entitlement checks in `/v2` layout and paid API routes.
- Add cancellation states, grace periods, and read-only expired account behavior.

## Self-host readiness

The technical stack is self-hostable: Next.js, Prisma, Postgres, and environment variables are standard. The saleable self-host package still needs:

- License terms outside the codebase.
- A self-host install guide with Node, Postgres, migration, backup, and update steps.
- Optional Docker Compose for buyers who do not want to assemble services manually.
- A clear support boundary for third-party integrations such as Plaid, OpenAI, Prometheus, Grafana, and listing providers.
- A data export/import path so a hosted customer can migrate to self-hosting.
- Versioned release notes and upgrade instructions.

## Recommended order

1. Keep public registration access-code gated until billing is implemented.
2. Add payment entitlement tables and route guards.
3. Add password reset and email verification.
4. Add rate limiting around auth, assistant, transcription, listing, and finance sync routes.
5. Add observability, backups, and deployment health checks.
6. Package self-host docs and Docker Compose.
7. Add user export/import.
8. Run browser smoke tests for registration, login, first check-in, sync, finance demo mode, and account deletion.
