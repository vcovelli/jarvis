# Jarvis Documentation

This directory is the source of truth for how Jarvis is used, built, themed, and operated. Documentation is split by audience so a user can learn the product without reading implementation details and a contributor can trace behavior without relying on old roadmap assumptions.

## Choose a guide

| Document | Audience | Purpose |
| --- | --- | --- |
| [Usage guide](./usage.md) | Users and testers | Navigation, daily workflows, every module, themes, demo mode, and sync behavior. |
| [UI and theming](./ui-and-theming.md) | Designers and frontend contributors | Theme modes, palettes, semantic tokens, interaction rules, responsive layout, and accessibility expectations. |
| [Architecture guide](./architecture.md) | Contributors and agents | Application boundaries, state flow, database models, APIs, authentication, and integrations. |
| [Deployment guide](./deployment.md) | Operators | Local setup, environment variables, migrations, builds, reverse proxying, backups, and verification. |
| [Deployment readiness](./deployment-readiness.md) | Product owners and operators | What is deployable now and what remains before open paid or packaged self-host distribution. |

Additional implementation references:

- [Jarvis Control](./admin.md) — owner bootstrap, authorization, rollout levels, feature gates, service status, and manual migration/deployment.

- [Web app README](../apps/web/README.md) — commands, project layout, environment configuration, and contributor workflow.
- [Voice and finance status/roadmap](../apps/web/docs/voice-finance-roadmap.md) — current assistant pipeline, read-only finance model, and remaining integration work.
- [`apps/web/.env.example`](../apps/web/.env.example) — canonical environment-variable template.
- [`apps/web/prisma/schema.prisma`](../apps/web/prisma/schema.prisma) — canonical database schema.

## Product mental model

Jarvis combines two persistence styles:

- Daily-life modules use a responsive local cache and synchronize one structured `UserState` document per authenticated user.
- Sensitive or query-heavy domains—finance and assistant history—use dedicated relational Prisma models and authenticated APIs.

The shell groups features into Start, Daily rhythm, Growth, Resources, and Account. On mobile, Home, Plan, Assistant, and Finances stay one tap away; More opens the complete grouped navigation.

## Documentation maintenance

When behavior changes, update the closest guide in the same change:

- User-visible workflows or navigation → `usage.md`
- Global colors, surfaces, controls, responsive spacing, or interaction behavior → `ui-and-theming.md`
- State, APIs, database models, auth, or integrations → `architecture.md`
- Configuration, commands, infrastructure, or operational behavior → `deployment.md` and `apps/web/.env.example`
- Product maturity or release blockers → `deployment-readiness.md`

Do not describe a planned feature as shipped. Document external integrations as optional.
