# Jarvis OS

Jarvis is a private, personal operating console for planning, reflection, health signals, goals, financial awareness, and lightweight systems tracking. It is designed around a quick daily loop: decide what must win, capture the day, do the work, and review the pattern.

The current product is a responsive Next.js application with credentials-based accounts, local-first interaction, authenticated Postgres synchronization, installable PWA behavior, and optional assistant, finance, real-estate, and homelab integrations.

## Product areas

- **Start:** Home, Plan, and Assistant.
- **Daily rhythm:** Must Win, Habits, Mood, Journal, and Sleep.
- **Growth:** Focus, Objectives, Review, Fitness, and Career.
- **Resources:** Finances, Real Estate, Homelab, and the homelab Docs browser.
- **Account:** Platform settings, themes, password management, and account deletion.

Focus, Fitness, Career, and the unlisted Manufacturing route are currently product briefs rather than complete trackers. Finance is read-only: Jarvis can organize and analyze connected data, but it cannot move money.

## Stack

- Next.js 16 App Router, React 19, and TypeScript
- Tailwind CSS 4 plus semantic theme tokens
- NextAuth credentials authentication with JWT sessions
- Prisma 5 and PostgreSQL
- Optional OpenClaw, OpenAI, Plaid, RentCast, Prometheus, Grafana, and filesystem-backed homelab docs

## Quick start

Requirements: Node.js 20.9 or newer, npm, and PostgreSQL.

```bash
cd apps/web
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev
```

Set `DATABASE_URL`, `NEXTAUTH_URL`, and `NEXTAUTH_SECRET` in `.env`, then open [http://localhost:3000](http://localhost:3000). Optional integrations can remain unset; their pages either degrade gracefully or provide demo data.

Before handing off a change, run:

```bash
npm run verify
```

## Repository map

```text
jarvis/
├── apps/web/                 # Application, API routes, Prisma schema, and app-specific docs
│   ├── prisma/               # Database schema and versioned migrations
│   └── src/                  # App Router pages, components, state, and integrations
└── docs/                     # Product, UI, architecture, deployment, and readiness guides
```

## Documentation

- [Documentation hub](docs/README.md)
- [User guide](docs/usage.md)
- [UI and theming](docs/ui-and-theming.md)
- [Architecture](docs/architecture.md)
- [Deployment runbook](docs/deployment.md)
- [Deployment readiness](docs/deployment-readiness.md)
- [Web developer reference](apps/web/README.md)
- [Voice and finance status/roadmap](apps/web/docs/voice-finance-roadmap.md)

## Current deployment posture

Jarvis is suitable for controlled personal or invited-user deployment. Recovery, optional email verification, route rate limits, security headers, audit events, health/readiness checks, backups, signed Plaid webhooks, scheduled finance sync, export, session revocation, and entitlement records now have an application foundation. Keep registration disabled, access-code gated, or invitation-only until the target host's mail, proxy, backup, scheduler, monitoring, and smoke tests are complete. Billing and public-SaaS policy/support work remain out of scope; see [deployment readiness](docs/deployment-readiness.md).
