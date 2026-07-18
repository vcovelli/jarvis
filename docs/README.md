# Documentation Hub

This folder is the long-form companion to the repository README files. Each document starts with a shallow overview and then moves into deeper implementation detail.

## Start here

- [Usage guide](./usage.md) — how to use the app day to day.
- [Architecture guide](./architecture.md) — how the app is structured and how data flows.
- [Deployment guide](./deployment.md) — how to run it locally, ship it, and keep it healthy in production.

## Recommended reading order

1. Read the usage guide if you want to understand the product experience.
2. Read the architecture guide if you want to modify or extend the app.
3. Read the deployment guide before you ship anything to a real environment.

## Mental model

Jarvis is a personal operating system for daily reflection and execution. The app combines:

- lightweight logging for mood, journal, sleep, and review
- planning tools for todos and time blocks
- persistence through Prisma and a JSON-backed user state API
- authentication and session handling through NextAuth

The docs below are written so a newcomer can understand the app quickly, while an agent or experienced developer can trace the implementation details without guessing.
