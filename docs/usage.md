# Usage Guide

## Shallow overview

Jarvis is a personal console for tracking your day, understanding your patterns, and planning your next actions. The experience is organized around a few core loops:

- log how you feel
- capture what matters in your journal
- plan your day with todos and time blocks
- review sleep and weekly patterns
- keep a running set of objectives and home-lab actions

If you only want the short version, the app is meant to help you answer three questions every day:

1. How do I feel right now?
2. What matters most today?
3. What should I do next?

## A shallow “how to use it” walkthrough

### 1. Sign in or register

Create an account from the register page and sign in from the login page. The app uses credentials-based authentication with a Postgres-backed user table.

### 2. Start with a daily check-in

The main dashboard is the fastest entry point. Use it to log mood, optional tags, and a short note. This creates the baseline for your later review pages.

### 3. Capture your day

Move through the journal, todos, and sleep pages to add the context that matters to you. These are not meant to be heavy systems; they are meant to be fast and resilient.

### 4. Review patterns

The review page surfaces the larger story across sleep, mood, operating mode, and weekly reflection. It is designed to make recurring patterns visible without making the workflow feel like a chore.

## Deep dive by feature

### Daily check-in

The check-in experience is intentionally fast. The app expects a small amount of structured input instead of a long form. That makes it possible to record something meaningful in under two minutes.

In implementation terms, the daily check-in contributes to the app’s state model in the mood section. The client-side state store collects entries, then syncs them to the server through the state API when the user is authenticated.

### Journal

The journal is built as a lightweight prompt-based writing flow. It is designed to support fast capture rather than long-form editing. The current prompts are:

- morning
- priority
- free

These prompts help shape the entry, but the important part is low-friction capture.

### Todos and time blocks

The todo module is the planning surface. It supports:

- priorities
- optional time blocks
- start times
- visual metadata such as color and icon
- repeatable or recurring logic in the product direction

From a product perspective, this is where the app moves from reflection into execution.

### Sleep logging

Sleep is treated as one of the core signals in the system. The app records sleep duration, quality, recovery hints, and notes, and it can also generate schedule presets such as daily, weekdays, weekends, or custom schedules.

This section matters because it ties daily self-awareness to long-range patterns.

### Review and objectives

The review layer is where the app turns raw logs into insight. The app tracks weekly review notes and objectives, and it can also capture homelab actions for operational context.

That makes the app feel less like a notes app and more like a personal operating console.

## Agent-oriented notes

If you are an agent or a future contributor, the best place to understand how features map to code is:

- state shape and helpers in the client store
- routes under the app router
- API handlers for auth and state persistence
- Prisma schema for the persisted relational models

The app favors a simple architecture: the UI is mostly client-driven around a central state object, and the server handles authentication plus durable persistence.
