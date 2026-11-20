import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BoxEditPanel } from "@/app/(app)/boxes/mapa/BoxEditPanel";
import type { BoardBox } from "@/app/(app)/boxes/mapa/BoxTile";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

function makeBox(overrides: Partial<BoardBox> = {}): BoardBox {
  return {
    id: "box-1",
    number: "PB-01",
    sector: "Frente",
    floorId: "floor-1",
    status: "available",
    plate: null,
    entryAt: null,
    vehicleTypeName: null,
    ticketNumber: null,
    elapsedLabel: null,
    serviceEnabled: true,
    isActive: true,
    ...overrides,
  };
}

const FLOORS = [
  { id: "floor-1", name: "Planta baja" },
  { id: "floor-2", name: "Piso 1" },
];

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body } as unknown as Response;
}

function renderPanel(box: BoardBox = makeBox()) {
  const onClose = vi.fn();
  const utils = render(
    <BoxEditPanel box={box} floorOptions={FLOORS} onClose={onClose} />,
  );
  return { ...utils, onClose };
}

function numberInput() {
  return document.querySelector("[data-box-edit-number]") as HTMLInputElement;
}
function sectorInput() {
  return document.querySelector("[data-box-edit-sector]") as HTMLInputElement;
}
function floorSelect() {
  return document.querySelector("[data-box-edit-floor]") as HTMLSelectElement;
}
function serviceToggle() {
  return document.querySelector("[data-box-edit-service]") as HTMLInputElement;
}
function activeToggle() {
  return document.querySelector("[data-box-edit-active]") as HTMLInputElement;
}
function saveButton() {
  return document.querySelector("[data-box-edit-save]") as HTMLButtonElement;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  refreshMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BoxEditPanel", () => {
  it("prefills the form for a free box", () => {
    renderPanel();

    expect(screen.getByText("Editar box")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PB-01" })).toBeInTheDocument();
    expect(screen.getByText("Libre para editar")).toBeInTheDocument();
    expect(numberInput()).toHaveValue("PB-01");
    expect(sectorInput()).toHaveValue("Frente");
    expect(floorSelect()).toHaveValue("floor-1");
    expect(serviceToggle()).toBeChecked();
    expect(activeToggle()).toBeChecked();
    expect(saveButton()).toBeEnabled();
    expect(screen.queryByText(/tiene una estadía abierta/)).toBeNull();
  });

  it("locks every field while the box is occupied", () => {
    renderPanel(
      makeBox({
        status: "occupied",
        plate: "AB123CD",
        ticketNumber: "88",
        isActive: true,
      }),
    );

    expect(
      screen.getByText("Ocupado por AB123CD · Ticket #88"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /El box tiene una estadía abierta: finalizala para poder modificar número, sector,/,
      ),
    ).toBeInTheDocument();
    expect(numberInput()).toBeDisabled();
    expect(sectorInput()).toBeDisabled();
    expect(floorSelect()).toBeDisabled();
    expect(serviceToggle()).toBeDisabled();
    expect(activeToggle()).toBeDisabled();
    expect(saveButton()).toBeDisabled();
  });

  it("labels an inactive box as dado de baja", () => {
    renderPanel(makeBox({ isActive: false, status: "out_of_service" }));

    expect(screen.getByText("Dado de baja")).toBeInTheDocument();
  });

  it("closes without calling the API when nothing changed", async () => {
    const { onClose } = renderPanel();

    fireEvent.click(saveButton());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("PATCHes the changed fields and normalizes the number", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const { onClose } = renderPanel();

    fireEvent.change(numberInput(), { target: { value: "  pb-09 " } });
    fireEvent.change(sectorInput(), { target: { value: "  Contrafrente " } });
    fireEvent.change(floorSelect(), { target: { value: "floor-2" } });
    fireEvent.click(activeToggle());
    fireEvent.click(saveButton());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/boxes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "box-1",
        number: "PB-09",
        sector: "Contrafrente",
        floorId: "floor-2",
        isActive: false,
      }),
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("sends an empty sector to clear it", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    renderPanel();

    fireEvent.change(sectorInput(), { target: { value: "  " } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ id: "box-1", sector: "" }),
    });
  });

  it("only posts the service toggle when that is the only change", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const { onClose } = renderPanel();

    fireEvent.click(serviceToggle());
    fireEvent.click(saveButton());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/boxes/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boxId: "box-1", serviceEnabled: false }),
    });
  });

  it("toggles the service before patching the rest", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    renderPanel();

    fireEvent.click(serviceToggle());
    fireEvent.change(numberInput(), { target: { value: "PB-02" } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/boxes/toggle");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/boxes");
  });

  it("renders the API error for the service toggle and stays open", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "El box tiene una estadía abierta" }, false, 409),
    );
    const { onClose } = renderPanel();

    fireEvent.click(serviceToggle());
    fireEvent.click(saveButton());

    expect(
      await screen.findByText("El box tiene una estadía abierta"),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(saveButton()).toBeEnabled();
  });

  it("falls back to a generic message when the save error has none", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 500));
    renderPanel();

    fireEvent.change(numberInput(), { target: { value: "PB-03" } });
    fireEvent.click(saveButton());

    expect(await screen.findByText("No se pudo guardar el box")).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it("renders a network failure as an error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("sin conexión"));
    const { onClose } = renderPanel();

    fireEvent.change(numberInput(), { target: { value: "PB-04" } });
    fireEvent.click(saveButton());

    expect(await screen.findByText("sin conexión")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("marks the save button busy while the request is in flight", async () => {
    let release: (value: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    );
    renderPanel();

    fireEvent.change(numberInput(), { target: { value: "PB-05" } });
    fireEvent.click(saveButton());

    expect(await screen.findByRole("button", { name: "Guardando…" })).toBeDisabled();

    release(jsonResponse({ ok: true }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("closes from the header, the footer and the backdrop", () => {
    const { onClose } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar panel de edición" }));

    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
