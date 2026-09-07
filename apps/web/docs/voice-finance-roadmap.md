# Assistant Voice and Finance Status

This document records what is implemented now and what remains. It is not a promise that roadmap items are shipped.

## Voice: current implementation

The center mobile navigation item opens `/v2/assistant`; it is an Assistant destination, not a microphone toggle. Voice capture starts from the microphone control inside the Assistant page.

1. The page attempts the browser Speech Recognition API for fast command capture.
2. Recognition continues through short pauses and can submit after a longer quiet period or an explicit second tap.
3. When browser recognition is unavailable, Jarvis uses `MediaRecorder` and posts the captured audio to `/api/assistant/transcribe`.
4. Server transcription requires `OPENAI_API_KEY` and uses `OPENAI_TRANSCRIPTION_MODEL` (`gpt-4o-mini-transcribe` by default).
5. The transcript enters the same intent and confirmation pipeline as typed input.

Structured commands can add, move, update, complete, or schedule todos; log mood or sleep; add journal text; and return supported insights. The parser separates date, time, duration, priority, color, icon, and repeat metadata from a task title. It understands common day/time phrasing and configured mood tags.

Mutating commands create a draft so the user can review the interpreted action before saving. The planner-style task draft exposes scheduling and presentation metadata. The local parser remains available when OpenAI is not configured; OpenAI fuzzy intent parsing is an optional fallback.

## Assistant: current implementation

Assistant history is no longer a temporary page-only concept. Jarvis persists:

- user-owned conversations with titles, domains, descriptions, summaries, pinned state, and OpenClaw session keys
- messages and their source/metadata
- domain-scoped manual and derived memories

`/api/assistant/message` routes recognized actions to the intent flow, Jarvis/homelab status questions to server snapshots, finance questions to server-side analytics, and general conversation to OpenClaw. OpenClaw output streams to the browser through Server-Sent Events. An unavailable gateway returns an explicit status message.

## Finance: current implementation

Finance is a dedicated server-side domain rather than part of the local `JarvisState` blob.

1. `/api/finance/plaid/link-token` creates a signed, user-scoped Link session for either bank or investment products.
2. `/api/finance/plaid/exchange` exchanges the public token and encrypts the access token before storage.
3. `/api/finance/sync` imports accounts, transaction deltas, investment holdings, balance snapshots, normalized financial events, and net-worth snapshots.
4. The classification layer distinguishes income, spend, savings, transfers, investment contributions, investment income, and review-needed events.
5. Users can review events and create classification rules.
6. Manual assets/liabilities and valuation history contribute to the broader net-worth view.
7. `/api/finance/summary` returns redacted, read-only analytics for the dashboard.
8. Finance questions use the same server analytics through the assistant message route.

The UI supports setup state, account balances, cash flow, spending analysis, transactions, holdings, review items, rules, manual positions, net worth, and generated demo data. Jarvis does not move funds, execute trades, or modify an institution account.

Removing a connection deletes its connection-scoped Jarvis records and attempts the provider unlink. It does not close or alter the underlying account.

## Security model

- All real assistant and finance routes require the signed-in user.
- Ownership comes from the server session, not a client-supplied user id.
- Plaid access tokens are encrypted with `FINANCIAL_DATA_KEY` or the `NEXTAUTH_SECRET` fallback.
- Provider tokens never appear in the finance summary response.
- Demo mode does not expose live finance data or write generated daily state into the personal workspace.
- Structured assistant mutations retain an explicit user confirmation step.

## Known limitations

- Signed, idempotent Plaid webhook handling and a protected leased all-connection sync job are implemented, but the operator must configure the public webhook and install cron/systemd/platform scheduling.
- Application rate limits cover assistant, transcription, Plaid, and finance-sync routes; the in-memory store is single-process and needs a shared replacement for multi-instance deployment.
- Classification rules can be created and applied by the system, but full rule editing/deletion and conflict-management UX should be audited before calling the workflow complete.
- Finance analytics are informational and are not financial advice.
- Browser speech support varies, and transcription fallback depends on microphone permission, browser recording support, network access, and OpenAI configuration.
- General chat depends on OpenClaw availability and deployment-specific credentials/device identity.
- User-visible usage budgets and a shared cross-instance provider quota are not implemented.

## Next work

1. Add provider-contract and database-backed integration tests for webhook verification, sync deltas, route ownership, encryption/key failure, event review, and rule precedence.
2. Replace process-local rate limits and host-local quotas when horizontal scaling is needed.
3. Complete classification-rule management and explain which rule changed each event.
4. Add recurring bill/subscription detection and cash-flow projections.
5. Add user-visible assistant/provider budgets and privacy disclosures.
6. Improve voice interruption, correction, and accessibility behavior across supported browsers.
7. Consider realtime voice conversation only after the command-confirmation and operational safety model is stable.
