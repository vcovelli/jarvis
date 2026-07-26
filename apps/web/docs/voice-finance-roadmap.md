# Voice and Finance Roadmap

## Current voice architecture

1. The mobile bottom-bar microphone opens `/v2/assistant?voice=1`.
2. The Assistant page starts browser speech recognition when available.
3. If browser recognition is unavailable, Jarvis records audio with `MediaRecorder` and sends it to `/api/assistant/transcribe`.
4. The transcription endpoint calls OpenAI only when `OPENAI_API_KEY` is configured.
5. The resulting text is processed by the existing assistant command parser.
6. Jarvis creates a draft action and requires confirmation before saving.

This keeps voice fast while preserving the same save behavior and safety checks used by typed commands.

## Current finance architecture

1. Plaid Link token creation happens at `/api/finance/plaid/link-token`.
2. Public tokens are exchanged at `/api/finance/plaid/exchange`.
3. Plaid access tokens are encrypted server-side before storage.
4. `/api/finance/sync` syncs accounts, Plaid Transactions Sync updates, and investment holdings.
5. `/api/finance/summary` returns redacted read-only dashboard data.
6. `/v2/finance` displays setup status, account balances, recent transactions, and holdings.

The finance data is intentionally stored in dedicated Prisma models instead of the local Jarvis state blob because provider tokens and financial history need stricter server-side handling.

## Next implementation steps

1. Add Plaid webhook handling so transaction syncs happen automatically.
2. Add custom categories and rules so Jarvis can adapt spending views to your actual life.
3. Add recurring bill and subscription detection.
4. Add monthly cashflow projections and savings-rate tracking.
5. Add assistant finance questions, such as monthly spend summaries and account snapshots.
6. Add Realtime voice conversation after the command-confirmation model is solid.
