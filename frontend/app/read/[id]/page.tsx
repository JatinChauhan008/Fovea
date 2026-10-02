"use client";

/*
 * The reader: one document, one word at a time.
 *
 * Load the document (words up to the saved place first, the rest streaming in),
 * then run the reading loop with the place kept saved, keyboard shortcuts, and a
 * pause whenever the tab is hidden.
 *
 * Docs: ../../architecture.md
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { ErrorText, PageLoading, TextLink } from "@/components/PageParts";
import { ReaderControls } from "@/components/ReaderControls";
import { RsvpDisplay } from "@/components/RsvpDisplay";
import { useRememberSpeed, useRequireAuth } from "@/lib/auth";
import { MAX_WPM, MIN_WPM } from "@/lib/constants";
import { type LoadedDocument, useDocumentWords } from "@/lib/useDocumentWords";
import { useReader } from "@/lib/useReader";
import { usePauseWhenHidden, useReaderKeys } from "@/lib/useReaderKeys";

export default function ReaderPage() {
  const params = useParams<{ id: string }>();
  const { user, loading } = useRequireAuth();

  // Fetch the document and its words, once the sign-in is known.
  const { loaded, error, streamError } = useDocumentWords(Number(params.id), user);

  if (error) {
    return (
      <div className="pt-24 text-center">
        <ErrorText size="normal">{error}</ErrorText>
        <p className="mt-4">
          <TextLink href="/">Back to the library</TextLink>
        </p>
      </div>
    );
  }

  if (loading || !user || !loaded) {
    return <PageLoading label="Opening document…" />;
  }

  return <Reader key={loaded.doc.id} {...loaded} streamError={streamError} />;
}

function Reader({ streamError, ...loaded }: LoadedDocument & { streamError: string | null }) {
  const { doc, tokens, total } = loaded;

  // The reading loop, with the reader's place kept saved as they go.
  const reader = useReader(loaded);

  // Space, arrows and Escape drive the reader.
  useReaderKeys(reader);

  // Stop when the tab is hidden, since browsers slow its timers down.
  usePauseWhenHidden(reader.playing, reader.pause);

  // Carry the speed back to the library's reading-time estimates on the way out.
  useRememberSpeed(reader.wpm);

  return (
    // Exactly one screen tall (dynamic height, so phone browser bars don't add a scroll).
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <header className="flex items-baseline gap-4 pt-6">
        <Link href="/" className="tap shrink-0 rounded-sm text-sm text-muted hover:text-ink">
          ← Library
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-center font-serif text-muted" title={doc.title}>
          {doc.title}
        </h1>
        <span className="shrink-0 text-sm tabular-nums text-faint">{Math.floor(reader.percent)}%</span>
      </header>

      <div className="flex flex-1 flex-col justify-center py-10">
        <RsvpDisplay
          tokens={tokens}
          index={reader.index}
          playing={reader.playing}
          onToggle={reader.toggle}
        />

        <div className="mt-12">
          <ReaderControls
            playing={reader.playing}
            wpm={reader.wpm}
            minWpm={MIN_WPM}
            maxWpm={MAX_WPM}
            index={reader.index}
            total={total}
            loadedCount={tokens.length}
            page={reader.page}
            pageCount={doc.page_count}
            waitingForPage={reader.waitingForPage}
            minutesLeft={reader.minutesLeft}
            onToggle={reader.toggle}
            onStep={(direction) => (direction === -1 ? reader.stepBack() : reader.stepForward())}
            onSentence={reader.stepSentence}
            onSeek={reader.seek}
            onWpm={reader.setWpm}
            onJumpToPage={reader.jumpToPage}
          />
        </div>

        {streamError && (
          <ErrorText className="mt-8 text-center">
            The rest of this document didn&apos;t load ({streamError}). Reload the page to try again.
          </ErrorText>
        )}

        {reader.saveFailed && (
          <p role="status" className="mt-8 text-center text-sm text-orp">
            Your place isn&apos;t being saved right now. Fovea will keep trying.
          </p>
        )}

        {reader.finished && !reader.playing && (
          <p className="mt-8 text-center text-sm text-muted">
            That&apos;s the end of the document. <TextLink href="/">Back to the library</TextLink>{" "}
            or press play to start over.
          </p>
        )}
      </div>
    </div>
  );
}
