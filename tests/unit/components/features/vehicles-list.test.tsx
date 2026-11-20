import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { VehiclesList } from "@/app/(app)/vehiculos/vehicles-list";
import { formatDate, formatTime } from "@/lib/format";

const fetchMock = vi.hoisted(() => vi.fn());

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

interface Handler {
  (url: string, init: RequestInit | undefined): Response | Promise<Response>;
}

function mockFetch(handler: Handler) {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init)),
  );
}

/** Avanza el debounce de 250 ms y deja correr las promesas del fetch. */
async function flushDebounce(ms = 250) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const VEHICLES = [
  {
    id: "v1",
    plate: "AA123BB",
    plate_is_placeholder: false,
    type_name: "Auto",
    notes: "cochera 4",
    sessions_count: 7,
    last_seen_at: "2030-05-04T15:30:00.000Z",
  },
  {
    id: "v2",
    plate: null,
    plate_is_placeholder: true,
    type_name: "Camioneta",
    notes: null,
    sessions_count: 1,
    last_seen_at: null,
  },
];

describe("VehiclesList", () => {
  it("queries the API 250 ms after mounting", async () => {
    mockFetch(() => jsonResponse({ vehicles: VEHICLES }));
    render(<VehiclesList />);

    await flushDebounce(240);
    expect(fetchMock).not.toHaveBeenCalled();

    await flushDebounce(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe("/api/vehicles?q=&limit=100");
  });

  it("debounces typing and only queries the final term", async () => {
    mockFetch((url) =>
      url.includes("q=ab%201")
        ? jsonResponse({ vehicles: VEHICLES })
        : jsonResponse({ vehicles: [] }),
    );
    render(<VehiclesList />);
    await flushDebounce();
    fetchMock.mockClear();

    const search = screen.getByPlaceholderText("Buscar patente…");
    fireEvent.change(search, { target: { value: "A" } });
    await flushDebounce(100);
    fireEvent.change(search, { target: { value: "ab 1" } });
    await flushDebounce(249);
    expect(fetchMock).not.toHaveBeenCalled();

    await flushDebounce(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe("/api/vehicles?q=ab%201&limit=100");
    expect(screen.getByText("AA123BB")).toBeInTheDocument();
  });

  it("renders plates, provisional markers, notes and last visit", async () => {
    mockFetch(() => jsonResponse({ vehicles: VEHICLES }));
    render(<VehiclesList />);
    await flushDebounce();

    expect(screen.getByRole("heading", { name: "Vehículos" })).toBeInTheDocument();
    expect(screen.getByText("AA123BB")).toBeInTheDocument();
    expect(screen.getByText("cochera 4")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();

    const expectedLastSeen = `${formatDate("2030-05-04T15:30:00.000Z")} ${formatTime(
      "2030-05-04T15:30:00.000Z",
    )}`;
    expect(screen.getByText(expectedLastSeen)).toBeInTheDocument();

    expect(screen.getByText("(sin patente)")).toBeInTheDocument();
    expect(screen.getByText("provisoria")).toBeInTheDocument();
    // Nota y último ingreso vacíos: dos guiones.
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("shows the empty state when nothing matches", async () => {
    mockFetch(() => jsonResponse({ vehicles: [] }));
    render(<VehiclesList />);
    await flushDebounce();

    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("renders the API error message", async () => {
    mockFetch(() => jsonResponse({ error: "Sin permiso" }, 403));
    render(<VehiclesList />);
    await flushDebounce();

    expect(screen.getByText("Sin permiso")).toBeInTheDocument();
  });

  it("falls back to the HTTP status when the error body is empty", async () => {
    mockFetch(() => jsonResponse({}, 500));
    render(<VehiclesList />);
    await flushDebounce();

    expect(screen.getByText("Error 500")).toBeInTheDocument();
  });

  it("reports an unreachable server and recovers on the next search", async () => {
    let failing = true;
    mockFetch(() =>
      failing
        ? Promise.reject(new TypeError("offline"))
        : Promise.resolve(jsonResponse({ vehicles: VEHICLES })),
    );
    render(<VehiclesList />);
    await flushDebounce();

    expect(screen.getByText("Sin conexión con el servidor")).toBeInTheDocument();

    failing = false;
    fireEvent.change(screen.getByPlaceholderText("Buscar patente…"), { target: { value: "AA" } });
    await flushDebounce();

    expect(screen.queryByText("Sin conexión con el servidor")).toBeNull();
    expect(screen.getByText("AA123BB")).toBeInTheDocument();
  });

  it("ignores an older response that lands after a newer one", async () => {
    const pending: Array<(response: Response) => void> = [];
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => pending.push(resolve)),
    );
    render(<VehiclesList />);

    await flushDebounce();
    expect(pending).toHaveLength(1);

    fireEvent.change(screen.getByPlaceholderText("Buscar patente…"), { target: { value: "AB" } });
    await flushDebounce();
    expect(pending).toHaveLength(2);

    const newer = { ...VEHICLES[0]!, id: "v9", plate: "NEW999" };
    const older = { ...VEHICLES[0]!, id: "v8", plate: "OLD999" };

    // La respuesta nueva llega primero.
    await act(async () => {
      pending[1]!(jsonResponse({ vehicles: [newer] }));
    });
    expect(screen.getByText("NEW999")).toBeInTheDocument();

    // La vieja llega tarde y no debe pisar el resultado.
    await act(async () => {
      pending[0]!(jsonResponse({ vehicles: [older] }));
    });
    expect(screen.getByText("NEW999")).toBeInTheDocument();
    expect(screen.queryByText("OLD999")).toBeNull();
  });

  it("cancels the pending request timer on unmount", async () => {
    mockFetch(() => jsonResponse({ vehicles: VEHICLES }));
    const { unmount } = render(<VehiclesList />);
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
