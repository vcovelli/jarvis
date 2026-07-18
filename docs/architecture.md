# Architecture Guide

## Shallow overview

Jarvis is a full-stack Next.js application with a web client, a Prisma-backed database, and a state synchronization layer. The app is built around a central client-side state object that represents the user’s daily systems data.

At a high level, the architecture has four layers:

1. UI layer — React components and route-based pages.
2. State layer — a client-side store that manages day-to-day data.
3. API layer — authenticated endpoints for account and state persistence.
4. Data layer — Prisma models stored in Postgres.

## Deep dive

### 1. Frontend structure

The web app lives under the apps/web directory. It uses the App Router in Next.js and organizes content around feature pages such as:

- dashboard
- journal
- todos
- sleep
- review
- settings
- objectives
- homelab

The app shell provides navigation and shared UI while the feature pages manage their own domain-specific interactions.

### 2. State management model

The main state shape is defined in the client store and is centered around a large Jarvis state object. This object includes:

- mood entries
- journal entries
- todo items
- sleep entries
- mood tags
- sleep schedule metadata
- operating mode entries
- must-win entries
- daily and weekly review entries
- objectives and homelab actions

This design keeps the app’s mental model consistent and makes future migration to a different backend easier because the UI is mostly operating against a structured object rather than scattered ad hoc state.

### 3. Persistence strategy

The app uses a hybrid persistence approach:

- local browser storage is used as a fast cache for the current user session
- authenticated API routes write the state to Postgres via Prisma
- the server exposes a state API that supports GET and PUT operations for the user state record

That means the app can feel responsive even when the network is flaky, while still maintaining durable storage for the real source of truth.

### 4. Authentication and sessions

Authentication is handled with NextAuth using credentials-based login. The auth config uses:

- a credentials provider
- Prisma adapter integration
- JWT sessions
- a custom sign-in page

The API routes depend on the server session to know which user is making the request. That flows into the user state lookup and update paths.

### 5. Database design

The Prisma schema currently defines:

- User
- UserState
- Account
- Session
- VerificationToken

The most important domain-specific persistence layer is the user state record. That record stores a JSON payload representing the app’s core state. The relational models support authentication and session management, while the JSON state payload holds the actual application content.

### 6. Where to look when changing behavior

If you need to change a feature, start here:

- state and reducers: the client store file
- page-level UI: the app router pages under src/app
- auth logic: the auth config and route handlers
- persistence: the state API and Prisma client wrapper

## Why this structure exists

This architecture favors clarity over complexity. It is designed to be easy to understand, easy to extend, and easy to move later if the app grows into a richer multi-device or multi-service experience.
