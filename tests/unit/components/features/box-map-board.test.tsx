import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BoxMapBoard } from "@/app/(app)/boxes/mapa/BoxMapBoard";
import type { BoardBox } from "@/app/(app)/boxes/mapa/BoxTile";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
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
  {
    id: "floor-1",
    name: "Planta baja",
    boxes: [
      makeBox({ id: "box-1", number: "PB-01" }),
      makeBox({
        id: "box-2",
        number: "PB-02",
        status: "occupied",
        plate: "AB123CD",
        entryAt: "2026-03-04T12:05:00.000Z",
        vehicleTypeName: "Auto",
        ticketNumber: "88",
        elapsedLabel: "1 h 20 min",
      }),
    ],
  },
  {
    id: "floor-2",
    name: "Piso 1",
    boxes: [makeBox({ id: "box-3", number: "P1-01", floorId: "floor-2" })],
  },
];

const FLOOR_OPTIONS = [
  { id: "floor-1", name: "Planta baja" },
  { id: "floor-2", name: "Piso 1" },
];

function panel() {
  return document.querySelector("[data-box-edit-panel]");
}

function tile(number: string) {
  const found = Array.from(
    document.querySelectorAll<HTMLElement>("[data-box-tile]"),
  ).find((el) => el.textContent?.includes(number));
  if (!found) throw new Error(`tile ${number} not found`);
  return found;
}

describe("BoxMapBoard", () => {
  it("renders every floor with its box count", () => {
    render(
      <BoxMapBoard floors={FLOORS} floorOptions={FLOOR_OPTIONS} canManage={false} />,
    );

    expect(screen.getByRole("heading", { name: /Planta baja/ })).toBeInTheDocument();
    expect(screen.getByText("2 boxes")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Piso 1/ })).toBeInTheDocument();
    expect(screen.getByText("1 boxes")).toBeInTheDocument();
    expect(screen.getByText("PB-01")).toBeInTheDocument();
    expect(screen.getByText("P1-01")).toBeInTheDocument();
    expect(screen.getByText("AB123CD")).toBeInTheDocument();
  });

  it("shows the editing hint when the user can manage boxes", () => {
    render(<BoxMapBoard floors={FLOORS} floorOptions={FLOOR_OPTIONS} canManage />);

    expect(
      screen.getByText("Tocá un box para editar número, sector, piso o estado."),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-box-editable]")).toHaveAttribute(
      "data-box-editable",
      "true",
    );
  });

  it("reports how many boxes are dado de baja (plural)", () => {
    render(
      <BoxMapBoard
        floors={[
          {
            id: "floor-1",
            name: "Planta baja",
            boxes: [
              makeBox({ id: "a", isActive: false, status: "out_of_service" }),
              makeBox({ id: "b", isActive: false, status: "out_of_service" }),
              makeBox({ id: "c" }),
            ],
          },
        ]}
        floorOptions={FLOOR_OPTIONS}
        canManage
      />,
    );

    expect(screen.getByText(/Hay 2 boxes dados de baja\./)).toBeInTheDocument();
  });

  it("uses the singular for a single inactive box", () => {
    render(
      <BoxMapBoard
        floors={[
          {
            id: "floor-1",
            name: "Planta baja",
            boxes: [makeBox({ id: "a", isActive: false, status: "out_of_service" })],
          },
        ]}
        floorOptions={FLOOR_OPTIONS}
        canManage
      />,
    );

    expect(screen.getByText(/Hay 1 box dado de baja\./)).toBeInTheDocument();
  });

  it("hides inactive boxes and the hint in read-only mode", () => {
    render(
      <BoxMapBoard
        floors={[
          {
            id: "floor-1",
            name: "Planta baja",
            boxes: [makeBox({ id: "a" }), makeBox({ id: "b", isActive: false, status: "out_of_service" })],
          },
        ]}
        floorOptions={FLOOR_OPTIONS}
        canManage={false}
      />,
    );

    expect(screen.getByText("1 boxes")).toBeInTheDocument();
    expect(screen.queryByText("Dado de baja")).toBeNull();
    expect(screen.queryByText(/Tocá un box/)).toBeNull();

    // Read-only: the one active box renders as a plain tile, never as a button,
    // and the inactive box is filtered out entirely.
    const tiles = [...document.querySelectorAll("[data-box-tile]")];
    expect(tiles).toHaveLength(1);
    expect(tiles[0]!.getAttribute("role")).toBeNull();
  });

  it("omits floors whose boxes are all hidden", () => {
    render(
      <BoxMapBoard
        floors={[
          {
            id: "floor-1",
            name: "Planta baja",
            boxes: [makeBox({ id: "a", isActive: false, status: "out_of_service" })],
          },
          { id: "floor-2", name: "Piso 1", boxes: [makeBox({ id: "b", floorId: "floor-2" })] },
        ]}
        floorOptions={FLOOR_OPTIONS}
        canManage={false}
      />,
    );

    expect(screen.queryByRole("heading", { name: /Planta baja/ })).toBeNull();
    expect(screen.getByRole("heading", { name: /Piso 1/ })).toBeInTheDocument();
  });

  it("opens the edit panel when a box is clicked and closes it again", () => {
    render(<BoxMapBoard floors={FLOORS} floorOptions={FLOOR_OPTIONS} canManage />);

    expect(panel()).toBeNull();

    fireEvent.click(tile("PB-01"));

    expect(panel()).not.toBeNull();
    expect(screen.getByRole("heading", { name: "PB-01" })).toBeInTheDocument();
    expect(tile("PB-01").className).toContain("ring-2 ring-amber-400");

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(panel()).toBeNull();
    expect(tile("PB-01").className).not.toContain("ring-2");
  });

  it("opens the panel from the initialBoxId selection", () => {
    render(
      <BoxMapBoard
        floors={FLOORS}
        floorOptions={FLOOR_OPTIONS}
        canManage
        initialBoxId="box-3"
      />,
    );

    expect(panel()).not.toBeNull();
    expect(screen.getByRole("heading", { name: "P1-01" })).toBeInTheDocument();
  });

  it("does not open the panel from a click in read-only mode", () => {
    render(
      <BoxMapBoard floors={FLOORS} floorOptions={FLOOR_OPTIONS} canManage={false} />,
    );

    fireEvent.click(tile("PB-01"));

    expect(panel()).toBeNull();
  });
});
