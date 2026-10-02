"use client";

/*
 * Shown instead of a page that crashed while rendering, with a way to try again.
 * (This Next.js version passes `retry`, not `reset`.)
 *
 * Docs: ./architecture.md
 */

import { useEffect } from "react";
import { PageHeading, TextLink } from "@/components/PageParts";

export default function PageError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // The one place console output is kept: there is no error reporter yet.
    console.error(error);
  }, [error]);

  return (
    <div className="pb-20 pt-16">
      <PageHeading>Something went wrong</PageHeading>
      <p className="mt-3 text-muted">This page hit a problem. Your library and your place are safe.</p>
      <div className="mt-6 flex items-center gap-6">
        <button type="button" onClick={retry} className="btn btn-solid">
          Try again
        </button>
        <TextLink href="/">Go to your library</TextLink>
      </div>
    </div>
  );
}
