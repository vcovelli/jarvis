# Web app README

This is the web application for Jarvis. It is a Next.js app using the App Router, TypeScript, Prisma, and NextAuth.

## Quick start

```bash
npm install
npx prisma migrate dev --name init
npm run dev
```

Open http://localhost:3000.

## Required environment variables

Create an environment file from the example and fill in the values:

```bash
cp .env.example .env
```

Required variables:

- DATABASE_URL
- NEXTAUTH_URL
- NEXTAUTH_SECRET

## Main areas

- dashboard and daily check-in
- journal
- todos and planning
- sleep logging
- review and reflections
- account and auth flows

## Related documentation

- [../../README.md](../../README.md) — repository overview
- [../../docs/usage.md](../../docs/usage.md) — how to use the app
- [../../docs/architecture.md](../../docs/architecture.md) — implementation details
- [../../docs/deployment.md](../../docs/deployment.md) — deployment guidance
