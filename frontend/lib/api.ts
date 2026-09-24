import type {
  Analytics,
  AuthResponse,
  Content,
  Doc,
  Progress,
} from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const TOKEN_KEY = "fovea.token";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

/** Fired when the API rejects a stored token, so the app can sign out. */
export const SESSION_EXPIRED_EVENT = "fovea:session-expired";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      "Cannot reach the Fovea API. Is the backend running on port 8000?",
      0,
    );
  }

  if (response.status === 204) return undefined as T;

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // Proxies and crashed workers answer with plain text or HTML.
    if (response.ok) {
      throw new ApiError("The server sent a response Fovea could not read.", response.status);
    }
  }

  // A 401 from the login form just means a wrong password; anywhere else, a
  // stored token was rejected and the session is over.
  if (response.status === 401 && token && !path.startsWith("/auth/login")) {
    setToken(null);
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }

  if (!response.ok) {
    const detail = data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? (detail[0]?.msg ?? "Request failed")
          : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export const api = {
  // --- auth ---
  register: (email: string, password: string) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) => {
    // FastAPI's OAuth2 password flow expects form encoding, not JSON.
    const form = new URLSearchParams({ username: email, password });
    return request<AuthResponse>("/auth/login", {
      method: "POST",
      body: form,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },

  me: () => request<AuthResponse["user"]>("/auth/me"),

  // --- documents ---
  upload: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<Doc>("/upload", { method: "POST", body });
  },

  documents: () => request<Doc[]>("/documents"),
  document: (id: number) => request<Doc>(`/documents/${id}`),
  deleteDocument: (id: number) =>
    request<void>(`/documents/${id}`, { method: "DELETE" }),

  content: (id: number, start = 0, limit = 20000) =>
    request<Content>(`/documents/${id}/content?start=${start}&limit=${limit}`),

  // --- progress & sessions ---
  saveProgress: (documentId: number, wordIndex: number, page: number, wpm: number) =>
    request<Progress>("/progress", {
      method: "POST",
      body: JSON.stringify({
        document_id: documentId,
        word_index: wordIndex,
        page,
        wpm,
      }),
    }),

  progress: (documentId: number) => request<Progress>(`/progress/${documentId}`),

  recordSession: (payload: {
    document_id: number;
    start_index: number;
    end_index: number;
    wpm: number;
    duration_seconds: number;
  }) => request<unknown>("/sessions", { method: "POST", body: JSON.stringify(payload) }),

  // --- analytics ---
  analytics: () => request<Analytics>("/analytics/summary"),
};
