/*
 * Any address that isn't a page.
 *
 * Docs: ./architecture.md
 */

import { PageHeading, TextLink } from "@/components/PageParts";

export default function NotFound() {
  return (
    <div className="pb-20 pt-16">
      <PageHeading>Page not found</PageHeading>
      <p className="mt-3 text-muted">There&apos;s nothing at this address.</p>
      <p className="mt-6">
        <TextLink href="/">Go to your library</TextLink>
      </p>
    </div>
  );
}
