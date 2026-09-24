# Fovea

Turn a PDF into a focused, one-word-at-a-time RSVP reading experience.

Fovea extracts text from PDFs, cleans it, tokenizes it, highlights each word's Optimal Recognition Point, and presents the stream with pacing that respects punctuation and long words. It has no AI features, no model provider configuration, and no generated summaries or quizzes.

```
Upload PDF -> extract text -> clean & tokenize -> compute ORP + pacing per word
           -> stream words to the reader -> save progress -> show analytics
```

**Stack:** FastAPI + PyMuPDF + SQLite (backend) · Next.js 16 + React 19 + Tailwind v4 (frontend).

## Quick Start

Backend first:

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000, create an account, and drop in a PDF. API docs live at http://localhost:8000/docs.

Run backend tests with:

```bash
cd backend
uv run pytest
```

## Features

### Upload And Extraction

PDF uploads are validated by extension, size, and magic bytes, then parsed with PyMuPDF. Extracted tokens are written to disk as JSON so the reader does not re-parse the PDF while reading.

Fovea rejects non-PDFs, oversized files, password-protected PDFs, and scanned PDFs with no text layer.

### Text Cleaning

Raw PDF text is normalized before tokenizing:

- Ligatures are expanded, such as `fi` and `ffl`.
- Hyphenated line breaks are rejoined.
- Typographic quotes, dashes, and non-breaking spaces are folded.
- Repeated running heads and footers are removed.
- Decorative tokens with no alphanumeric characters are dropped.

### Optimal Recognition Point

The reader pins each word's recognition point to the center of the display so the eye does not travel horizontally.

| Word length | ORP index |
|---|---:|
| 1 | 0 |
| 2-5 | 1 |
| 6-9 | 2 |
| 10-13 | 3 |
| 14+ | 4 |

### Word Timing

Every word holds for `(60 / WPM) x multiplier` seconds.

| Condition | Multiplier |
|---|---:|
| Sentence end (`.` `!` `?`) | 2.0 |
| Clause break (`,` `;` `:`) | 1.3 |
| Word of 12+ letters | 1.5 |
| Combined | product, capped at 3.0 |

Trailing quotes and brackets are ignored when detecting punctuation, so `done."` still gets a sentence-end pause.

### Reader Controls

- Play and pause with the button or spacebar.
- Step by word with left/right arrows.
- Step by sentence with shift + left/right arrows.
- Use presets, the WPM slider, or up/down arrows for speed.
- Jump to a page or scrub through the document.
- See word index, percent complete, current page, and estimated time remaining.
- Auto-pause when the tab is hidden to avoid logging bogus reading time.

### Progress And Analytics

Fovea saves position, page, and WPM per user and document. Reading sessions are logged with word range, speed, and duration, then summarized into total words read, minutes read, documents completed, streak, best speed, average speed, and a daily trend chart.

## API

All routes except `/health` require `Authorization: Bearer <token>`.

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/auth/register` | Create an account and return a token |
| `POST` | `/auth/login` | OAuth2 password form login |
| `GET` | `/auth/me` | Current user |
| `PATCH` | `/auth/me` | Update preferred speed |
| `POST` | `/upload` | Upload a PDF |
| `GET` | `/documents` | List documents with progress |
| `GET` | `/documents/{id}` | Document metadata |
| `GET` | `/documents/{id}/content` | Token slice |
| `DELETE` | `/documents/{id}` | Delete document files and metadata |
| `POST` | `/progress` | Save reader position |
| `GET` | `/progress/{document_id}` | Resume reader position |
| `POST` | `/sessions` | Log a stretch of reading |
| `GET` | `/analytics/summary` | Aggregate reading stats and daily trend |

Content tokens are compact by design: `{"t": "presentation,", "o": 3, "m": 1.95, "p": 1}`.

## Layout

```
backend/
  app/
    main.py            FastAPI app, CORS, routers
    config.py          Settings
    db.py  models.py   SQLAlchemy engine and schema
    schemas.py         Pydantic request/response models
    security.py        bcrypt hashing, JWT, current-user dependency
    routers/           auth, documents, progress, analytics
    services/
      pdf_service.py   PyMuPDF extraction
      tokenizer.py     cleaning, ORP, pacing
  tests/               backend unit and API tests
frontend/
  app/                 library, login, read/[id], analytics
  components/          reader display, controls, upload, charts, nav
  lib/                 API client, auth context, RSVP engine, types
```

The RSVP loop lives in `frontend/lib/useRsvp.ts`.

## Known Limitations

- Uploads are synchronous.
- Scanned PDFs need OCR first.
- SQLite and local file storage are intended for single-machine use.
- There is no frontend test suite yet.
- Very large token streams are loaded fully into browser memory.
