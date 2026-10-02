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

describe("api.upload", () => {
  class FakeXhr {
    static last: FakeXhr;
    upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    status = 0;
    responseText = "";
    headers: Record<string, string> = {};
    constructor() {
      FakeXhr.last = this;
    }
    open() {}
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    }
    send() {}
    respond(status: number, body: unknown) {
      this.status = status;
      this.responseText = JSON.stringify(body);
      this.onload?.();
    }
  }

  beforeEach(() => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    setToken("saved-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setToken(null);
  });

  it("reports how much has been sent and returns the new document", async () => {
    const progress = vi.fn();
    const done = api.upload(new File(["%PDF"], "a.pdf"), progress);

    FakeXhr.last.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
    FakeXhr.last.respond(201, { id: 7, title: "A" });

    await expect(done).resolves.toMatchObject({ id: 7 });
    expect(progress).toHaveBeenCalledWith(0.5);
    expect(FakeXhr.last.headers.Authorization).toBe("Bearer saved-token");
  });

  it("passes on the server's reason for refusing", async () => {
    const done = api.upload(new File(["x"], "a.pdf"));
    FakeXhr.last.respond(413, { detail: "That file is too big. The limit is 40 MB." });

    await expect(done).rejects.toMatchObject({ status: 413, message: "That file is too big. The limit is 40 MB." });
  });

  it("signs out when the server rejects the sign-in", async () => {
    const done = api.upload(new File(["x"], "a.pdf"));
    FakeXhr.last.respond(401, { detail: "Could not validate credentials" });

    await expect(done).rejects.toMatchObject({ status: 401 });
    expect(getToken()).toBeNull();
  });

  it("says when the server can't be reached", async () => {
    const done = api.upload(new File(["x"], "a.pdf"));
    FakeXhr.last.onerror?.();

    await expect(done).rejects.toMatchObject({ status: 0 });
  });
});
