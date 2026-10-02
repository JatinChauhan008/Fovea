/**
 * Restoring a saved sign-in: an unreachable server must not sign the reader out.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getToken, setToken } from "../api";
import { AuthProvider } from "../auth";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const me = vi.fn();
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, api: { ...actual.api, me: () => me() } };
});

const reader = { id: 1, email: "a@example.com", preferred_wpm: 250, created_at: "" };

describe("AuthProvider", () => {
  beforeEach(() => setToken("saved-token"));
  afterEach(() => {
    me.mockReset();
    setToken(null);
  });

  it("shows a retry screen and keeps the sign-in when the server can't be reached", async () => {
    me.mockRejectedValueOnce(new ApiError("Cannot reach the Fovea API.", 0));

    render(
      <AuthProvider>
        <p>library</p>
      </AuthProvider>,
    );

    expect(await screen.findByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText("library")).not.toBeInTheDocument();
    expect(getToken()).toBe("saved-token");
  });

  it("carries on once the server answers again", async () => {
    me.mockRejectedValueOnce(new ApiError("Cannot reach the Fovea API.", 0));
    me.mockResolvedValueOnce(reader);

    render(
      <AuthProvider>
        <p>library</p>
      </AuthProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: /try again/i }));

    expect(await screen.findByText("library")).toBeInTheDocument();
  });
});
