# Voice and Finance Roadmap

## Current voice architecture

1. The mobile bottom-bar microphone opens `/v2/assistant?voice=1`; when already on Assistant, it toggles the same voice capture control in place.
2. The Assistant page starts browser speech recognition when available. It keeps listening through short pauses, auto-submits after a longer quiet pause, and the mic can be tapped again to submit immediately.
3. If browser recognition is unavailable, Jarvis records audio with `MediaRecorder` and sends it to `/api/assistant/transcribe`.
4. The transcription endpoint calls OpenAI only when `OPENAI_API_KEY` is configured.
5. The resulting text is processed by the existing assistant command parser.
6. If the command is not a strict template, `/api/assistant/intent` interprets it with OpenAI when configured or deterministic fuzzy parsing otherwise.
7. Jarvis creates a draft action and requires confirmation before saving. Task drafts use the Daily planner-style review panel with schedule, repeat, priority, color, and icon controls.

This keeps voice fast while preserving the same save behavior and safety checks used by typed commands. Spoken commands use the shared intent layer first because transcripts are messy; typed commands keep the fast local parser and fall through to intent parsing when they are fuzzy. Task parsing treats schedule/date/priority phrases as metadata instead of title text, and ambiguous meal or evening times infer PM while breakfast and morning infer AM. Mood parsing accepts numeric scores, spoken number scores, inferred mood words, and configured mood tags. The intent layer is the start of a centralized life data model: it receives a compact context of todos, mood, sleep, mood tags, and server-side finance summaries, then turns user intent into explicit actions or insight responses.

## Voice assistant operating model

1. Capture the whole spoken command before parsing.
2. Interpret speech with one shared intent layer rather than page-specific string templates.
3. Show a draft for actions that create, move, complete, or log data.
4. Make correction commands first-class, such as moving time, changing priority, completing a task, or adjusting a mood note.
5. Keep the local fallback deterministic so the assistant still works when OpenAI is unavailable.

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
