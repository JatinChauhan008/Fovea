# Fovea web app

> Part of feature: **fovea** · siblings: `../../backend/app/routers/architecture.md` (primary doc, with "How the repos connect")

## Overview

The pages a reader uses: sign in, the library (upload, continue reading, delete), the reader itself (one word at a time with the place kept saved), and Stats. All pages are client components that call the API through `lib/api.ts`; the signed-in state lives in `lib/auth.tsx`.

Shared look: `components/PageParts.tsx` holds the page heading, error line, text link (and its class for link-styled buttons) and loading line, so every page uses the same pieces. Colours are the paper/ink tokens in `globals.css`; the quietest ink (`--ink-faint`) meets 4.5:1 contrast in both themes. On touch screens (`pointer: coarse`) every `.btn` and `.tap` control is at least 44px. Pages add their own bottom space, so the reader can be exactly one screen tall. `app/not-found.tsx` and `app/error.tsx` (with `retry`) cover unknown addresses and pages that crash. The tab icon is `app/icon.svg`: the red recognition letter between the reader's two notches, with dark-mode colours.

## Submodule map

| Submodule | Trigger |
|---|---|
| Sign-in | `/login`; the app's first load (restoring a saved sign-in) |
| Library | `/` |
| Reader | `/read/[id]` |
| Stats | `/analytics` |
| Not found / error | any unknown address; any page that throws while rendering |

---

## Submodule: Sign-in

### Trigger
Visiting `/login`; any page load with a saved token; any 401 from the API.

### Business use case
Create an account or sign in; stay signed in across visits; never get signed out just because the server was briefly down.

### Flow (English)
On load, if a token is saved, ask the server who it belongs to; every page, the login page included, shows a loading line until that answer arrives (so a signed-in reader never sees the login form flash). A 401 clears the token (the reader lands on `/login`); any other failure keeps the token and shows "Can't reach Fovea right now" with Try again. Signing in or up stores the new token. Any later 401 from any request clears the token and signs the reader out.

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
- Reloading while signed in: a loading line, never the login form.
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
While the sign-in is checked, show the loading line. Fetch the documents (each with the reader's place). Show "You were on page N of …" for the most recently read unfinished one. Each row (`DocumentRow`) shows pages, words and an estimate at the reader's speed (`formatDuration`), then "Finished" (from the server's `finished`), a progress bar, or "Not started". Uploading (`UploadDropzone`) shows the upload percentage, then "Extracting text…", and adds the new document to the top; dropping several files adds the first and says so. Delete asks inline ("Yes, delete" / "Keep", focus moves to the confirm button); on mouse screens it appears on hover or focus, on touch screens it is always shown.

### Helpers
- `DocumentRow`, `UploadDropzone`, `PageParts` (`components/`), `formatDuration` (`lib/format.ts`), `DEFAULT_WPM` (`lib/constants.ts`), `api.upload` (XMLHttpRequest, so it can report progress).

### Data model
n/a — API data only.

### Security & scoping
n/a — the server scopes the list to the reader.

### Tests
#### Layer 1 — DB helper tests
n/a — no database in the frontend.
#### Layer 2 — Non-DB helper tests
`lib/__tests__/format.test.ts`: minutes, at least one minute, whole hours, hours and minutes. `components/__tests__/DocumentRow.test.tsx`: size and estimate, Finished from the server, inline delete confirmation and backing out. `components/__tests__/UploadDropzone.test.tsx`: upload percentage then extracting, only the first of several files with a note, the highlight survives moving over the button. `lib/__tests__/api.test.ts`: upload progress, the server's refusal reason, sign-out on 401, unreachable server.
#### Layer 3 — Flow tests
n/a — the page keeps its own small fetch, delete and "last read" logic inline (unlike the reader, it wasn't split into hooks); it is covered by the visual checklist and the layer 6 scenarios.
#### Layer 4 — API e2e
n/a — covered by the backend's layer 4.
#### Layer 5 — API user journey
n/a — see the backend doc.
#### Layer 6 — Browser e2e
- Upload a text PDF; it appears at the top with pages and words.
- Upload a scanned PDF; the OCR message shows and nothing is added.
- Delete a document; it disappears and stays gone after reload.

### Visual checklist (manual, on request)
- Empty library, loading, populated, a failed load (error only, no "Nothing here yet"), and an upload error (too big, scanned PDF).
- Upload of a large file: the percentage climbs, then "Extracting text from …".
- Long titles truncate; rows at phone width; Delete visible and 44px tall on a phone, hidden until hover on desktop.
- Inline delete: "Yes, delete" / "Keep" fit on one line at phone width.

### LLM-judge points
n/a — all assertions are deterministic.

---

## Submodule: Reader

### Trigger
`/read/[id]`.

### Business use case
Read a document one word at a time at a chosen speed, find your place again, jump around, and have the place and reading time saved without thinking about it.

### Flow (English)
1. `useDocumentWords` fetches the document, then its words up to the saved place (so a resume lands on the right word), then streams the rest behind the reader. If a later chunk fails, the reader stays open with what has loaded and says the rest didn't arrive.
2. `useReader` runs the reading loop (`useRsvp`) and joins it to `useProgressSaver`: each finished stretch is logged and the place is saved every 5 s while playing, on every stretch end, when the tab is hidden and when the reader leaves; all with `keepalive`. A failing save shows "Your place isn't being saved right now".
3. `useReaderKeys` maps Space, arrows (Shift for sentences), Up/Down (speed within 100–900) and Escape.
4. `usePauseWhenHidden` pauses when the tab is hidden (browsers throttle hidden timers).
5. `useRememberSpeed` carries the last speed back to the library's estimates.

Inside `useRsvp`: each word is held for `60 / wpm × multiplier` seconds; a stretch is words read continuously at one speed, closed by pause, jump, speed change, finish or leaving. Jumping to a page or position that hasn't streamed in yet pauses and waits ("Loading page N…"), then lands; pressing play cancels the wait so skipped words are never logged. A newly arrived chunk doesn't restart the word on screen; a single step never waits for more words.

### Helpers
- `useDocumentWords`, `useReader`, `useRsvp`, `useProgressSaver`, `useReaderKeys`, `usePauseWhenHidden` — Tier 2 (`lib/`).
- `RsvpDisplay` (the word is a Play/Pause button; long words shrink via `lib/wordSize.ts`), `ReaderControls` — `components/`.

### Data model
n/a — API data only.

### Security & scoping
n/a — the server refuses other readers' documents (the page shows "Document not found").

### Tests
#### Layer 1 — DB helper tests
n/a — no database in the frontend.
#### Layer 2 — Non-DB helper tests
`useRsvp.test.ts`: timing per word, sentence and long-word holds, the ×3 cap, speed changes, stretch reporting, jumps not counted, waiting at the loaded end, a chunk not restarting the word, waiting for an unloaded page or position, play cancelling the wait, a single step not waiting, giving up on a page that doesn't exist. `useProgressSaver.test.ts`: periodic saves while playing only, saves when hidden, logs a stretch with a save, reports failing saves until one succeeds. `useDocumentWords.test.ts`: preferred speed for a new document, loads to the saved place then streams the rest, bad link, unopenable document, a failed later chunk keeps the reader open, waits for sign-in. `useReaderKeys.test.ts`: every shortcut, speed limits, ignores form fields and Space on a button. `wordSize.test.ts`: never above the normal size, sized by the longer side, longer words get a smaller limit. `components/__tests__/RsvpDisplay.test.tsx`: tapping the word plays/pauses, labelled Pause while reading, the red letter is marked. `useReader.test.ts`: a paused stretch reaches the saver, finishing saves the place, a hidden tab pauses only while playing. `api.test.ts`: keepalive on both save calls.
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
- The red letter stays in the exact centre for short and very long words (try "internationalization" and a URL), at 375px and desktop width; long words shrink and never clip.
- The reader fills exactly one screen: no page scrollbar on desktop, none from phone browser bars.
- Tapping the word plays and pauses on a phone; the focus ring shows when tabbing to it.
- Paused context words appear; the speed row (slider, wpm, presets) and "Page [n] of N" wrap cleanly on a phone; presets and step buttons are 44px on touch.
- "Keyboard shortcuts" disclosure only on mouse-and-keyboard screens.
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
n/a — the page fetches the summary inline and keeps two small display helpers; covered by the visual checklist.
#### Layer 4 — API e2e
n/a — covered by the backend's layer 4.
#### Layer 5 — API user journey
n/a — see the backend doc.
#### Layer 6 — Browser e2e
- With no reading, the empty message shows; after reading, the numbers and (from the second day) the chart appear.

### Visual checklist (manual, on request)
- Empty, loading, error and populated states; the chart and its table toggle; phone width; dark mode.
- "fastest" is left out when no stretch reached 50 words.

### LLM-judge points
n/a — all assertions are deterministic.

---

## Submodule: Not found / error

### Trigger
`app/not-found.tsx` for any unknown address; `app/error.tsx` when a page throws while rendering.

### Business use case
Never leave the reader on a bare framework page; always offer a way back.

### Flow (English)
Not found: heading, one line, a link to the library. Error: heading, one line, "Try again" (the framework's `retry`) and a link to the library; the error is written to the browser console, the only console output kept, since there is no error reporter.

### Helpers
`PageHeading`, `TextLink` (`components/PageParts.tsx`).

### Data model
n/a — no data.

### Security & scoping
n/a — no data shown.

### Tests
#### Layer 1 — DB helper tests
n/a — no database in the frontend.
#### Layer 2 — Non-DB helper tests
n/a — static markup.
#### Layer 3 — Flow tests
n/a — no logic.
#### Layer 4 — API e2e
n/a — no API.
#### Layer 5 — API user journey
n/a — no API.
#### Layer 6 — Browser e2e
- Visit `/nope`: the not-found page shows with the nav bar and a working link home.

### Visual checklist (manual, on request)
- Both pages in light and dark mode, at phone width.
- The tab icon is Fovea's red "o" mark (not the Next.js default) in light and dark browser themes.

### LLM-judge points
n/a — all assertions are deterministic.
