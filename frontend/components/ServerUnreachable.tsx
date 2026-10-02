"use client";

/** Shown instead of the app when Fovea's server can't be reached, so the reader stays signed in. */
export function ServerUnreachable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-sm pt-24 text-center">
      <p className="font-serif text-xl">Can&apos;t reach Fovea right now.</p>
      <p className="mt-2 text-sm text-muted">
        The server isn&apos;t answering. You&apos;re still signed in; try again in a moment.
      </p>
      <button type="button" onClick={onRetry} className="btn btn-solid mt-6">
        Try again
      </button>
    </div>
  );
}
