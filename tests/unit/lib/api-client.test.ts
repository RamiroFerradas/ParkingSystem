import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, apiSend } from "@/lib/api/client";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function stubFetch() {
  vi.stubGlobal("fetch", fetchMock);
}

describe("apiRequest", () => {
  it("returns the parsed body on success", async () => {
    stubFetch();
    fetchMock.mockResolvedValue(jsonResponse({ methods: [{ id: "pm-1" }] }));

    const result = await apiRequest<{ methods: { id: string }[] }>("/api/payment-methods");

    expect(result).toEqual({ ok: true, data: { methods: [{ id: "pm-1" }] } });
  });

  it("never sends a body on GET", async () => {
    stubFetch();
    fetchMock.mockResolvedValue(jsonResponse({}));

    await apiRequest("/api/payment-methods", { method: "GET", body: { ignored: true } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("serializes the body on POST", async () => {
    stubFetch();
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await apiSend("/api/payment-methods", "POST", { code: "CASH" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ code: "CASH" }));
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("returns the server error message on a failed request", async () => {
    stubFetch();
    fetchMock.mockResolvedValue(jsonResponse({ error: "Ya existe" }, 409));

    const result = await apiSend("/api/payment-methods", "POST", {});

    expect(result).toEqual({ ok: false, error: "Ya existe" });
  });

  it("falls back to the status code when the error body has no message", async () => {
    stubFetch();
    fetchMock.mockResolvedValue(jsonResponse(null, 500));

    const result = await apiRequest("/api/whatever");

    expect(result).toEqual({ ok: false, error: "Error 500" });
  });

  it("reports a network failure without throwing", async () => {
    stubFetch();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await apiRequest("/api/whatever");

    expect(result).toEqual({ ok: false, error: "Sin conexión con el servidor" });
  });

  it("treats a non-JSON success body as empty data", async () => {
    stubFetch();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    } as unknown as Response);

    const result = await apiRequest("/api/whatever");

    expect(result).toEqual({ ok: true, data: null });
  });
});
