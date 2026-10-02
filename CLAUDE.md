# Project overlay — Fovea

## Project

Fovea is a single-tenant-per-account RSVP speed reader for PDFs. A user uploads a text-layer PDF; the backend extracts, cleans and tokenizes it once (ORP index + hold multiplier per word), stores the words as JSON on disk, and the frontend streams them back in chunks and shows them one at a time. It also saves reading position per document and logs reading sessions for a stats page. `README.md` is the user-facing description (setup, API table, config vars).

## Stack

- **Backend** (`backend/`): Python 3.11+, FastAPI, SQLAlchemy 2.0 (ORM, `select()` style), Pydantic v2 + pydantic-settings, PyMuPDF for text extraction, bcrypt + PyJWT for auth. SQLite by default (`DATABASE_URL` overrides). Uploaded PDFs and extracted word JSON live on local disk under `STORAGE_DIR`. Dependencies managed with **uv** (`pyproject.toml`, `uv.lock`).
- **Frontend** (`frontend/`): Next.js 16 (App Router) + React 19 with the React Compiler, TypeScript (strict), Tailwind CSS v4. Vitest + happy-dom + Testing Library for tests. npm (`package-lock.json`).
- **Read `frontend/AGENTS.md` before writing frontend code** — this Next.js version has breaking changes; consult `frontend/node_modules/next/dist/docs/` rather than relying on memory.

## Layout & tiers

- Tier 1 (shared helpers):
  - Backend: `backend/app/security.py` (password hashing, JWTs, `get_current_user` dependency), `backend/app/db.py` (engine, session, `get_db`), `backend/app/config.py` (settings), `backend/app/schemas.py` (request/response models).
  - Frontend: `frontend/lib/` — `api.ts` (API client + token storage), `auth.tsx` (auth context, `useRequireAuth`), `types.ts`, `constants.ts`.
- Tier 2 (feature-scoped helpers):
  - Backend: `backend/app/services/` — `pdf_service.py` (PyMuPDF extraction), `tokenizer.py` (cleaning, ORP, timing). Router-local helpers sit at the top of their router (e.g. `get_owned_document`, `progress_out` in `routers/documents.py`, shared with `routers/progress.py`).
  - Frontend: `frontend/lib/useRsvp.ts` (the reading loop: timing, seeking, session logging) and `frontend/components/` (`RsvpDisplay`, `ReaderControls`, `UploadDropzone`, `TrendChart`, `NavBar`).
- Flow files:
  - Backend: `backend/app/routers/` — `auth.py`, `documents.py`, `progress.py`, `analytics.py`; wired up in `backend/app/main.py`.
  - Frontend: `frontend/app/**/page.tsx` — library (`page.tsx`), `login/`, `read/[id]/`, `analytics/`.
- Models / migrations: `backend/app/models.py` / **none** — tables are created at startup via `Base.metadata.create_all` in `init_db()`. There is no migration tool; adding a column will not alter existing databases (see Project-only rules).
- Tests:
  - Backend: `backend/tests/test_*.py` (pytest; fixtures `client`, `auth`, `document` in `conftest.py` use a throwaway DB and storage dir).
  - Frontend: `frontend/lib/__tests__/*.test.ts` (Vitest, fake timers).
- Architecture docs: `architecture.md` beside each feature's root flow file (none exist yet — create on first change to a feature).

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
- **Ownership scoping:** every user-owned table (`Document`, `Progress`, `ReadingSession`) has a `user_id`, and every query filters on `user.id`. Document access goes through `get_owned_document()` in `routers/documents.py`, which returns **`404`** (hides existence) for someone else's document — reuse it, never re-check ownership inline.
- `config.py` refuses to start with the placeholder or a <32-char `JWT_SECRET` unless `FOVEA_ENV=development`.
- Frontend stores the token in `localStorage` (`fovea.token`) and sends it as `Authorization: Bearer`. A `401` on any request other than login clears the token and signs the user out; pages guard themselves with `useRequireAuth`.

## Project-only rules

- **No migrations exist.** A schema change to an existing table won't reach existing SQLite databases. Flag any model change to the user and agree on a plan (manual `ALTER`, or introducing Alembic) before making it.
- `MAX_UPLOAD_MB` is duplicated in `backend/app/config.py` and `frontend/lib/constants.ts` — change both together.
- Word payloads use a compact shape (`t`, `o`, `m`, `p`) to keep large documents small; keep the backend schema and `frontend/lib/types.ts` in sync.
- PDF parsing is CPU-bound and is offloaded from the event loop in the upload route — keep it that way.

## Project memory

Gotchas and non-obvious decisions for this project live in `engineering/project-memory.md` — read it when a task touches one of its topics; append to it when you learn something future sessions need.
