# Fovea web app

> Part of feature: **fovea** · siblings: `../../backend/app/routers/architecture.md` (primary doc, with "How the repos connect")

## Overview

The pages a reader uses: sign in, the library (upload, continue reading, delete), the reader itself (one word at a time with the place kept saved), and Stats. All pages are client components that call the API through `lib/api.ts`; the signed-in state lives in `lib/auth.tsx`.

## Submodule map

| Submodule | Trigger |
|---|---|
| Sign-in | `/login`; the app's first load (restoring a saved sign-in) |
| Library | `/` |
| Reader | `/read/[id]` |
| Stats | `/analytics` |

---

## Submodule: Sign-in

### Trigger
Visiting `/login`; any page load with a saved token; any 401 from the API.

### Business use case
Create an account or sign in; stay signed in across visits; never get signed out just because the server was briefly down.

### Flow (English)
On load, if a token is saved, ask the server who it belongs to. A 401 clears the token (the reader lands on `/login`); any other failure keeps the token and shows "Can't reach Fovea right now" with Try again. Signing in or up stores the new token. Any later 401 from any request clears the token and signs the reader out.

### Helpers
- `AuthProvider`, `useAuth`, `useRequireAuth`, `useRememberSpeed` — Tier 1 (`lib/auth.tsx`).
- `api`, `ApiError`, `getToken`/`setToken`, `SESSION_EXPIRED_EVENT` — Tier 1 (`lib/api.ts`).
- `ServerUnreachable` — `components/ServerUnreachable.tsx`.

### Data model
n/a — browser storage key `fovea.token` only.

### Security & scoping
The token is in `localStorage` and sent as a bearer header; the server is the real gate. Sign-up asks for 8–72 characters (the server enforces 72 bytes).

### Tests
#### Layer 1 — DB helper tests
n/a — no database in the frontend.
#### Layer 2 — Non-DB helper tests
`lib/__tests__/api.test.ts`: network failure and 500 keep the token; a 401 clears it and announces it.
#### Layer 3 — Flow tests
`lib/__tests__/auth.test.tsx`: an unreachable server shows the retry screen and keeps the token; retry carries on; leaving a document updates the remembered speed.
#### Layer 4 — API e2e
n/a — covered by the backend's layer 4.
#### Layer 5 — API user journey
n/a — see the backend doc.
#### Layer 6 — Browser e2e
- Sign up, land on the library, sign out, sign back in.
- Stop the backend, reload: the retry screen shows; start it, Try again: back in, still signed in.

### Visual checklist (manual, on request)
- Login and sign-up forms at phone and desktop width; error text under a wrong password.
- Retry screen centred, readable in light and dark mode.

### LLM-judge points
n/a — all assertions are deterministic.

---

## Submodule: Library

### Trigger
`/`.

### Business use case
Upload PDFs, see each document's size, estimated reading time and progress, continue the last one, delete one.

### Flow (English)
Fetch the documents (each with the reader's place). Show "You were on page N of …" for the most recently read unfinished one. Each row shows pages, words and an estimate at the reader's speed (`formatDuration`), then "Finished" (from the server's `finished`), a progress bar, or "Not started". Uploading adds the new document to the top; deleting asks first, then removes the row.

### Helpers
- `UploadDropzone` (`components/`), `formatDuration` (`lib/format.ts`), `DEFAULT_WPM` (`lib/constants.ts`).

### Data model
n/a — API data only.

### Security & scoping
n/a — the server scopes the list to the reader.

### Tests
#### Layer 1 — DB helper tests
n/a — no database in the frontend.
#### Layer 2 — Non-DB helper tests
`lib/__tests__/format.test.ts`: minutes, at least one minute, whole hours, hours and minutes.
#### Layer 3 — Flow tests
n/a — the page only composes the helpers above; checked by the visual checklist.
#### Layer 4 — API e2e
n/a — covered by the backend's layer 4.
#### Layer 5 — API user journey
n/a — see the backend doc.
#### Layer 6 — Browser e2e
- Upload a text PDF; it appears at the top with pages and words.
- Upload a scanned PDF; the OCR message shows and nothing is added.
- Delete a document; it disappears and stays gone after reload.

### Visual checklist (manual, on request)
- Empty library, loading, populated, and an upload error.
- Long titles truncate; rows at phone width; delete reachable on touch screens.

### LLM-judge points
n/a — all assertions are deterministic.

---

## Submodule: Reader

### Trigger
`/read/[id]`.

### Business use case
Read a document one word at a time at a chosen speed, find your place again, jump around, and have the place and reading time saved without thinking about it.

### Flow (English)
1. `useDocumentWords` fetches the document, then its words up to the saved place (so a resume lands on the right word), then streams the rest behind the reader.
2. `useReader` runs the reading loop (`useRsvp`) and joins it to `useProgressSaver`: each finished stretch is logged and the place is saved every 5 s while playing, on every stretch end, when the tab is hidden and when the reader leaves; all with `keepalive`. A failing save shows "Your place isn't being saved right now".
3. `useReaderKeys` maps Space, arrows (Shift for sentences), Up/Down (speed within 100–900) and Escape.
4. `usePauseWhenHidden` pauses when the tab is hidden (browsers throttle hidden timers).
5. `useRememberSpeed` carries the last speed back to the library's estimates.

Inside `useRsvp`: each word is held for `60 / wpm × multiplier` seconds; a stretch is words read continuously at one speed, closed by pause, jump, speed change, finish or leaving. Jumping to a page or position that hasn't streamed in yet pauses and waits ("Loading page N…"), then lands; pressing play cancels the wait so skipped words are never logged. A newly arrived chunk doesn't restart the word on screen; a single step never waits for more words.

### Helpers
- `useDocumentWords`, `useReader`, `useRsvp`, `useProgressSaver`, `useReaderKeys`, `usePauseWhenHidden` — Tier 2 (`lib/`).
- `RsvpDisplay`, `ReaderControls` — `components/`.

### Data model
n/a — API data only.

### Security & scoping
n/a — the server refuses other readers' documents (the page shows "Document not found").

### Tests
#### Layer 1 — DB helper tests
n/a — no database in the frontend.
#### Layer 2 — Non-DB helper tests
`useRsvp.test.ts`: timing per word, sentence and long-word holds, the ×3 cap, speed changes, stretch reporting, jumps not counted, waiting at the loaded end, a chunk not restarting the word, waiting for an unloaded page or position, play cancelling the wait, a single step not waiting, giving up on a page that doesn't exist. `useProgressSaver.test.ts`: periodic saves while playing only, saves when hidden, logs a stretch with a save, reports failing saves until one succeeds. `useDocumentWords.test.ts`: preferred speed for a new document, loads to the saved place then streams the rest, bad link, unopenable document, waits for sign-in. `useReaderKeys.test.ts`: every shortcut, speed limits, ignores form fields and Space on a button. `useReader.test.ts`: a paused stretch reaches the saver, finishing saves the place, a hidden tab pauses only while playing. `api.test.ts`: keepalive on both save calls.
#### Layer 3 — Flow tests
n/a — the page composes the hooks above; checked by the visual checklist.
#### Layer 4 — API e2e
n/a — covered by the backend's layer 4.
#### Layer 5 — API user journey
n/a — see the backend doc.
#### Layer 6 — Browser e2e
- Open a document, play for a few seconds, close the tab; reopen: it resumes at the same word and Stats shows the stretch.
- In a long book, type a far page before it loads: "Loading page N…" then it jumps there.
- Stop the backend while reading: the "isn't being saved" notice appears; restart: it clears.

### Visual checklist (manual, on request)
- The red letter stays in the exact centre for short and very long words, at phone and desktop width.
- Paused context words appear; controls wrap cleanly on a phone; keyboard hints only on wide screens.
- Loading, "Loading page N…", save-failure notice, end-of-document message; light and dark mode.

### LLM-judge points
n/a — all assertions are deterministic.

---

## Submodule: Stats

### Trigger
`/analytics`.

### Business use case
See how much and how fast you've read, and whether you're keeping a streak.

### Flow (English)
Fetch the summary with the browser's UTC offset (`-getTimezoneOffset()`), then show words, time (`formatDuration`), average and fastest speed, finished documents and the streak, and the daily speed chart (with a table view).

### Helpers
- `TrendChart` (`components/`), `formatDuration` (`lib/format.ts`).

### Data model
n/a — API data only.

### Security & scoping
n/a — the server scopes everything to the reader.

### Tests
#### Layer 1 — DB helper tests
n/a — no database in the frontend.
#### Layer 2 — Non-DB helper tests
`api.test.ts`: the offset is sent. `format.test.ts`.
#### Layer 3 — Flow tests
n/a — the page composes the helpers above.
#### Layer 4 — API e2e
n/a — covered by the backend's layer 4.
#### Layer 5 — API user journey
n/a — see the backend doc.
#### Layer 6 — Browser e2e
- With no reading, the empty message shows; after reading, the numbers and (from the second day) the chart appear.

### Visual checklist (manual, on request)
- Empty, loading, error and populated states; the chart and its table toggle; phone width; dark mode.

### LLM-judge points
n/a — all assertions are deterministic.
