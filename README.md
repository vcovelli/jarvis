# Jarvis OS

Jarvis is a personal operating console for reflection, planning, and review. The app helps you capture how you feel, what matters today, and what you should do next without turning the experience into a heavy productivity system.

## What this app does

At a high level, Jarvis combines:

- quick daily check-ins for mood and notes
- journal capture with prompt-driven entries
- todo planning with lightweight time blocks
- sleep logging and review patterns
- objectives and homelab action tracking

## Quick start

From the repository root:

```bash
cd apps/web
npm install
npx prisma migrate dev --name init
npm run dev
```

Then open http://localhost:3000.

## Documentation

The repository now includes a layered documentation set designed for both humans and agents:

- [docs/README.md](docs/README.md) — documentation hub
- [docs/usage.md](docs/usage.md) — shallow overview plus deeper feature walkthroughs
- [docs/architecture.md](docs/architecture.md) — how the app is structured and how data flows
- [docs/deployment.md](docs/deployment.md) — local, staging, and production deployment guidance

## App structure

```text
jarvis/
  apps/web/      # Next.js app
  docs/          # product, architecture, and deployment docs
```

## Core product areas

- Dashboard — daily mood and system check-in
- Journal — prompt-based entries
- Todos — planning and time-blocking
- Sleep — sleep logging and schedules
- Review — weekly reflection and insight
- Objectives — longer-term focus tracking
- Homelab — operational action tracking

## Deployment note

The app is built for a standard Next.js deployment with Postgres and Prisma. For the full production checklist, see [docs/deployment.md](docs/deployment.md).
