# Fovea API

> Part of feature: **fovea** · siblings: `../../../frontend/app/architecture.md`

## Overview

The backend turns an uploaded PDF into a list of words ready for one-word-at-a-time reading (each word carries the letter to highlight, a hold multiplier and its page). It keeps each reader's place in each document and a log of every stretch they read, and adds those up for the Stats page. Everything belongs to one account: no sharing, no roles.

### How the repos connect

1. The frontend signs in (`/auth/login` or `/auth/register`) and keeps the returned token in browser storage, sending it as `Authorization: Bearer` on every call.
2. Uploading posts the PDF to `/upload`; the response arrives only once the words are extracted.
3. Opening a document fetches `/documents/{id}` (with the saved place), then streams `/documents/{id}/content` in 20,000-word windows: up to the saved place first, the rest behind the reader.
4. While reading, the frontend posts the place to `/progress` every few seconds and on pause/hide/leave, and each continuous stretch to `/sessions`. Both use `keepalive` so they survive the tab closing.
5. The Stats page calls `/analytics/summary?utc_offset_minutes=` with the browser's offset.

## Submodule map

| Submodule | Trigger |
|---|---|
| Accounts | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Upload | `POST /upload` |
| Library & reading text | `GET /documents`, `GET /documents/{id}`, `GET /documents/{id}/content`, `DELETE /documents/{id}` |
| Place & reading log | `POST /progress`, `POST /sessions` |
| Stats | `GET /analytics/summary` |
| Startup | app lifespan: migrations, then removing unfinished documents from older versions |

Cross-cutting pieces every submodule relies on: `get_current_user` (401 for any bad token), `get_owned_document` (404 for someone else's document), JSON logging with one line per request, the upload size middleware, and the sign-in rate limiter.

---

## Submodule: Accounts

### Trigger
`POST /auth/register` (JSON email + password), `POST /auth/login` (OAuth2 password form: `username`, `password`), `GET /auth/me`.

### Business use case
Create an account, sign in, and let the frontend check a saved sign-in on load.

### Flow (English)
Register: count the attempt against the address's sign-up limit → refuse an email that exists (409) → hash the password and create the account at the default speed (a simultaneous duplicate also answers 409) → return a token and the account.
Login: count the attempt against the address+email limit → find the account → same 401 for an unknown email or a wrong password → return a token and the account.

### Helpers
- `enforce_rate_limit(limiter, key, label)` — Tier 1 (`rate_limit.py`). Raises 429 with `Retry-After` once over the limit; logs the hit without the key.
- `client_address(request)`, `login_attempt_key(request, email)` — Tier 1. Login is keyed per address+email so guessing one account doesn't lock out others behind the same network.
- `find_user_by_email(db, email)`, `create_user(db, ...)` — Tier 2 (`queries/users.py`). Emails stored lower case; `create_user` raises `EmailTaken` on the unique-index violation.
- `hash_password`, `verify_password`, `create_access_token` — Tier 1 (`security.py`). bcrypt; passwords over 72 bytes are refused by `UserCreate` validation (bcrypt 5 rejects them).

### Data model
`users`: email (unique index), hashed_password, preferred_wpm, created_at. Login looks up by the unique email index.

### Security & scoping
Public endpoints, rate limited in memory per process: sign-in 10 per 5 minutes per address+email, sign-up 10 per hour per address (settings). Tokens are HS256 JWTs (`sub` = user id), 14 days; no revocation. A different user calling `/auth/me` gets their own account; there is no way to name another account.

### Tests
#### Layer 1 — DB helper tests
`test_queries.py`: email stored lower case and found case-insensitively; a registered email raises `EmailTaken`.
#### Layer 2 — Non-DB helper tests
`test_rate_limit.py`: allows up to the limit then reports the wait; attempts age out; keys are separate.
#### Layer 3 — Flow tests
`test_flows.py`: a registered email gets 409 without creating anything; a simultaneous duplicate (`EmailTaken`) gets 409; login counts the attempt before checking the password.
#### Layer 4 — API e2e
`test_api.py`: register → login → me round trip; duplicate 409; wrong password 401; 72-byte password accepted, 73-byte/multibyte refused with 422. `test_rate_limit.py`: the 11th wrong password is 429 with Retry-After while another account from the same address still gets 401; the 11th sign-up from one address is 429.
#### Layer 5 — API user journey
Sign up, sign in with the same password, read `/auth/me`, then sign in with a wrong password 11 times and confirm 429.
#### Layer 6 — Browser e2e
See the frontend doc (sign up, sign in, sign out).

### Visual checklist (manual, on request)
n/a — no UI here; see the frontend doc.

### LLM-judge points
n/a — all assertions are deterministic.

---

## Submodule: Upload

### Trigger
`POST /upload` (multipart, one `file`). `UploadSizeLimit` middleware guards the path first.

### Business use case
Add a text-based PDF to the library, ready to read.

### Flow (English)
1. Middleware: refuse a declared body over `MAX_UPLOAD_MB` (+64 KB for the multipart wrapping) with 413 before reading it; count an undeclared (chunked) body and stop it with 413 once past the limit.
2. Pick fresh, random file names in the reader's folder (`STORAGE_DIR/<user id>/`).
3. Refuse a name not ending in `.pdf` (400).
4. Copy the upload to disk in 1 MB chunks, stopping at the limit (413).
5. Refuse a file that doesn't start with `%PDF` (400).
6. Refuse if the reader's folder is over `MAX_STORAGE_MB` (413).
7. Extract and tokenize in a child process (`pdf_worker`), at most two at once, killed after `PDF_TIMEOUT_SECONDS`; the worker writes the word file and reports page count, word count and the PDF's title.
8. Create the document row (title from the PDF if it has a real one, else the tidied file name).
9. Any refusal or failure removes both files; nothing is created. Refusals return their status with a plain message; unreadable/empty/encrypted/slow PDFs return 422; anything else is a 500 with details only in the log.

The route is a plain `def`, so FastAPI runs it on a worker thread and the event loop never blocks.

### Helpers
- `new_document_paths`, `check_pdf_filename`, `store_upload`, `check_real_pdf`, `check_storage_room` — Tier 2 (`services/uploads.py`). Each raises `UploadRejected(status, message)`.
- `save_upload`, `starts_like_pdf`, `storage_used_bytes`, `remove_files` — Tier 2 (`services/storage.py`), plain file work.
- `extract_pdf(pdf, tokens, timeout)` — Tier 2 (`services/extraction.py`). Passes absolute paths (the child runs from `backend/`), reads the worker's last output line (PyMuPDF may print notices first), raises `PdfExtractionError` (reader-safe message) or `RuntimeError` (worker crash, logged).
- `process_pdf`, `write_tokens`, `guess_title` — Tier 2 (`services/pdf_service.py`); `tokenize_pages` (`services/tokenizer.py`) does cleaning, ORP and timing.
- `create_document` — Tier 2 (`queries/documents.py`).

### Data model
`documents`: user_id (indexed), title, original_filename, stored_path, tokens_path, page_count, word_count, status (always `ready` now), error (unused, kept), created_at. Words live on disk as JSON `[{t, o, m, p}, …]`.

### Security & scoping
Signed-in readers only; files go under the reader's own folder with random names, so nothing in the request picks a path. The size, type, storage and time limits protect the server from one reader.

### Tests
#### Layer 1 — DB helper tests
`test_queries.py`: `create_document` + `list_documents` (own documents only, newest first).
#### Layer 2 — Non-DB helper tests
`test_reading_rules.py`: name check, `%PDF` check, size refusal leaves no file, storage refusal. `test_storage.py`: chunked copy and cap, folder size, a crashed worker is a `RuntimeError`, library notices before the answer are ignored, relative paths from another folder work.
#### Layer 3 — Flow tests
`test_flows.py`: checks run in order then extract then save; a refusal maps to its status, cleans up and skips extraction; a no-text PDF is 422 and cleans up; an unexpected error cleans up and surfaces.
#### Layer 4 — API e2e
`test_api.py`: a real PDF extracts with pages and words; non-PDF name 400; renamed non-PDF 400 with nothing kept; no text layer 422 mentioning OCR and nothing left behind; a failure after extraction leaves nothing. `test_upload_limits.py`: declared oversize 413; chunked oversize 413; storage full 413 with nothing added; unreadable PDF gets the plain message; timeout gives up with 422.
#### Layer 5 — API user journey
Upload a real book, list the library, stream its content to the end, delete it.
#### Layer 6 — Browser e2e
See the frontend doc.

### Visual checklist (manual, on request)
n/a — see the frontend doc.

### LLM-judge points
n/a — all assertions are deterministic.

---

## Submodule: Library & reading text

### Trigger
`GET /documents`, `GET /documents/{id}`, `GET /documents/{id}/content?start=&limit=` (limit ≤ 50,000), `DELETE /documents/{id}`.

### Business use case
See the library with each document's progress, open one, stream its words, delete one with everything about it.

### Flow (English)
Library: the reader's documents (newest first, at most 1,000) and all their places in two queries, paired up.
Open: load the owned document → find the reader's place → return both.
Content: load the owned document → read its parsed words (cached) → return the requested window and the total; a missing word file is 410.
Delete: load the owned document → delete the row (cascades place and sessions) → then remove both files, so a failed delete leaves a readable document.

### Helpers
- `get_owned_document(db, id, user)` — Tier 1 (`permissions.py`).
- `list_documents`, `delete_document` — Tier 2 (`queries/documents.py`); `find_progress`, `progress_by_document` (`queries/progress.py`).
- `document_with_progress`, `progress_out` — Tier 2 (`services/reading.py`): percent through and `finished` (≥ 95%, the same `COMPLETION_THRESHOLD` Stats uses; the frontend reads `finished` rather than repeating the rule).
- `read_tokens` — Tier 2 (`services/pdf_service.py`): LRU cache of 2 parsed documents keyed on path, size and modified time (a parsed word is ~280 bytes, so a 500k-word book is ~140 MB). Callers must not mutate the list.

### Data model
Reads `documents` by user_id index; `progress` by user_id (and the unique (user_id, document_id) index). Delete relies on the ORM cascade from document to progress and sessions.

### Security & scoping
Every route with an id goes through `get_owned_document`: someone else's document answers exactly like a missing one (404, same message), and the refusal is logged with both ids. The list filters on the caller.

### Tests
#### Layer 1 — DB helper tests
`test_queries.py`: own documents only and newest first; deleting cascades place and history; the owner loads their document; someone else's is indistinguishable from a missing one.
#### Layer 2 — Non-DB helper tests
`test_reading_rules.py`: percent and `finished` at exactly 95%. `test_word_cache.py`: five reads parse once; a changed file is read again.
#### Layer 3 — Flow tests
`test_flows.py`: delete removes the row before the files.
#### Layer 4 — API e2e
`test_api.py`: content windows are render-ready and paginate through the document; delete removes it; `test_another_reader_cannot_touch_a_document` — 404 on open, content, place, session and delete for a second reader, and the owner's place and text survive.
#### Layer 5 — API user journey
Covered by the upload journey.
#### Layer 6 — Browser e2e
See the frontend doc.

### Visual checklist (manual, on request)
n/a — see the frontend doc.

### LLM-judge points
n/a — all assertions are deterministic.

---

## Submodule: Place & reading log

### Trigger
`POST /progress` ({document_id, word_index, page, wpm}), `POST /sessions` ({document_id, start_index, end_index, wpm, duration_seconds}).

### Business use case
Resume where you stopped, at the speed you used; count only words actually read for Stats.

### Flow (English)
Save place: load the owned document → keep the word and page inside it → save the place and the speed as the reader's preferred speed → return it with percent and `finished`.
Log reading: load the owned document → count the words between start and end, never past the end of the document or below zero → save the stretch.

### Helpers
- `clamp_position`, `words_in_stretch` — Tier 2 (`services/reading.py`).
- `save_progress` (upserts and sets `users.preferred_wpm` in one commit) — `queries/progress.py`; `add_reading_session` — `queries/sessions.py`.

### Data model
`progress` unique on (user_id, document_id). `reading_sessions`: user_id, document_id, start/end index, words_read, wpm, duration_seconds, created_at; indexed on user_id, document_id, created_at and (user_id, created_at) for Stats (migration 0002). Speeds are validated against `MIN_WPM`..`MAX_WPM` (422 otherwise).

### Security & scoping
Both refuse someone else's document with 404 through `get_owned_document`; covered by the cross-user e2e test.

### Tests
#### Layer 1 — DB helper tests
`test_queries.py`: save creates then updates one place and remembers the speed.
#### Layer 2 — Non-DB helper tests
`test_reading_rules.py`: clamping (including an empty document); stretches never count past the end or backwards.
#### Layer 3 — Flow tests
`test_flows.py`: the place is clamped before saving; the logged word count is the clamped one.
#### Layer 4 — API e2e
`test_api.py`: saves and resumes (and updates the preferred speed); clamped to the document and marked finished at the end; an unstarted document has no place; speeds outside the limits are 422; sessions log; a stretch past the end counts only the document's words.
#### Layer 5 — API user journey
Save a place, reopen the document and confirm it; log two stretches and see them in Stats.
#### Layer 6 — Browser e2e
See the frontend doc.

### Visual checklist (manual, on request)
n/a — see the frontend doc.

### LLM-judge points
n/a — all assertions are deterministic.

---

## Submodule: Stats

### Trigger
`GET /analytics/summary?utc_offset_minutes=` (−720..840; 0 by default).

### Business use case
Words read, time spent, average and fastest speed, documents finished, the current streak and a daily speed chart, with days on the reader's own clock.

### Flow (English)
Add up words, seconds, the word-weighted average and the fastest speed (stretches of 50+ words only) in SQL → count documents and finished ones (place ≥ 95% through) → load only the last 366 days of sessions (three columns) → turn each into the reader's local day → streak counting back from today (or yesterday) → one chart point per local day for the last 30 active days, speed weighted by words.

### Helpers
- `reading_totals`, `count_documents`, `count_finished_documents`, `recent_sessions` — Tier 2 (`queries/analytics.py`).
- `history_cutoff`, `local_day`, `reading_streak`, `daily_trend` — Tier 2 (`services/analytics.py`), pure. Stored times are naive UTC; `local_day` treats naive as UTC.

### Data model
Aggregates over `reading_sessions` (user_id index; the recent-sessions read uses the (user_id, created_at) index from migration 0002) and a join of `progress` to `documents`. Streaks are capped at 366 days by the history window.

### Security & scoping
Every query filters on the caller's id; the endpoint takes no document id.

### Tests
#### Layer 1 — DB helper tests
`test_analytics.py`: totals add up and ignore a 10-word 900 wpm blip for fastest; zeros for someone who hasn't read; finished means 95% through; recent sessions respect the cutoff.
#### Layer 2 — Non-DB helper tests
`test_analytics.py`: early-morning reading lands on the reader's day; streak from today or yesterday; trend groups by local day and weights by words; only the last 30 active days.
#### Layer 3 — Flow tests
`test_flows.py`: the reader's offset reaches every day calculation and the trend.
#### Layer 4 — API e2e
`test_analytics.py`: UTC−12 and UTC+14 put the same session on different days; an impossible offset is 422. `test_api.py`: totals, weighted average, streak; an empty account counts no documents even though other readers have some.
#### Layer 5 — API user journey
Log stretches on two consecutive days (by offset) and confirm a two-day streak.
#### Layer 6 — Browser e2e
See the frontend doc.

### Visual checklist (manual, on request)
n/a — see the frontend doc.

### LLM-judge points
n/a — all assertions are deterministic.

---

## Submodule: Startup

### Trigger
Application start (FastAPI lifespan).

### Business use case
Keep every existing database working across upgrades.

### Flow (English)
Run migrations: a database with tables but no Alembic history (made before migrations existed) is stamped at `0001`, which is exactly the old `create_all` schema; then upgrade to head. Then delete documents left `failed` or `processing` by versions that saved placeholder rows, with their files.

### Helpers
- `migrate_database(url=None, target="head")` — Tier 1 (`db.py`).
- `remove_unfinished_documents(db)` — Tier 2 (`services/cleanup.py`).

### Data model
`migrations/versions/0001_baseline.py` (all four tables), `0002_reading_sessions_by_user_and_time.py` (composite index). Batch mode for SQLite.

### Security & scoping
n/a — no request.

### Tests
#### Layer 1 — DB helper tests
`test_migrations.py`: a new database gets every table and matches the models exactly (autogenerate finds no drift); an older-version database keeps its rows and gains the index; running twice changes nothing. `test_cleanup.py`: failed and stuck documents and their files go; ready ones stay.
#### Layer 2 — Non-DB helper tests
n/a — nothing pure here.
#### Layer 3 — Flow tests
n/a — the lifespan is two calls; covered by layer 1 and by every e2e test starting the app.
#### Layer 4 — API e2e
n/a — no endpoint.
#### Layer 5 — API user journey
Start the server against a copy of a pre-migration database and confirm the library still opens.
#### Layer 6 — Browser e2e
n/a — no UI.

### Visual checklist (manual, on request)
n/a — no UI.

### LLM-judge points
n/a — all assertions are deterministic.

---

## Limitations & future work

- Rate limits and the extraction slots are per process; running several server processes multiplies them.
- Tokens can't be revoked before they expire (14 days).
- `GET /documents` isn't paginated; it returns at most 1,000 documents.
- Every word of an open document ends up in browser memory.
