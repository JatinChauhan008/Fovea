# Plan — review fixes (locked)

Source: the codebase review of 2026-10-02 (findings C1–C4, I1–I7, S1–S5, P1–P4, Q1–Q6, A1–A7, U1–U6).
Branch: `feature/review-fixes`, cut from `main`. One commit per phase after QC; the UI phase (5) is held for the user's visual check.

Decisions taken (user said "run all phases"; the review's recommendations stand):
- Migrations: Alembic is introduced in Phase 4 with a baseline that matches the current schema. Existing databases are stamped, not rebuilt.
- Rate limiting: a small in-memory limiter (single-server app), no new dependency.
- No frontend formatter is added (would reformat every file); lint + `tsc` remain the frontend gate.

---

## Phase 0 — Guardrails (no behaviour change)
- Add ruff (lint + format, line length 100) and mypy to the backend dev group; configure in `pyproject.toml`; format the backend once.
- Add cross-user denial tests for every authenticated endpoint that takes a document (get, content, delete, save progress, get progress, record session) and assert nothing changed.
- Update `CLAUDE.md` commands.

## Phase 1 — Critical bugs
- C1: an upload's database row is created only after the text is extracted, so failures leave nothing behind; the stored PDF is removed on any failure. At startup, leftover `failed`/`processing` rows (and their files) from older versions are removed.
- C2: the saved sign-in is cleared only when the server says it is invalid (401). If the server can't be reached, a "can't reach the server — retry" screen is shown instead of signing out.
- C3: passwords are limited to 72 bytes (bcrypt's limit) at validation, with a clear message; the sign-up form says so.
- C4: position saves and session logs use `keepalive` so they survive the tab closing; hiding the tab while paused also saves the position.
- I1: failed saves are surfaced in the reader as a quiet "not saved" notice that clears on the next successful save.

## Phase 2 — Security & robustness
- S1: in-memory rate limit on login (per IP + email) and sign-up (per IP); 429 with `Retry-After`.
- S2: reject uploads whose declared size is over the limit before reading them; copy the upload to disk in chunks with a hard cap; extract text in a child process with a timeout; per-user storage limit (`MAX_STORAGE_MB`, default 1000).
- S3: unexpected PDF errors return a plain message; details go to the log.
- S5: drop credentialed CORS; serve `/docs` only in development.
- A4: structured (JSON) logging configured once; request log line per request; log upload outcomes, rejected tokens, rate-limit hits.

## Phase 3 — Correctness & performance
- P1: parsed word files are cached (small LRU keyed by path + modified time) so streaming a book parses it once.
- P2: Stats totals and finished-document count come from SQL aggregates; only the last year of sessions is loaded for the chart and streak.
- I2: "fastest" ignores stretches shorter than 50 words.
- I3: Stats takes the reader's UTC offset and groups days in their local time.
- P3: the upload route runs off the event loop.
- I4: jumping to a page or position that hasn't loaded yet waits for it and then jumps, with a "loading page N" note.
- P4: a newly arrived chunk no longer restarts the current word's timer.

## Phase 4 — Structure
- A1: routes become flow files (header comment, one-liner above each helper call); DB access moves to `app/queries/`, the ownership check to `app/permissions.py`, file handling to `app/services/storage.py`, stats maths to `app/services/analytics.py`. Layer 1–3 tests for the helpers and flows.
- A3: Alembic baseline migration; startup runs migrations (stamping a pre-existing database first).
- Q1: one place per rule — backend speed limits used by the request schemas; `finished` returned by the API so the frontend no longer duplicates 95%; frontend limits in `lib/constants.ts`; default speed 250 on both sides.
- Q2: one duration formatter in `lib/format.ts` (tested).
- Q4: remove unused endpoints `PATCH /auth/me` and `GET /progress/{id}`; update README.
- Q5: duplicate sign-up race returns 409; delete commits before removing files; stale comment fixed.
- Q6: the auth context refreshes the user's preferred speed after reading.
- A2: the reader page is split into hooks (`useDocumentWords`, `useProgressSaver`, `useReaderKeys`).
- Docs: `backend/app/routers/architecture.md`, `frontend/app/architecture.md`.

## Phase 5 — UI/UX (commit held for the user's visual check)
- Q3: shared `ErrorText`, `TextLink`, `PageHeading`, `PageLoading` components.
- I7: darker "faint" ink in both themes (≥ 4.5:1).
- I5: the reader fills exactly one screen.
- I6: long words shrink to fit the screen.
- U1: a loading state while the sign-in is checked; the login page waits too.
- U2: 44px tap targets on phones for delete, presets and step buttons.
- U3: inline delete confirmation instead of the browser dialog.
- U4: tap the word to play/pause.
- U5: multi-file drop says only one is added; drop highlight no longer flickers; upload shows "Uploading…" then "Extracting text…".
- U6: quieter controls — presets and slider on one line, page jump compact.
- `app/not-found.tsx` and `app/error.tsx`.

## QC & docs
- Per-phase `kit-qc`; final full QC over the branch.
- Arch docs written in Phase 4, updated in Phase 5 (visual checklist).
