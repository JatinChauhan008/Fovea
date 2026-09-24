# Fovea

Fovea is a speed reader for PDFs. Upload a document and it shows you the text one word at a time, in the same spot on the screen, with one letter of each word marked in red. Your eyes stay still and the words come to them.

This style of reading is called RSVP (rapid serial visual presentation). Most of the time spent reading a page goes into moving your eyes: jumping from word to word and line to line. Holding each word in place removes that movement, which makes 300–500 words per minute comfortable for most people.

Fovea remembers where you stopped in every document and keeps a log of how much and how fast you read.

## Contents

- [Getting started](#getting-started)
- [Using the reader](#using-the-reader)
- [How it works](#how-it-works)
- [Configuration](#configuration)
- [Running the tests](#running-the-tests)
- [API](#api)
- [Project layout](#project-layout)
- [Limitations](#limitations)

## Getting started

You need **Python 3.11+** with [uv](https://docs.astral.sh/uv/), and **Node.js 20.9+**.

### 1. Start the backend

```bash
cd backend
cp .env.example .env
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Don't skip the `.env` step. The example file sets `FOVEA_ENV=development`, which lets the API run with the placeholder JWT secret on your own machine. Without it, the API refuses to start (see [Configuration](#configuration)).

The API is now running at http://localhost:8000, with interactive docs at http://localhost:8000/docs.

### 2. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

### 3. Read something

Open http://localhost:3000, create an account and add a PDF. Text-based PDFs up to 40 MB work. Scanned documents need to go through OCR first, because Fovea only reads the text layer.

## Using the reader

Press **Space** to start. When you pause, the words around your position appear in grey underneath, so you can find your place again.

| Key | Action |
|---|---|
| `Space` | Play or pause |
| `←` `→` | Back or forward one word |
| `Shift` + `←` `→` | Back or forward one sentence |
| `↑` `↓` | Speed up or slow down by 25 wpm |
| `Esc` | Pause |

You can also drag the position bar, type a page number into **Go to page**, or pick a preset speed from 200 to 700 wpm (the slider goes from 100 to 900).

Your place and speed are saved every few seconds while you read, and again when you leave. The next time you open the document, it picks up at the same word. Switching to another tab pauses the reader, because browsers slow down timers in background tabs and your position would otherwise creep forward.

**Stats** shows the total words you've read, your time spent reading, your average and fastest speeds, the documents you've finished, and a chart of your speed by day. A reading session is logged whenever you pause, jump somewhere else, change speed, finish or leave. Words you skip past are never counted as read.

## How it works

```
PDF ──▶ extract text ──▶ clean ──▶ split into words ──▶ ORP + timing per word ──▶ saved as JSON
                                                                                       │
                           reader ◀── streamed in 20,000-word chunks ◀────────────────┘
```

The backend extracts and processes the text once, at upload time. The reader then only fetches words, so it never parses the PDF again.

### Cleaning the text

PDF text is messy. Before splitting it into words, Fovea:

- expands ligatures (`ﬁ` → `fi`, `ﬄ` → `ffl`)
- rejoins words hyphenated across a line break (`recog-` / `nition` → `recognition`)
- straightens curly quotes, and turns en and em dashes into plain hyphens
- removes running headers, footers and page numbers: short lines that repeat on most pages
- drops tokens with no letters or digits in them, such as decorative rules and bullets

### Where your eye lands

Readers recognise a word fastest when their eye lands a little left of its centre. This point is called the **optimal recognition point (ORP)**. Fovea marks that letter in red and always draws it in the exact centre of the screen, however long the word is.

| Word length | Highlighted letter |
|---|---|
| 1 | 1st |
| 2–5 | 2nd |
| 6–9 | 3rd |
| 10–13 | 4th |
| 14+ | 5th |

### Timing

At a given speed, each word is shown for `60 / wpm` seconds, multiplied by an extra pause where the text needs one:

| When the word… | Hold multiplier |
|---|---|
| ends a sentence (`.` `!` `?`) | × 2.0 |
| ends a clause (`,` `;` `:`) | × 1.3 |
| has 12 or more letters | × 1.5 |

The multipliers combine, up to a limit of × 3.0. Closing quotes and brackets are ignored when looking for punctuation, so `done."` still gets the full sentence pause. Because of these pauses, your average speed in Stats comes out a little below the speed you set.

## Configuration

The backend reads its settings from environment variables or `backend/.env`. Every setting has a default.

| Variable | Default | Notes |
|---|---|---|
| `FOVEA_ENV` | `production` | Set to `development` to allow the placeholder JWT secret. Never use it in production. |
| `JWT_SECRET` | placeholder | **Required in production:** a random string of 32+ characters. Generate one with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. |
| `JWT_EXPIRE_MINUTES` | `20160` (14 days) | How long a sign-in lasts. |
| `DATABASE_URL` | `sqlite:///backend/fovea.db` | Any SQLAlchemy URL. |
| `STORAGE_DIR` | `backend/storage` | Where uploaded PDFs and their extracted words are kept. |
| `MAX_UPLOAD_MB` | `40` | The frontend checks the same limit in `frontend/lib/constants.ts` (`MAX_UPLOAD_MB`). Change both together. |
| `DEFAULT_WPM` / `MIN_WPM` / `MAX_WPM` | `250` / `100` / `900` | Reading speed defaults and limits. |
| `CORS_ORIGINS` | `["http://localhost:3000","http://127.0.0.1:3000"]` | Add your frontend's address here if it runs somewhere else. |

The frontend has a single setting: `NEXT_PUBLIC_API_URL`, the address of the backend. It defaults to `http://127.0.0.1:8000`.

## Running the tests

```bash
cd backend && uv run pytest        # tokenizer, cleaning, auth, upload, progress, analytics
cd frontend && npm test            # the reading loop in lib/useRsvp.ts (Vitest)
```

The backend tests use a throwaway database and storage folder, so they never touch your data. The frontend tests use fake timers to check that each word is held for exactly the right time, and that jumps and pauses are logged correctly.

## API

Every route except `/health` needs an `Authorization: Bearer <token>` header. Use the token that `/auth/register` or `/auth/login` returns. The full schema is at `/docs` while the backend is running.

| Method | Route | What it does |
|---|---|---|
| `POST` | `/auth/register` | Create an account and return a token |
| `POST` | `/auth/login` | Sign in (OAuth2 password form) |
| `GET` | `/auth/me` | The signed-in user |
| `PATCH` | `/auth/me` | Change the preferred reading speed |
| `POST` | `/upload` | Upload a PDF and extract its text |
| `GET` | `/documents` | List documents, each with its reading progress |
| `GET` | `/documents/{id}` | One document's details |
| `GET` | `/documents/{id}/content?start=&limit=` | A slice of the document's words (up to 50,000 at a time) |
| `DELETE` | `/documents/{id}` | Delete a document, its files, progress and reading history |
| `POST` | `/progress` | Save the reader's position |
| `GET` | `/progress/{document_id}` | Get the saved position |
| `POST` | `/sessions` | Log a stretch of reading |
| `GET` | `/analytics/summary` | Reading totals and speed by day |

Words are sent in a compact form to keep long documents small:

```json
{ "t": "presentation,", "o": 3, "m": 1.95, "p": 12 }
```

`t` is the text, `o` the position of the highlighted letter (counting from 0), `m` the hold multiplier and `p` the page number.

## Project layout

```
backend/
  app/
    main.py              FastAPI app, CORS, router setup
    config.py            settings, including the JWT secret check
    db.py, models.py     SQLAlchemy engine and tables
    schemas.py           request and response models
    security.py          password hashing, JWTs, current-user dependency
    routers/             auth, documents, progress, analytics
    services/
      pdf_service.py     text extraction with PyMuPDF
      tokenizer.py       cleaning, ORP and timing
  tests/
frontend/
  app/                   pages: library, login, read/[id], analytics (Stats)
  components/            word display, reader controls, upload box, chart, nav bar
  lib/
    useRsvp.ts           the reading loop: timing, seeking, logging reading sessions
    api.ts, auth.tsx     API client and sign-in state
```

## Limitations

- **Uploads wait for extraction.** The upload request only returns once the text has been extracted. That takes a few seconds for a large PDF.
- **No OCR.** Scanned PDFs without a text layer are rejected.
- **One machine only.** SQLite and local file storage are fine for personal use or a single server, but won't scale past one.
- **Whole documents in the browser.** Every word of a document is eventually held in browser memory, which is fine for books but not for giant documents.
- **No database migrations.** Tables are created at startup. If a column is removed, it stays in existing databases, unused.
