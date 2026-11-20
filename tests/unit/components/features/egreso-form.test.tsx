import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EgresoForm, type EgresoData } from "@/app/(app)/operaciones/egreso/egreso-form";
import { formatARS } from "@/lib/format";

const { printSessionTicketMock } = vi.hoisted(() => ({
  printSessionTicketMock: vi.fn(),
}));

vi.mock("@/lib/print/client", () => ({
  printSessionTicket: printSessionTicketMock,
}));

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    __esModule: true,
    default: ({
      href,
      children,
      ...rest
    }: {
      href: string | { pathname?: string };
      children?: React.ReactNode;
    } & Record<string, unknown>) =>
      React.createElement(
        "a",
        { href: typeof href === "string" ? href : "#", ...rest },
        children,
      ),
  };
});

/** RTL normalizes the DOM whitespace, so the expected ARS string must match that form. */
function money(cents: number) {
  return formatARS(cents).replace(/\s/g, " ");
}

function makeData(overrides: Partial<EgresoData> = {}): EgresoData {
  return {
    sessionId: "session-1",
    ticketNumber: "42",
    plate: "AB123CD",
    vehicleTypeName: "Auto",
    boxNumber: "PB-01",
    entryAt: "2026-11-20T12:30:00.000Z",
    elapsedMinutes: 95,
    quote: {
      block: { name: "Fracción 1 h", amount_cents: 150000 },
      extra_hours: 2,
      hourly_amount_cents: 25000,
      total_cents: 200000,
    },
    methods: [
      { id: "cash", name: "Efectivo" },
      { id: "card", name: "Tarjeta" },
    ],
    keyLeft: false,
    damageNotes: null,
    ...overrides,
  };
}

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  printSessionTicketMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EgresoForm", () => {
  it("renders the fee breakdown with block, extra hours and total", () => {
    render(<EgresoForm data={makeData()} />);

    expect(screen.getByText("Desglose (BR-010)")).toBeInTheDocument();
    expect(screen.getByText("Fracción 1 h")).toBeInTheDocument();
    expect(screen.getByText(money(150000))).toBeInTheDocument();
    expect(
      screen.getByText(`2 × hora extra (${money(25000)} c/u)`),
    ).toBeInTheDocument();
    expect(screen.getByText(money(50000))).toBeInTheDocument();
    expect(screen.getByText("Tiempo: 1 h 35 min")).toBeInTheDocument();
    expect(screen.getByText(money(200000))).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Confirmar cobro · ${formatARS(200000)}`,
      }),
    ).toBeInTheDocument();
  });

  it("falls back to the generic tariff name and hides zero extra hours", () => {
    render(
      <EgresoForm
        data={makeData({
          quote: {
            block: null,
            extra_hours: 0,
            hourly_amount_cents: 0,
            total_cents: 90000,
          },
        })}
      />,
    );

    expect(screen.getByText("Tarifa")).toBeInTheDocument();
    expect(screen.queryByText(/hora extra/)).toBeNull();
    expect(screen.getByText(money(90000))).toBeInTheDocument();
  });

  it("shows the abonado variant without charging by hour", () => {
    render(
      <EgresoForm
        data={makeData({
          quote: {
            block: null,
            extra_hours: 0,
            hourly_amount_cents: 0,
            total_cents: 0,
            abono: true,
          },
        })}
      />,
    );

    expect(screen.getByText("Estadía abonada: no se cobra por hora.")).toBeInTheDocument();
    expect(screen.getByText("Abonado")).toBeInTheDocument();
    expect(screen.getByText("Tiempo: 1 h 35 min")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar egreso" })).toBeEnabled();
  });

  it("preselects the first payment method for an abono", () => {
    render(
      <EgresoForm
        data={makeData({
          quote: {
            block: null,
            extra_hours: 0,
            hourly_amount_cents: 0,
            total_cents: 0,
            abono: true,
          },
        })}
      />,
    );

    expect(screen.getByRole("radio", { name: "Efectivo" })).toBeChecked();
  });

  it("disables the submit until a payment method is chosen", () => {
    render(<EgresoForm data={makeData()} />);

    expect(screen.getByRole("button", { name: /Confirmar cobro/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Efectivo" })).not.toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "Efectivo" }));

    expect(screen.getByRole("radio", { name: "Efectivo" })).toBeChecked();
    expect(screen.getByRole("button", { name: /Confirmar cobro/ })).toBeEnabled();
  });

  it("POSTs the close payload and shows the collected amount", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ finalCents: 210000, durationMinutes: 95 }),
    );
    render(<EgresoForm data={makeData()} />);

    fireEvent.click(screen.getByRole("radio", { name: "Tarjeta" }));
    fireEvent.change(screen.getByLabelText("Observaciones (opcional)"), {
      target: { value: "paga con tarjeta" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Confirmar cobro/ }));

    expect(await screen.findByText("Cobro registrado")).toBeInTheDocument();
    expect(screen.getByText(money(210000))).toBeInTheDocument();
    expect(
      screen.getByText("Ticket #42 · 1 h 35 min · Box liberado"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "session-1",
        methodId: "card",
        notes: "paga con tarjeta",
      }),
    });
  });

  it("defaults missing amounts in the close response to zero", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    render(<EgresoForm data={makeData()} />);

    fireEvent.click(screen.getByRole("radio", { name: "Efectivo" }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar cobro/ }));

    expect(await screen.findByText("Cobro registrado")).toBeInTheDocument();
    expect(screen.getByText(money(0))).toBeInTheDocument();
    expect(screen.getByText("Ticket #42 · 0 min · Box liberado")).toBeInTheDocument();
  });

  it("renders the server error and keeps the form available", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "La caja está cerrada" }, false, 409),
    );
    render(<EgresoForm data={makeData()} />);

    fireEvent.click(screen.getByRole("radio", { name: "Efectivo" }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar cobro/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La caja está cerrada");
    expect(screen.getByRole("button", { name: /Confirmar cobro/ })).toBeEnabled();
  });

  it("falls back to a generic message when the server sends no error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 500));
    render(<EgresoForm data={makeData()} />);

    fireEvent.click(screen.getByRole("radio", { name: "Efectivo" }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar cobro/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo registrar el cobro",
    );
  });

  it("warns that the charge was not registered when the network fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    render(<EgresoForm data={makeData()} />);

    fireEvent.click(screen.getByRole("radio", { name: "Efectivo" }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar cobro/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Servidor no disponible. El cobro NO se registró.",
    );
  });

  it("prints the receipt after a successful charge", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ finalCents: 200000, durationMinutes: 95 }));
    printSessionTicketMock.mockResolvedValue({ jobId: "job-1" });
    render(<EgresoForm data={makeData()} />);

    fireEvent.click(screen.getByRole("radio", { name: "Efectivo" }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar cobro/ }));
    await screen.findByText("Cobro registrado");

    fireEvent.click(screen.getByRole("button", { name: "Imprimir comprobante" }));

    expect(await screen.findByText("Comprobante impreso")).toBeInTheDocument();
    expect(printSessionTicketMock).toHaveBeenCalledWith("session-1", "exit");
  });

  it("points to the print queue when the receipt cannot be printed", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ finalCents: 200000, durationMinutes: 95 }));
    printSessionTicketMock.mockRejectedValue(new Error("sin papel"));
    render(<EgresoForm data={makeData()} />);

    fireEvent.click(screen.getByRole("radio", { name: "Efectivo" }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar cobro/ }));
    await screen.findByText("Cobro registrado");

    fireEvent.click(screen.getByRole("button", { name: "Imprimir comprobante" }));

    expect(
      await screen.findByText(/No se pudo imprimir \(sin papel\)/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "registrar ingreso" })).toHaveAttribute(
      "href",
      "/operaciones/ingreso",
    );
  });
});
