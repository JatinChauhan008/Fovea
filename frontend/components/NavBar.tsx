"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

const LINKS = [
  { href: "/", label: "Library" },
  { href: "/analytics", label: "Stats" },
];

/** The name set the way the reader shows a word: recognition point in red. */
export function Wordmark() {
  return (
    <span className="font-serif text-xl font-semibold">
      F<span className="text-orp">o</span>vea
    </span>
  );
}

export function NavBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  // The reader is a full-attention surface; chrome would compete with the words.
  if (pathname?.startsWith("/read/")) return null;

  return (
    <header className="mx-auto flex w-full max-w-4xl items-baseline gap-6 px-5 pb-4 pt-6 sm:px-8">
      <Link href="/" className="rounded-sm">
        <Wordmark />
      </Link>

      {user && (
        <nav aria-label="Main" className="flex items-baseline gap-5 text-sm">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-sm underline-offset-[6px] ${
                  active ? "text-ink underline decoration-1" : "text-muted hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}

      {user && (
        <div className="ml-auto flex items-baseline gap-4 text-sm">
          <span className="hidden max-w-56 truncate text-faint sm:inline">{user.email}</span>
          <button type="button" onClick={logout} className="tap rounded-sm text-muted hover:text-ink">
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}
