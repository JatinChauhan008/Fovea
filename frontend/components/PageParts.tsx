import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/*
 * The small pieces every page shares, so headings, error lines, links and
 * loading states look and behave the same everywhere.
 */

/** Underlined ink link that turns red on hover; also used for link-styled buttons. */
export const TEXT_LINK_CLASS =
  "rounded-sm text-ink underline decoration-1 underline-offset-4 hover:text-orp";

export function TextLink({ className = "", ...props }: ComponentProps<typeof Link>) {
  return <Link {...props} className={`${TEXT_LINK_CLASS} ${className}`} />;
}

/** The page title. */
export function PageHeading({ children }: { children: ReactNode }) {
  return <h1 className="font-serif text-3xl font-semibold">{children}</h1>;
}

/** A problem the reader should know about, announced to screen readers. Small by default. */
export function ErrorText({
  children,
  size = "small",
  className = "",
}: {
  children: ReactNode;
  size?: "small" | "normal";
  className?: string;
}) {
  return (
    <p role="alert" className={`${size === "small" ? "text-sm" : ""} text-orp ${className}`}>
      {children}
    </p>
  );
}

/**
 * A loading line: centred low on the page while a whole page waits (the sign-in
 * check), or `inline` where one section waits for its data.
 */
export function PageLoading({
  label = "Loading…",
  inline = false,
  className = "",
}: {
  label?: string;
  inline?: boolean;
  className?: string;
}) {
  return (
    <p role="status" className={`${inline ? "" : "pt-24 text-center"} text-sm text-faint ${className}`}>
      {label}
    </p>
  );
}
