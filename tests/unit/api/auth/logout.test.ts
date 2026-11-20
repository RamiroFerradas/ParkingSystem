import { describe, it, expect, vi } from "vitest";
import { POST } from "@/app/api/auth/logout/route";

vi.mock("@/lib/auth/session", () => ({
  SESSION_COOKIE: "parking_session",
  SESSION_MAX_AGE_SECONDS: 43_200,
}));

describe("POST /api/auth/logout", () => {
  it("returns ok and expires the session cookie", async () => {
    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("parking_session=");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/");
  });

  it("works without a current session (idempotent)", async () => {
    const first = await POST();
    const second = await POST();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true });
  });
});
