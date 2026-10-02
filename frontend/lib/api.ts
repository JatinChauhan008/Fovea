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

const UNREACHABLE = "Cannot reach the Fovea API. Is the backend running on port 8000?";

/**
 * Turns a finished response into its data, or throws an ApiError carrying the
 * server's reason. A 401 anywhere but the login form means the saved sign-in was
 * rejected, so it is cleared and the app is told to sign out.
 */
function readResponse<T>(status: number, raw: string, path: string, token: string | null): T {
  const ok = status >= 200 && status < 300;
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // Proxies and crashed workers answer with plain text or HTML.
    if (ok) throw new ApiError("The server sent a response Fovea could not read.", status);
  }

  if (status === 401 && token && !path.startsWith("/auth/login")) {
    setToken(null);
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }

  if (!ok) {
    const detail = data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? (detail[0]?.msg ?? "Request failed")
          : `Request failed (${status})`;
    throw new ApiError(message, status);
  }

  return data as T;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // JSON bodies are sent as strings. Forms (sign-in) and uploads set or imply their
  // own type, which must not be overwritten: sign-in sent as JSON arrives empty.
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(UNREACHABLE, 0);
  }

  if (response.status === 204) return undefined as T;
  return readResponse<T>(response.status, await response.text(), path, token);
}

/**
 * Uploads a PDF, reporting the share sent so far (0 to 1) as it goes. Uses
 * XMLHttpRequest because fetch can't report upload progress; responses are read
 * the same way as every other request.
 */
function uploadWithProgress(file: File, onProgress?: (sent: number) => void): Promise<Doc> {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const body = new FormData();
    body.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/upload`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      try {
        resolve(readResponse<Doc>(xhr.status, xhr.responseText, "/upload", token));
      } catch (err) {
        reject(err);
      }
    };
    xhr.onerror = () => reject(new ApiError(UNREACHABLE, 0));
    xhr.send(body);
  });
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
  upload: uploadWithProgress,

  documents: () => request<Doc[]>("/documents"),
  document: (id: number) => request<Doc>(`/documents/${id}`),
  deleteDocument: (id: number) =>
    request<void>(`/documents/${id}`, { method: "DELETE" }),

  content: (id: number, start: number, limit: number) =>
    request<Content>(`/documents/${id}/content?start=${start}&limit=${limit}`),

  // --- progress & sessions ---
  // keepalive lets these finish even when the page is closing, so the last
  // stretch of reading and the reader's place are not lost with the tab.
  saveProgress: (documentId: number, wordIndex: number, page: number, wpm: number) =>
    request<Progress>("/progress", {
      method: "POST",
      keepalive: true,
      body: JSON.stringify({
        document_id: documentId,
        word_index: wordIndex,
        page,
        wpm,
      }),
    }),

  recordSession: (payload: {
    document_id: number;
    start_index: number;
    end_index: number;
    wpm: number;
    duration_seconds: number;
  }) =>
    request<unknown>("/sessions", {
      method: "POST",
      keepalive: true,
      body: JSON.stringify(payload),
    }),

  // --- analytics ---
  /** `utcOffsetMinutes` is the reader's offset from UTC (330 for India), so days are their days. */
  analytics: (utcOffsetMinutes: number) =>
    request<Analytics>(`/analytics/summary?utc_offset_minutes=${utcOffsetMinutes}`),
};
