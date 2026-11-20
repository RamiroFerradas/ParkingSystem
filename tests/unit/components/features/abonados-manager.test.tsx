import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { AbonadosManager } from "@/app/(app)/tarifas/abonados/abonados-manager";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const fetchMock = vi.hoisted(() => vi.fn());

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const SUBSCRIPTIONS = [
  {
    id: "s1",
    plate: "AA123BB",
    vehicle_type: "Auto",
    plan_name: "Abono mensual",
    starts_on: "2030-02-01",
    ends_on: "2030-03-01",
    amount_cents: "1500000",
    status: "active",
    vigente: true,
    created_by_name: "Marta",
    created_at: "2030-02-01T10:00:00.000Z",
    notes: "cochera 4",
  },
  {
    id: "s2",
    plate: "CC456DD",
    vehicle_type: "Camioneta",
    plan_name: "Abono mensual",
    starts_on: "2030-01-01",
    ends_on: "2030-02-01",
    amount_cents: "2000000",
    status: "cancelled",
    vigente: false,
    created_by_name: "Marta",
    created_at: "2030-01-01T10:00:00.000Z",
    notes: null,
  },
  {
    id: "s3",
    plate: "EE789FF",
    vehicle_type: "Auto",
    plan_name: "Abono mensual",
    starts_on: "2020-01-01",
    ends_on: "2020-02-01",
    amount_cents: "900000",
    status: "active",
    vigente: false,
    created_by_name: "Marta",
    created_at: "2020-01-01T10:00:00.000Z",
    notes: null,
  },
];

const TARIFFS = [
  {
    id: "t1",
    kind: "monthly",
    name: "Abono mensual",
    vehicle_type_name: "Auto",
    amount_cents: "1500000",
  },
  {
    id: "t2",
    kind: "hourly",
    name: "Hora",
    vehicle_type_name: "Auto",
    amount_cents: "300000",
  },
];

const METHODS = [
  { id: "m1", name: "Efectivo" },
  { id: "m2", name: "Tarjeta" },
];

interface Handler {
  (url: string, init: RequestInit | undefined): Response | Promise<Response>;
}

function mockFetch(handler: Handler) {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init)),
  );
}

/** Default: the mounted load succeeds with the fixtures above. */
function mockLoad(overrides: Partial<{ subscriptions: unknown; tariffs: unknown }> = {}) {
  const subscriptions = overrides.subscriptions ?? { subscriptions: SUBSCRIPTIONS };
  const tariffs = overrides.tariffs ?? { tariffs: TARIFFS };
  mockFetch((url) => {
    if (url === "/api/subscriptions") return jsonResponse(subscriptions);
    return jsonResponse(tariffs);
  });
}

async function renderLoaded() {
  render(<AbonadosManager methods={METHODS} />);
  await screen.findByRole("button", { name: "Registrar abono" });
  await waitFor(() => expect(screen.queryByText("Cargando abonos…")).toBeNull());
}

describe("AbonadosManager", () => {
  it("loads subscriptions and tariffs with no-store cache", async () => {
    mockLoad();
    render(<AbonadosManager methods={METHODS} />);

    expect(screen.getByText("Cargando abonos…")).toBeInTheDocument();
    await screen.findByText("AA123BB");

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.sort()).toEqual(["/api/subscriptions", "/api/tariffs"]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ cache: "no-store" });
    }
  });

  it("renders each subscription with its period, amount and state badge", async () => {
    mockLoad();
    await renderLoaded();

    const activeRow = screen.getByText("AA123BB").closest("tr") as HTMLTableRowElement;
    expect(within(activeRow).getByText("Auto")).toBeInTheDocument();
    expect(within(activeRow).getByText("cochera 4")).toBeInTheDocument();
    expect(within(activeRow).getByText("01/02/2030 → 01/03/2030")).toBeInTheDocument();
    // Intl separa el símbolo con un espacio duro: se compara sólo el número.
    expect(within(activeRow).getByText(/15\.000,00/)).toBeInTheDocument();
    expect(within(activeRow).getByText("Vigente")).toBeInTheDocument();
    expect(within(activeRow).getByRole("button", { name: "Cancelar" })).toBeEnabled();

    const cancelledRow = screen.getByText("CC456DD").closest("tr") as HTMLTableRowElement;
    expect(within(cancelledRow).getByText("Cancelado")).toBeInTheDocument();
    expect(within(cancelledRow).getByRole("button", { name: "Cancelar" })).toBeDisabled();

    const expiredRow = screen.getByText("EE789FF").closest("tr") as HTMLTableRowElement;
    expect(within(expiredRow).getByText("Vencido")).toBeInTheDocument();
  });

  it("shows the empty state when there are no subscriptions", async () => {
    mockLoad({ subscriptions: { subscriptions: [] } });
    render(<AbonadosManager methods={METHODS} />);

    expect(await screen.findByText("Todavía no hay abonos registrados.")).toBeInTheDocument();
  });

  it("offers only monthly plans and formats them with currency", async () => {
    mockLoad();
    await renderLoaded();

    const planSelect = screen.getByLabelText("Plan mensual");
    const options = within(planSelect).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveValue("t1");
    expect(options[0]).toHaveTextContent(/Auto · Abono mensual ·/);
    expect(options[0]).toHaveTextContent(/15\.000,00/);
    expect(within(planSelect).queryByText("Hora")).toBeNull();
  });

  it("links to the tariff page when there are no monthly plans and blocks creation", async () => {
    mockLoad({ tariffs: { tariffs: [] } });
    render(<AbonadosManager methods={METHODS} />);

    expect(await screen.findByText(/No hay planes mensuales cargados/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear un plan" })).toHaveAttribute(
      "href",
      "/tarifas/productos",
    );
    expect(screen.getByRole("button", { name: "Registrar abono" })).toBeDisabled();
    expect(screen.getByLabelText("Plan mensual")).toBeDisabled();
  });

  it("validates the plate before calling the API", async () => {
    mockLoad();
    await renderLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Registrar abono" }));

    expect(await screen.findByText("Ingresá una patente")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit).method === "POST")).toHaveLength(0);
  });

  it("validates that the end date is after the start date", async () => {
    mockLoad();
    await renderLoaded();

    fireEvent.change(screen.getByLabelText("Patente"), { target: { value: "AA123BB" } });
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2030-03-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2030-02-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar abono" }));

    expect(await screen.findByText("El fin debe ser posterior al inicio")).toBeInTheDocument();
  });

  it("registers a subscription with a normalized plate and reloads the list", async () => {
    mockFetch((url, init) => {
      if (url === "/api/subscriptions" && init?.method === "POST") return jsonResponse({ id: "s9" });
      if (url === "/api/subscriptions") return jsonResponse({ subscriptions: SUBSCRIPTIONS });
      return jsonResponse({ tariffs: TARIFFS });
    });
    await renderLoaded();

    fireEvent.change(screen.getByLabelText("Patente"), { target: { value: "ab 123 cd" } });
    fireEvent.change(screen.getByLabelText("Medio de pago"), { target: { value: "m2" } });
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2030-04-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2030-05-01" } });
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "  cochera 7  " } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar abono" }));

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit).method === "POST");
      expect(posts).toHaveLength(1);
    });
    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit).method === "POST",
    ) as [string, RequestInit];
    expect(post[0]).toBe("/api/subscriptions");
    expect(JSON.parse(String(post[1].body))).toEqual({
      plate: "AB123CD",
      tariffId: "t1",
      startsOn: "2030-04-01",
      endsOn: "2030-05-01",
      methodId: "m2",
      notes: "cochera 7",
    });

    await waitFor(() =>
      expect((screen.getByLabelText("Patente") as HTMLInputElement).value).toBe(""),
    );
    expect((screen.getByLabelText("Notas") as HTMLInputElement).value).toBe("");
  });

  it("points to the shifts page when there is no open cash shift", async () => {
    mockFetch((url, init) => {
      if (url === "/api/subscriptions" && init?.method === "POST") {
        return jsonResponse(
          { code: "NO_OPEN_SHIFT", error: "Abrí un turno de caja antes de cobrar un abono." },
          409,
        );
      }
      if (url === "/api/subscriptions") return jsonResponse({ subscriptions: [] });
      return jsonResponse({ tariffs: TARIFFS });
    });
    await renderLoaded();

    fireEvent.change(screen.getByLabelText("Patente"), { target: { value: "AA123BB" } });
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2030-04-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2030-05-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar abono" }));

    expect(
      await screen.findByText("Abrí un turno de caja antes de cobrar un abono."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a turnos" })).toHaveAttribute(
      "href",
      "/administracion/turnos",
    );
  });

  it("cancels a subscription after confirming in the dialog and reloads", async () => {
    mockFetch((url, init) => {
      if (url === "/api/subscriptions" && init?.method === "PATCH") return jsonResponse({ done: true });
      if (url === "/api/subscriptions") return jsonResponse({ subscriptions: SUBSCRIPTIONS });
      return jsonResponse({ tariffs: TARIFFS });
    });
    await renderLoaded();

    fireEvent.click(
      within(screen.getByText("AA123BB").closest("tr") as HTMLElement).getByRole("button", {
        name: "Cancelar",
      }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/AA123BB/)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([, init]) => (init as RequestInit).method === "PATCH"),
    ).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar abono" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([, init]) => (init as RequestInit).method === "PATCH"),
      ).toHaveLength(1),
    );
    const patch = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit).method === "PATCH",
    ) as [string, RequestInit];
    expect(patch[0]).toBe("/api/subscriptions");
    expect(JSON.parse(String(patch[1].body))).toEqual({ id: "s1" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("dismisses the confirmation dialog without calling the API", async () => {
    mockLoad();
    await renderLoaded();

    fireEvent.click(
      within(screen.getByText("AA123BB").closest("tr") as HTMLElement).getByRole("button", {
        name: "Cancelar",
      }),
    );

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      fetchMock.mock.calls.filter(([, init]) => (init as RequestInit).method === "PATCH"),
    ).toHaveLength(0);
  });

  it("falls back to the first monthly plan when the selected one disappears after a reload", async () => {
    const nextTariffs = [
      {
        id: "t3",
        kind: "monthly",
        name: "Abono nuevo",
        vehicle_type_name: "Auto",
        amount_cents: "1800000",
      },
    ];
    let tariffsBody: { tariffs: unknown } = { tariffs: TARIFFS };
    mockFetch((url, init) => {
      if (url === "/api/subscriptions" && init?.method === "POST") {
        tariffsBody = { tariffs: nextTariffs };
        return jsonResponse({ id: "s9" });
      }
      if (url === "/api/subscriptions") return jsonResponse({ subscriptions: SUBSCRIPTIONS });
      return jsonResponse(tariffsBody);
    });
    await renderLoaded();

    expect(screen.getByLabelText("Plan mensual")).toHaveValue("t1");

    fireEvent.change(screen.getByLabelText("Patente"), { target: { value: "AA999ZZ" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar abono" }));

    await waitFor(() => expect(screen.getByLabelText("Plan mensual")).toHaveValue("t3"));

    fireEvent.change(screen.getByLabelText("Patente"), { target: { value: "BB999ZZ" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar abono" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([, init]) => (init as RequestInit).method === "POST"),
      ).toHaveLength(2),
    );
    const lastPost = fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit).method === "POST")
      .at(-1) as [string, RequestInit];
    expect(JSON.parse(String(lastPost[1].body))).toMatchObject({ tariffId: "t3" });
  });

  it("renders the list error returned by the API", async () => {
    mockFetch((url) => {
      if (url === "/api/subscriptions") return jsonResponse({ error: "Sin permiso" }, 403);
      return jsonResponse({ tariffs: TARIFFS });
    });
    render(<AbonadosManager methods={METHODS} />);

    expect(await screen.findByText("Sin permiso")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Cargando abonos…")).toBeNull());
  });

  it("reports a connection failure while loading", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    render(<AbonadosManager methods={METHODS} />);

    expect(await screen.findByText("Sin conexión con el servidor")).toBeInTheDocument();
  });
});
