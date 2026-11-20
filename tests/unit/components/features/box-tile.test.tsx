import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BoxTile, type BoardBox } from "@/app/(app)/boxes/mapa/BoxTile";
import { formatTime } from "@/lib/format";

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

describe("BoxTile", () => {
  it("renders a free box with its number and sector", () => {
    const { container } = render(
      <BoxTile box={makeBox()} editable={false} selected={false} onSelect={vi.fn()} />,
    );

    expect(screen.getByText("PB-01")).toBeInTheDocument();
    expect(screen.getByText("Frente")).toBeInTheDocument();
    expect(screen.getByText("Libre")).toBeInTheDocument();
    const tile = container.querySelector("[data-box-tile]");
    expect(tile).toHaveAttribute("data-status", "available");
    expect(tile).not.toHaveAttribute("data-inactive");
  });

  it("shows a dash when the box has no sector", () => {
    render(
      <BoxTile
        box={makeBox({ sector: null })}
        editable={false}
        selected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the stay details of an occupied box", () => {
    const entryAt = "2026-03-04T12:05:00.000Z";
    render(
      <BoxTile
        box={makeBox({
          status: "occupied",
          plate: "AB123CD",
          entryAt,
          vehicleTypeName: "Auto",
          ticketNumber: "88",
          elapsedLabel: "1 h 20 min",
        })}
        editable={false}
        selected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("AB123CD")).toBeInTheDocument();
    expect(screen.getByText("Auto")).toBeInTheDocument();
    expect(screen.getByText("Ticket #88")).toBeInTheDocument();
    expect(
      screen.getByText(`desde ${formatTime(entryAt)} · 1 h 20 min`),
    ).toBeInTheDocument();
    expect(screen.queryByText("Ocupado")).toBeNull();
  });

  it("fills the missing stay details of an occupied box with dashes", () => {
    const entryAt = "2026-03-04T12:05:00.000Z";
    render(
      <BoxTile
        box={makeBox({ status: "occupied", entryAt })}
        editable={false}
        selected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Ticket #—")).toBeInTheDocument();
    expect(screen.getByText(`desde ${formatTime(entryAt)}`)).toBeInTheDocument();
  });

  it("renders the out of service label", () => {
    const { container } = render(
      <BoxTile
        box={makeBox({ status: "out_of_service" })}
        editable={false}
        selected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Fuera de servicio")).toBeInTheDocument();
    expect(container.querySelector("[data-box-tile]")).toHaveAttribute(
      "data-status",
      "out_of_service",
    );
  });

  it("marks an inactive box as out of the board", () => {
    const { container } = render(
      <BoxTile
        box={makeBox({ isActive: false, status: "out_of_service" })}
        editable={false}
        selected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Inactivo")).toBeInTheDocument();
    expect(screen.getByText("Dado de baja")).toBeInTheDocument();
    const tile = container.querySelector("[data-box-tile]");
    expect(tile).toHaveAttribute("data-inactive", "true");
    expect(tile?.className).toContain("border-dashed");
  });

  it("is not a button when the board is read only", () => {
    render(
      <BoxTile box={makeBox()} editable={false} selected={false} onSelect={vi.fn()} />,
    );

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("selects the box on click and keyboard when editable", () => {
    const onSelect = vi.fn();
    render(<BoxTile box={makeBox()} editable selected={false} onSelect={onSelect} />);

    const tile = screen.getByRole("button");
    expect(tile).toHaveAttribute("tabindex", "0");

    fireEvent.click(tile);
    fireEvent.keyDown(tile, { key: "Enter" });
    fireEvent.keyDown(tile, { key: " " });

    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it("ignores other keys", () => {
    const onSelect = vi.fn();
    render(<BoxTile box={makeBox()} editable selected={false} onSelect={onSelect} />);

    fireEvent.keyDown(screen.getByRole("button"), { key: "Tab" });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("highlights the selected box", () => {
    const { container } = render(
      <BoxTile box={makeBox()} editable selected onSelect={vi.fn()} />,
    );

    expect(container.querySelector("[data-box-tile]")?.className).toContain(
      "ring-2 ring-amber-400",
    );
  });
});
