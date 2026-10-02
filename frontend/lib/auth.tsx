"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ServerUnreachable } from "@/components/ServerUnreachable";
import { api, ApiError, getToken, SESSION_EXPIRED_EVENT, setToken } from "./api";
import type { User } from "./types";

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Note the speed the reader last read at; the server already saved it. */
  rememberSpeed: (wpm: number) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const router = useRouter();

  // Restore the session from the stored token, if it is still valid. Only the
  // server saying "invalid" (a 401, which also clears the token) signs the reader
  // out; a server that is down or erroring keeps the token and offers a retry.
  const restore = useCallback(() => {
    setUnreachable(false);
    setLoading(true);
    api
      .me()
      .then(setUser)
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) setUnreachable(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!getToken()) {
      // Deferred so the "no session" result lands like any other async
      // resolution rather than cascading a second render immediately.
      queueMicrotask(() => setLoading(false));
      return;
    }
    queueMicrotask(restore);
  }, [restore]);

  // A token that expires mid-session drops the user back at the login screen
  // (via useRequireAuth) instead of leaving every request failing with a 401.
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login(email, password);
    setToken(result.access_token);
    setUser(result.user);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const result = await api.register(email, password);
    setToken(result.access_token);
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  const rememberSpeed = useCallback((wpm: number) => {
    // Same speed: keep the same object, so nothing that depends on the account re-runs.
    setUser((current) =>
      current && current.preferred_wpm !== wpm ? { ...current, preferred_wpm: wpm } : current,
    );
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, rememberSpeed }),
    [user, loading, login, register, logout, rememberSpeed],
  );

  return (
    <AuthContext.Provider value={value}>
      {unreachable ? <ServerUnreachable onRetry={restore} /> : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

/**
 * When the reader leaves a document, record the speed they were reading at, so the
 * library's reading-time estimates match it without reloading the account.
 */
export function useRememberSpeed(wpm: number) {
  const { rememberSpeed } = useAuth();
  const latest = useRef(wpm);
  useEffect(() => {
    latest.current = wpm;
  }, [wpm]);
  useEffect(() => () => rememberSpeed(latest.current), [rememberSpeed]);
}

/** Send unauthenticated visitors to the login screen. */
export function useRequireAuth() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  return { user, loading };
}
