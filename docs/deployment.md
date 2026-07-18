# Deployment Guide

## Shallow overview

The app is a Next.js application that can be deployed on services like Vercel, Railway, Render, or a self-managed server. The main production requirements are:

- a Postgres database
- a valid environment configuration
- a way to run Prisma migrations
- a long random NextAuth secret

## Shallow deployment checklist

1. Provision a Postgres database.
2. Set the environment variables for the app.
3. Run Prisma migrations.
4. Build and deploy the web app.
5. Verify login, registration, and state persistence in production.

## Deep dive

### 1. Required environment variables

The app expects the following values in the web app environment:

- DATABASE_URL — the Postgres connection string
- NEXTAUTH_URL — the public base URL of the deployment
- NEXTAUTH_SECRET — a strong random secret

A sample configuration is already provided in the app environment file.

### 2. Database migration flow

The app uses Prisma migrations. For local development, the standard flow is:

```bash
npx prisma migrate dev --name init
```

In production, the deployment should use:

```bash
npx prisma migrate deploy
```

That ensures the schema is applied in the target environment before the application starts serving requests.

### 3. Build and runtime expectations

The web app is built with Next.js. A typical production build looks like this:

```bash
npm run build
```

Then the server can be started with:

```bash
npm run start
```

If you are deploying to Vercel, the platform will handle the build automatically once the project is connected and the environment variables are configured.

### 4. Authentication considerations

NextAuth requires a stable public URL and a shared secret. In development, local URLs are fine. In production, the values must match the real deployment domain.

If the app is behind a proxy, confirm that the forwarded host and protocol are handled correctly so auth callbacks and session cookies work as expected.

### 5. Production hardening

A production deployment should also think about:

- secure secret storage
- database backups
- server-side logging
- monitoring for failed auth and failed state writes
- making sure migrations run before the app serves traffic

### 6. Deployment recommendation

For this project, the easiest path is:

- host the Next.js app on Vercel
- host Postgres on a managed service such as Neon, Railway, or Supabase
- set environment variables in the deployment dashboard
- run Prisma migrations as part of the deployment process

This keeps the deployment model simple while still giving you a durable and production-ready setup.
