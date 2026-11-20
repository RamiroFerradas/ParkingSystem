import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/db/client", () => ({ query: vi.fn() }));

import { query } from "@/lib/db/client";
import { MiniBoxMap } from "@/components/boxes/mini-box-map";

interface BoxRow {
  number: string;
  floor_name: string;
  status: string;
  plate: string | null;
}

const queryMock = vi.mocked(query);

const ROWS: BoxRow[] = [
  {
    number: "1",
    floor_name: "Planta Baja",
    status: "occupied",
    plate: "AB123CD",
  },
  { number: "2", floor_name: "Planta Baja", status: "available", plate: null },
  {
    number: "3",
    floor_name: "Subsuelo",
    status: "out_of_service",
    plate: null,
  },
  { number: "4", floor_name: "Subsuelo", status: "occupied", plate: null },
];

beforeEach(() => {
  queryMock.mockReset();
});

describe("MiniBoxMap", () => {
  it("queries the boxes of the given branch", async () => {
    queryMock.mockResolvedValue([]);

    await MiniBoxMap({ branchId: "b1" });

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("FROM box_status"),
      ["b1"],
    );
  });

  it("shows the empty state when the branch has no boxes", async () => {
    queryMock.mockResolvedValue([]);

    render(await MiniBoxMap({ branchId: "b1" }));

    expect(screen.getByText("Mapa de boxes")).toBeInTheDocument();
    expect(
      screen.getByText("Sin boxes cargados todavía."),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-box-grid-mini]")).toBeNull();
  });

  it("summarises the counts per status", async () => {
    queryMock.mockResolvedValue(ROWS);

    render(await MiniBoxMap({ branchId: "b1" }));

    expect(screen.getByText(/2 ocupados/)).toBeInTheDocument();
    expect(screen.getByText(/1 libres/)).toBeInTheDocument();
    expect(screen.getByText(/1 fuera/)).toBeInTheDocument();
  });

  it("groups cells per floor", async () => {
    queryMock.mockResolvedValue(ROWS);

    render(await MiniBoxMap({ branchId: "b1" }));

    expect(screen.getByText("Planta Baja")).toBeInTheDocument();
    expect(screen.getByText("Subsuelo")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-box-cell]")).toHaveLength(4);
  });

  it("labels each cell with its state and plate", async () => {
    queryMock.mockResolvedValue(ROWS);

    render(await MiniBoxMap({ branchId: "b1" }));

    const cells = [...document.querySelectorAll("[data-box-cell]")];
    const labels = cells.map((cell) => cell.getAttribute("aria-label"));

    expect(labels).toEqual([
      "Box 1, ocupado, patente AB123CD",
      "Box 2, libre",
      "Box 3, fuera de servicio",
      "Box 4, ocupado",
    ]);
  });

  it("tints each cell by status", async () => {
    queryMock.mockResolvedValue(ROWS);

    render(await MiniBoxMap({ branchId: "b1" }));

    const cells = [...document.querySelectorAll("[data-box-cell]")];
    const tones = cells.map((cell) => cell.className);
    // The exact palette is a design decision; the invariant is that the three
    // statuses are visually distinguishable and the two occupied boxes match.
    expect(new Set([tones[0], tones[1], tones[2]]).size).toBe(3);
    expect(tones[3]).toBe(tones[0]);
  });

  it("renders the grid container when there are boxes", async () => {
    queryMock.mockResolvedValue(ROWS);

    render(await MiniBoxMap({ branchId: "b1" }));

    expect(document.querySelector("[data-box-grid-mini]")).not.toBeNull();
  });
});
