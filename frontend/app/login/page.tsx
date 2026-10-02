"use client";

/*
 * Sign in or create an account.
 *
 * Docs: ../architecture.md
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorText, PageHeading, PageLoading, TEXT_LINK_CLASS } from "@/components/PageParts";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { user, loading, login, register } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Signing in updates `user`, which lands here and moves on to the library.
  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signingIn = mode === "login";

  // While a saved sign-in is checked, or on the way to the library, show nothing to fill in.
  if (loading || user) return <PageLoading />;

  return (
    <div className="mx-auto max-w-sm pb-20 pt-16">
      <PageHeading>{signingIn ? "Sign in" : "Create an account"}</PageHeading>
      <p className="mt-2 text-muted">
        Fovea shows a PDF one word at a time, holding each word still so your eyes don&apos;t have to
        move.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="field"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">
            Password{!signingIn && <span className="text-faint"> (8 to 72 characters)</span>}
          </span>
          <input
            type="password"
            required
            minLength={8}
            maxLength={signingIn ? undefined : 72}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={signingIn ? "current-password" : "new-password"}
            className="field"
          />
        </label>

        {error && <ErrorText>{error}</ErrorText>}

        <button type="submit" disabled={busy} className="btn btn-solid w-full py-2">
          {busy ? "One moment…" : signingIn ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        {signingIn ? "New here? " : "Already have an account? "}
        <button
          type="button"
          onClick={() => {
            setMode(signingIn ? "register" : "login");
            setError(null);
          }}
          className={`tap ${TEXT_LINK_CLASS}`}
        >
          {signingIn ? "Create an account" : "Sign in"}
        </button>
      </p>
    </div>
  );
}
