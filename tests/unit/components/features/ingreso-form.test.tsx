import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { IngresoForm } from "@/app/(app)/operaciones/ingreso/ingreso-form";

const { printSessionTicketMock } = vi.hoisted(() => ({
  printSessionTicketMock: vi.fn(),
}));

vi.mock("@/lib/print/client", () => ({
  printSessionTicket: printSessionTicketMock,
  PARKING_NAME: "MAURICIO'S PARKING",
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

const VEHICLE_TYPES = [
  { id: "vt-auto", name: "Auto" },
  { id: "vt-moto", name: "Moto" },
];

const BOXES = [
  { id: "box-1", number: "PB-01", floor_name: "Planta baja" },
  { id: "box-2", number: "PB-02", floor_name: "Planta baja" },
  { id: "box-3", number: "P1-01", floor_name: "Piso 1" },
];

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body } as unknown as Response;
}

/** Every fetch call the form made, as parsed bodies. */
function postedBodies() {
  return fetchMock.mock.calls
    .filter(([, init]) => init && (init as RequestInit).method === "POST")
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

function renderForm(overrides: Partial<Parameters<typeof IngresoForm>[0]> = {}) {
  return render(
    <IngresoForm
      vehicleTypes={VEHICLE_TYPES}
      availableBoxes={BOXES}
      shiftOpen
      {...overrides}
    />,
  );
}

function submitForm(container: HTMLElement) {
  const form = container.querySelector("form");
  if (!form) throw new Error("form not rendered");
  fireEvent.submit(form);
}

async function typePlate(value: string) {
  const input = screen.getByLabelText("Patente");
  fireEvent.change(input, { target: { value } });
  return input;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  printSessionTicketMock.mockReset();
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
    "11111111-1111-4111-8111-111111111111",
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IngresoForm", () => {
  it("renders vehicle types and boxes grouped by floor", () => {
    renderForm();

    expect(screen.getByRole("option", { name: "Auto" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Moto" })).toBeInTheDocument();
    expect(screen.getByText("Box (3 disponibles)")).toBeInTheDocument();
    expect(screen.getByText("Planta baja")).toBeInTheDocument();
    expect(screen.getByText("Piso 1")).toBeInTheDocument();
    expect(screen.getByText("Elegí un box para continuar")).toBeInTheDocument();
  });

  it("normalizes the plate to upper case letters and digits only", async () => {
    renderForm();
    const input = await typePlate("ab 123-cd.");
    expect(input).toHaveValue("AB123CD");
  });

  it("looks up a known plate on blur and locks the vehicle type", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        found: true,
        vehicleTypeId: "vt-auto",
        vehicleTypeName: "Auto",
        subscription: null,
      }),
    );
    renderForm();

    fireEvent.blur(await typePlate("ab123cd"));

    expect(await screen.findByText("Vehículo registrado")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/vehicles/lookup?plate=AB123CD");
    expect(screen.queryByLabelText("Tipo de vehículo")).not.toBeInTheDocument();
    expect(screen.getByText("registrado")).toBeInTheDocument();
  });

  it("shows the subscription end date for an abonado vehicle", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        found: true,
        vehicleTypeId: "vt-auto",
        vehicleTypeName: "Auto",
        subscription: { active: true, endsOn: "2026-12-31" },
      }),
    );
    renderForm();

    fireEvent.blur(await typePlate("ab123cd"));

    expect(await screen.findByText("Abonado hasta 31/12/2026")).toBeInTheDocument();
  });

  it("flags an unknown plate and asks for the vehicle type", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ found: false }));
    renderForm();

    fireEvent.blur(await typePlate("nuevo999"));

    expect(await screen.findByText("Vehículo nuevo — elegí el tipo")).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo de vehículo")).toBeInTheDocument();
  });

  it("filters the box picker by number and reports an empty match", () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Box (3 disponibles)"), {
      target: { value: "p1" },
    });
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "P1-01" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "PB-01" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Box (3 disponibles)"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("Ningún box coincide con «zzz».")).toBeInTheDocument();
  });

  it("requires a box before submitting", async () => {
    const { container } = renderForm();
    submitForm(container);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Elegí un box para el ingreso",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warns and disables the submit when there is no open shift", () => {
    renderForm({ shiftOpen: false });

    expect(screen.getByText("No hay turno de caja abierto")).toBeInTheDocument();
    expect(
      screen.getByText(/Para registrar un ingreso primero hay que abrir el turno\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir turno de caja" })).toHaveAttribute(
      "href",
      "/administracion/turnos",
    );
    expect(screen.getByRole("button", { name: "Confirmar ingreso" })).toBeDisabled();
  });

  it("POSTs the ingreso payload and shows the ticket confirmation", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          found: true,
          vehicleTypeId: "vt-auto",
          vehicleTypeName: "Auto",
          subscription: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ ticketNumber: 42, sessionId: "session-1" }),
      );
    renderForm();

    fireEvent.blur(await typePlate("ab123cd"));
    await screen.findByText("Vehículo registrado");

    fireEvent.click(screen.getByRole("button", { name: "PB-02" }));
    expect(screen.getByText("PB-02 elegido", { exact: false })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Observaciones (opcional)"), {
      target: { value: "portaequipaje" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Roturas o daños existentes (opcional)"), {
      target: { value: "rayón puerta" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Confirmar ingreso" }));

    expect(await screen.findByText("Ingreso registrado · Ticket")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Box PB-02 · AB123CD")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenLastCalledWith("/api/sessions/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "11111111-1111-4111-8111-111111111111",
        plate: "AB123CD",
        vehicleTypeId: "vt-auto",
        boxId: "box-2",
        notes: "portaequipaje",
        keyLeft: true,
        damageNotes: "rayón puerta",
      }),
    });
  });

  it("uses the selected type when the plate is new", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ found: false }))
      .mockResolvedValueOnce(jsonResponse({ ticketNumber: 7, sessionId: "s-7" }));
    renderForm();

    fireEvent.blur(await typePlate("nuevo999"));
    await screen.findByText("Vehículo nuevo — elegí el tipo");

    fireEvent.change(screen.getByLabelText("Tipo de vehículo"), {
      target: { value: "vt-moto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "P1-01" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar ingreso" }));

    await screen.findByText("Ingreso registrado · Ticket");
    const [body] = postedBodies();
    expect(body).toMatchObject({ vehicleTypeId: "vt-moto", boxId: "box-3" });
  });

  it("renders the server error message and keeps the form editable", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ found: false }))
      .mockResolvedValueOnce(
        jsonResponse({ error: "El box ya fue ocupado" }, false, 409),
      );
    renderForm();

    fireEvent.blur(await typePlate("abc123"));
    await screen.findByText("Vehículo nuevo — elegí el tipo");
    fireEvent.change(screen.getByLabelText("Tipo de vehículo"), {
      target: { value: "vt-auto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "PB-01" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar ingreso" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El box ya fue ocupado",
    );
    expect(screen.getByRole("button", { name: "Confirmar ingreso" })).toBeEnabled();
  });

  it("falls back to a generic message when the error body has none", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ found: false }))
      .mockResolvedValueOnce(jsonResponse({}, false, 500));
    const { container } = renderForm();

    fireEvent.blur(await typePlate("abc123"));
    await screen.findByText("Vehículo nuevo — elegí el tipo");
    fireEvent.change(screen.getByLabelText("Tipo de vehículo"), {
      target: { value: "vt-auto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "PB-01" }));
    submitForm(container);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo registrar el ingreso",
    );
  });

  it("reports a connection failure without losing the form", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ found: false }))
      .mockRejectedValueOnce(new Error("offline"));
    const { container } = renderForm();

    fireEvent.blur(await typePlate("abc123"));
    await screen.findByText("Vehículo nuevo — elegí el tipo");
    fireEvent.change(screen.getByLabelText("Tipo de vehículo"), {
      target: { value: "vt-auto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "PB-01" }));
    submitForm(container);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo conectar con el servidor. Intentá de nuevo.",
    );
  });

  it("turns on the shift warning when the API answers NO_OPEN_SHIFT", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ found: false }))
      .mockResolvedValueOnce(jsonResponse({ code: "NO_OPEN_SHIFT" }, false, 409));
    const { container } = renderForm();

    fireEvent.blur(await typePlate("abc123"));
    await screen.findByText("Vehículo nuevo — elegí el tipo");
    fireEvent.change(screen.getByLabelText("Tipo de vehículo"), {
      target: { value: "vt-auto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "PB-01" }));
    submitForm(container);

    expect(
      await screen.findByText("No hay turno de caja abierto"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar ingreso" })).toBeDisabled();
  });

  it("offers to move an already parked vehicle and then moves it", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          found: true,
          vehicleTypeId: "vt-auto",
          vehicleTypeName: "Auto",
          subscription: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            code: "VEHICLE_PARKED",
            session: { id: "session-9", ticketNumber: 9, boxNumber: "P1-01" },
          },
          false,
          409,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ ticketNumber: 9, boxNumber: "PB-01" }));
    renderForm();

    fireEvent.blur(await typePlate("ab123cd"));
    await screen.findByText("Vehículo registrado");
    fireEvent.click(screen.getByRole("button", { name: "PB-01" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar ingreso" }));

    const prompt = await screen.findByText(/ya está estacionada en el box/);
    expect(prompt.closest("[data-move-prompt]")).not.toBeNull();
    expect(screen.getByText(/ticket #9/)).toBeInTheDocument();
    expect(screen.getByText("¿Moverla al box PB-01?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mover al box PB-01" }));

    expect(await screen.findByText("Vehículo movido de box · Ticket")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Se conserva la misma estadía: no se recobró ni se emitió un ticket nuevo\./,
      ),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/sessions/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "session-9", boxId: "box-1" }),
    });
  });

  it("can cancel the move prompt and go back to the form", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ found: false }))
      .mockResolvedValueOnce(
        jsonResponse(
          { code: "VEHICLE_PARKED", session: { id: "s", ticketNumber: 3, boxNumber: "X-1" } },
          false,
          409,
        ),
      );
    const { container } = renderForm();

    fireEvent.blur(await typePlate("abc123"));
    await screen.findByText("Vehículo nuevo — elegí el tipo");
    fireEvent.change(screen.getByLabelText("Tipo de vehículo"), {
      target: { value: "vt-auto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "PB-01" }));
    submitForm(container);

    await screen.findByText(/ya está estacionada en el box/);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByText(/ya está estacionada en el box/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar ingreso" })).toBeEnabled();
  });

  it("does not offer a move when the vehicle is already in that box", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ found: false }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: "La patente ya está en este box",
            code: "VEHICLE_PARKED",
            sameBox: true,
            session: { id: "s", ticketNumber: 3, boxNumber: "PB-01" },
          },
          false,
          409,
        ),
      );
    const { container } = renderForm();

    fireEvent.blur(await typePlate("abc123"));
    await screen.findByText("Vehículo nuevo — elegí el tipo");
    fireEvent.change(screen.getByLabelText("Tipo de vehículo"), {
      target: { value: "vt-auto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "PB-01" }));
    submitForm(container);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La patente ya está en este box",
    );
    expect(screen.queryByText(/ya está estacionada en el box/)).not.toBeInTheDocument();
  });

  it("prints the entry ticket and confirms when it worked", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ found: false }))
      .mockResolvedValueOnce(jsonResponse({ ticketNumber: 11, sessionId: "s-11" }));
    printSessionTicketMock.mockResolvedValue({ jobId: "job-1" });
    const { container } = renderForm();

    fireEvent.blur(await typePlate("abc123"));
    await screen.findByText("Vehículo nuevo — elegí el tipo");
    fireEvent.change(screen.getByLabelText("Tipo de vehículo"), {
      target: { value: "vt-auto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "PB-01" }));
    submitForm(container);

    await screen.findByText("Ingreso registrado · Ticket");
    fireEvent.click(screen.getByRole("button", { name: "Imprimir ticket" }));

    expect(await screen.findByText("Ticket impreso")).toBeInTheDocument();
    expect(printSessionTicketMock).toHaveBeenCalledWith("s-11", "entry");
  });

  it("keeps the ticket in the queue when printing fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ found: false }))
      .mockResolvedValueOnce(jsonResponse({ ticketNumber: 12, sessionId: "s-12" }));
    printSessionTicketMock.mockRejectedValue(new Error("sin papel"));
    const { container } = renderForm();

    fireEvent.blur(await typePlate("abc123"));
    await screen.findByText("Vehículo nuevo — elegí el tipo");
    fireEvent.change(screen.getByLabelText("Tipo de vehículo"), {
      target: { value: "vt-auto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "PB-01" }));
    submitForm(container);

    await screen.findByText("Ingreso registrado · Ticket");
    fireEvent.click(screen.getByRole("button", { name: "Imprimir ticket" }));

    expect(
      await screen.findByText(
        /No se pudo imprimir \(sin papel\)\. El ticket quedó en la cola de impresión para reintentar\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Imprimir ticket" })).toBeEnabled();
  });

  it("resets the form for another ingreso", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ found: false }))
      .mockResolvedValueOnce(jsonResponse({ ticketNumber: 13, sessionId: "s-13" }));
    const { container } = renderForm();

    fireEvent.blur(await typePlate("abc123"));
    await screen.findByText("Vehículo nuevo — elegí el tipo");
    fireEvent.change(screen.getByLabelText("Tipo de vehículo"), {
      target: { value: "vt-auto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "PB-01" }));
    submitForm(container);

    await screen.findByText("Ingreso registrado · Ticket");
    fireEvent.click(screen.getByRole("button", { name: "Registrar otro ingreso" }));

    expect(screen.getByLabelText("Patente")).toHaveValue("");
    expect(screen.getByLabelText("Tipo de vehículo")).toHaveValue("");
    expect(screen.getByText("Elegí un box para continuar")).toBeInTheDocument();
  });

  // FIXED (ingreso-form.tsx:431-433): the filter-miss message used to render with no boxes at
  // all («Ningún box coincide con «»»), reading as a filter miss when the real problem was no
  // free capacity. It now only shows when boxes exist but the filter excludes every one.
  it("explains that there are no free boxes and disables the submit", () => {
    renderForm({ availableBoxes: [] });

    expect(
      screen.getByText(/No hay boxes disponibles\. Liberá uno desde/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "estadías activas" })).toHaveAttribute(
      "href",
      "/operaciones/estadias",
    );
    expect(screen.getByRole("button", { name: "Confirmar ingreso" })).toBeDisabled();
    expect(screen.queryByText(/Ningún box coincide/)).toBeNull();
  });

  // E5 (ingreso-form.tsx:5): the unused PARKING_NAME import has no runtime behaviour to
  // assert, so this guards the source directly (it was lint noise only).
  it("does not import the unused PARKING_NAME constant", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      "src/app/(app)/operaciones/ingreso/ingreso-form.tsx",
      "utf8",
    );

    expect(source).not.toContain("PARKING_NAME");
  });
});
