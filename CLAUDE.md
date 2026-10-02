# Project overlay — Fovea

## Project

Fovea is a single-tenant-per-account RSVP speed reader for PDFs. A user uploads a text-layer PDF; the backend extracts, cleans and tokenizes it once (ORP index + hold multiplier per word), stores the words as JSON on disk, and the frontend streams them back in chunks and shows them one at a time. It also saves reading position per document and logs reading sessions for a stats page. `README.md` is the user-facing description (setup, API table, config vars).

## Stack

- **Backend** (`backend/`): Python 3.11+, FastAPI, SQLAlchemy 2.0 (ORM, `select()` style), Pydantic v2 + pydantic-settings, PyMuPDF for text extraction, bcrypt + PyJWT for auth. SQLite by default (`DATABASE_URL` overrides). Uploaded PDFs and extracted word JSON live on local disk under `STORAGE_DIR`. Dependencies managed with **uv** (`pyproject.toml`, `uv.lock`).
- **Frontend** (`frontend/`): Next.js 16 (App Router) + React 19 with the React Compiler, TypeScript (strict), Tailwind CSS v4. Vitest + happy-dom + Testing Library for tests. npm (`package-lock.json`).
- **Read `frontend/AGENTS.md` before writing frontend code** — this Next.js version has breaking changes; consult `frontend/node_modules/next/dist/docs/` rather than relying on memory.

## Layout & tiers

- Tier 1 (shared helpers):
  - Backend: `app/security.py` (password hashing, JWTs, `get_current_user`), `app/permissions.py` (`get_owned_document` — the only ownership check), `app/db.py` (engine, session, `get_db`, `migrate_database`), `app/config.py` (settings, `MB`), `app/schemas.py`, `app/rate_limit.py`, `app/logging_setup.py`, `app/upload_limit.py`.
  - Frontend: `frontend/lib/` — `api.ts` (API client + token storage), `auth.tsx` (auth context, `useRequireAuth`, `useRememberSpeed`), `types.ts`, `constants.ts` (speed limits, mirrors backend settings), `format.ts` (`formatDuration`).
- Tier 2 (feature-scoped helpers):
  - Backend: `app/queries/` (all database reads/writes: `documents`, `progress`, `sessions`, `users`, `analytics`) and `app/services/` (`uploads` checks, `storage` file work, `extraction` + `pdf_worker` child process, `pdf_service`, `tokenizer`, `reading` rules, `analytics` maths, `cleanup`).
  - Frontend: `lib/useRsvp.ts` (reading loop), `lib/useProgressSaver.ts`, `lib/useReader.ts` (loop + saver), `lib/useDocumentWords.ts`, `lib/useReaderKeys.ts`, and `components/` (`RsvpDisplay`, `ReaderControls`, `UploadDropzone`, `TrendChart`, `NavBar`, `ServerUnreachable`).
- Flow files:
  - Backend: `app/routers/` — `auth.py`, `documents.py`, `progress.py`, `analytics.py`; wired up in `app/main.py`. Each route reads as numbered steps with a one-line comment above every helper call; no queries or rules inline.
  - Frontend: `frontend/app/**/page.tsx` — library (`page.tsx`), `login/`, `read/[id]/`, `analytics/`.
- Models / migrations: `backend/app/models.py` / `backend/migrations/versions/` (Alembic). Startup runs `migrate_database()`; a database from before migrations is stamped at `0001` (the old `create_all` schema) first.
- Tests:
  - Backend: `backend/tests/test_*.py` (pytest; fixtures `client`, `auth`, `intruder` (a second reader), `document` in `conftest.py` use a throwaway DB and storage dir). Layer 1 `test_queries.py`, `test_analytics.py`, `test_migrations.py`; layer 2 `test_reading_rules.py`, `test_storage.py`, `test_reading.py` (tokenizer), `test_word_cache.py`; layer 3 `test_flows.py` (helpers mocked on the router module); layer 4 `test_api.py`, `test_upload_limits.py`, `test_rate_limit.py`.
  - Frontend: `frontend/lib/__tests__/*.test.ts(x)` (Vitest, happy-dom, fake timers; `api` mocked with `vi.mock`).
- Architecture docs: `backend/app/routers/architecture.md` (the API, primary doc) and `frontend/app/architecture.md` (pages and hooks).

## Commands

Every command runs from its package directory — prefix with an absolute `cd`.

- Install: `cd backend && uv sync` · `cd frontend && npm install`
- Run (dev): `cd backend && uv run uvicorn app.main:app --reload --port 8000` (needs `backend/.env` copied from `.env.example`, which sets `FOVEA_ENV=development`) · `cd frontend && npm run dev` (port 3000). Also available as `fovea-api` / `fovea-web` in `.claude/launch.json`.
- Lint: `cd backend && uv run ruff check .` · `cd frontend && npm run lint` (ESLint 9, `eslint-config-next`).
- Typecheck: `cd backend && uv run mypy` (checks `app/`) · `cd frontend && npx tsc --noEmit`.
- Format: `cd backend && uv run ruff format .` (line length 100). Frontend: **no formatter configured** — match the surrounding file's style.
- Targeted tests (the agent runs only these):
  - `cd backend && uv run pytest tests/test_api.py::test_progress_saves_and_resumes`
  - `cd frontend && npx vitest run lib/__tests__/useRsvp.test.ts -t "holds a sentence-ending word"`
- Full suite: `cd backend && uv run pytest` · `cd frontend && npm test` — the user runs these, not the agent.

## Base branch

`main` (remote `origin` → github.com/JatinChauhan008/Fovea).

## Auth & scoping model

- Email + password accounts. `POST /auth/register` and `POST /auth/login` (OAuth2 password form) return a stateless **HS256 JWT** (`sub` = user id, default expiry 14 days). No refresh tokens, no roles.
- Every route except `/health`, `/auth/register` and `/auth/login` takes `user: User = Depends(get_current_user)` (`backend/app/security.py`), which decodes the bearer token and loads the user; any failure is a `401`.
- **Ownership scoping:** every user-owned table (`Document`, `Progress`, `ReadingSession`) has a `user_id`, and every query in `app/queries/` takes the caller's user id. Document access goes through `get_owned_document()` in `app/permissions.py`, which returns **`404`** (hides existence) for someone else's document and logs the refusal — reuse it, never re-check ownership inline.
- `config.py` refuses to start with the placeholder or a <32-char `JWT_SECRET` unless `FOVEA_ENV=development`.
- Frontend stores the token in `localStorage` (`fovea.token`) and sends it as `Authorization: Bearer`. A `401` on any request other than login clears the token and signs the user out; pages guard themselves with `useRequireAuth`.

## Project-only rules

- **Schema changes ship as Alembic migrations.** Change `models.py`, run `uv run alembic revision --autogenerate -m "..."` in `backend/`, read and tidy the file, commit it with the model change. Migrations run in batch mode (SQLite). `tests/test_migrations.py` fails if models and migrations drift apart. Never edit `0001_baseline`.
- `MAX_UPLOAD_MB` and the speed limits (`DEFAULT_WPM`, `MIN_WPM`, `MAX_WPM`) are mirrored in `backend/app/config.py` and `frontend/lib/constants.ts` — change both together. "Finished" (95%) is decided only by the backend (`ProgressOut.finished`).
- Word payloads use a compact shape (`t`, `o`, `m`, `p`) to keep large documents small; keep the backend schema and `frontend/lib/types.ts` in sync.
- PDF extraction runs in a child process with a timeout (`app/services/extraction.py` → `pdf_worker.py`); never call PyMuPDF in the server process. The upload route is a plain `def` so FastAPI runs it off the event loop.
- Logging is JSON via `app/logging_setup.py`; pass fields with `extra=`, never log tokens, passwords or emails.
- Sign-in/sign-up rate limits live in memory (`app/rate_limit.py`) and assume a single server process.

## Project memory

Gotchas and non-obvious decisions for this project live in `engineering/project-memory.md` — read it when a task touches one of its topics; append to it when you learn something future sessions need.
