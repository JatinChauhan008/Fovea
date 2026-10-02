/**
 * API client tests: when a saved sign-in is dropped, and which requests must
 * survive the page closing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, getToken, SESSION_EXPIRED_EVENT, setToken } from "../api";

function respond(status: number, body: unknown = {}) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

describe("api client", () => {
  beforeEach(() => setToken("saved-token"));
  afterEach(() => {
    vi.unstubAllGlobals();
    setToken(null);
  });

  it("keeps the saved sign-in when the server can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(api.me()).rejects.toMatchObject({ status: 0 });
    expect(getToken()).toBe("saved-token");
  });

  it("keeps the saved sign-in when the server errors", async () => {
    vi.stubGlobal("fetch", respond(500, { detail: "boom" }));

    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
    expect(getToken()).toBe("saved-token");
  });

  it("drops the saved sign-in and announces it when the server rejects the token", async () => {
    vi.stubGlobal("fetch", respond(401, { detail: "Could not validate credentials" }));
    const expired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);

    await expect(api.me()).rejects.toMatchObject({ status: 401 });

    expect(getToken()).toBeNull();
    expect(expired).toHaveBeenCalledOnce();
    window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  });

  it("sends position saves and session logs with keepalive so they outlive the page", async () => {
    const fetchMock = respond(200);
    vi.stubGlobal("fetch", fetchMock);

    await api.saveProgress(1, 10, 1, 300);
    await api.recordSession({
      document_id: 1,
      start_index: 0,
      end_index: 10,
      wpm: 300,
      duration_seconds: 2,
    });

    for (const call of fetchMock.mock.calls) {
      expect(call[1]).toMatchObject({ keepalive: true });
    }
  });
});

describe("api.analytics", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the reader's UTC offset so days follow their own clock", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await api.analytics(330);

    expect(String(fetchMock.mock.calls[0][0])).toContain("/analytics/summary?utc_offset_minutes=330");
  });
});
