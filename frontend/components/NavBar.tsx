"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

const LINKS = [
  { href: "/", label: "Library" },
  { href: "/analytics", label: "Analytics" },
];

export function NavBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  // The reader is a full-attention surface; chrome would compete with the words.
  if (pathname?.startsWith("/read/")) return null;

  return (
    <header className="border-b border-line/70">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-5 py-4">
        <Link href="/" className="focus-ring flex items-center gap-2 rounded">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full bg-orp shadow-[0_0_12px_var(--color-orp)]"
          />
          <span className="text-lg font-semibold tracking-tight">Fovea</span>
        </Link>

        {user && (
          <nav className="flex items-center gap-1 text-sm">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`focus-ring rounded-md px-3 py-1.5 transition-colors ${
                    active
                      ? "bg-raised text-text"
                      : "text-muted hover:bg-raised/60 hover:text-text"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="hidden text-muted sm:inline">{user.email}</span>
              <button
                type="button"
                onClick={logout}
                className="focus-ring rounded-md border border-line px-3 py-1.5 text-muted transition-colors hover:border-line hover:text-text"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="focus-ring rounded-md border border-line px-3 py-1.5 text-muted transition-colors hover:text-text"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
