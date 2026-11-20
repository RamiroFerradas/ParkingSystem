import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import {
  HistorialTable,
  type HistorialRow,
} from "@/app/(app)/operaciones/historial/HistorialTable";
import { formatARS, formatDate, formatElapsed, formatTime } from "@/lib/format";

const { printSessionTicketMock } = vi.hoisted(() => ({
  printSessionTicketMock: vi.fn(),
}));

vi.mock("@/lib/print/client", () => ({
  printSessionTicket: printSessionTicketMock,
}));

function makeRow(overrides: Partial<HistorialRow> = {}): HistorialRow {
  return {
    id: "row-1",
    ticket_number: "101",
    plate: "AB123CD",
    vehicle_type_name: "Auto",
    box_number: "PB-01",
    entry_at: "2026-01-15T12:30:00.000Z",
    exit_at: "2026-01-15T14:05:00.000Z",
    status: "closed",
    duration_minutes: 95,
    final_amount_cents: "200000",
    closed_by_name: "Mauricio",
    ...overrides,
  };
}

const EMPTY_CELL = "—";

beforeEach(() => {
  printSessionTicketMock.mockReset();
});

describe("HistorialTable", () => {
  it("shows the empty state when there are no rows", () => {
    render(<HistorialTable rows={[]} />);

    expect(screen.getByText("No hay estadías con esos filtros.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("renders the expected columns", () => {
    render(<HistorialTable rows={[makeRow()]} />);

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.replace(/[▲▼\s]/g, ""));
    expect(headers).toEqual([
      "Ticket",
      "Ingreso",
      "Egreso",
      "Patente",
      "Tipo",
      "Box",
      "Duración",
      "Cerró",
      "Estado",
      "Monto",
      "",
    ]);
  });

  it("renders a closed stay with formatted dates, duration and amount", () => {
    const row = makeRow();
    render(<HistorialTable rows={[row]} />);

    const [, bodyRow] = screen.getAllByRole("row");
    const cells = within(bodyRow!).getAllByRole("cell");

    expect(cells[0]).toHaveTextContent("#101");
    expect(cells[1]).toHaveTextContent(
      `${formatDate(row.entry_at)} ${formatTime(row.entry_at)}`,
    );
    expect(cells[2]).toHaveTextContent(
      `${formatDate(row.exit_at!)} ${formatTime(row.exit_at!)}`,
    );
    expect(cells[3]).toHaveTextContent("AB123CD");
    expect(cells[4]).toHaveTextContent("Auto");
    expect(cells[5]).toHaveTextContent("PB-01");
    expect(cells[6]).toHaveTextContent(formatElapsed(95));
    expect(cells[7]).toHaveTextContent("Mauricio");
    expect(cells[8]).toHaveTextContent("Cerrada");
    // formatARS uses a non-breaking space that RTL normalizes to " ".
    expect(cells[9]?.textContent?.replace(/\s/g, " ")).toBe(
      formatARS(200000).replace(/\s/g, " "),
    );
  });

  it("uses dashes for the fields of an open stay", () => {
    render(
      <HistorialTable
        rows={[
          makeRow({
            id: "row-open",
            ticket_number: "102",
            exit_at: null,
            status: "open",
            duration_minutes: null,
            final_amount_cents: null,
            closed_by_name: null,
            plate: null,
          }),
        ]}
      />,
    );

    const [, bodyRow] = screen.getAllByRole("row");
    const cells = within(bodyRow!).getAllByRole("cell");

    expect(cells[2]).toHaveTextContent(EMPTY_CELL);
    expect(cells[3]).toHaveTextContent(EMPTY_CELL);
    expect(cells[6]).toHaveTextContent(EMPTY_CELL);
    expect(cells[7]).toHaveTextContent(EMPTY_CELL);
    expect(cells[9]).toHaveTextContent(EMPTY_CELL);
    expect(cells[8]).toHaveTextContent("Abierta");
  });

  it("shows the raw status when it is not mapped", () => {
    render(<HistorialTable rows={[makeRow({ status: "cancelled" })]} />);

    expect(screen.getByText("cancelled")).toBeInTheDocument();
  });

  it("sorts by entry date descending by default", () => {
    render(
      <HistorialTable
        rows={[
          makeRow({ id: "old", ticket_number: "101", entry_at: "2026-01-01T10:00:00.000Z" }),
          makeRow({ id: "new", ticket_number: "103", entry_at: "2026-01-20T10:00:00.000Z" }),
          makeRow({ id: "mid", ticket_number: "102", entry_at: "2026-01-10T10:00:00.000Z" }),
        ]}
      />,
    );

    const body = screen.getAllByRole("row").slice(1);
    expect(body.map((row) => within(row).getAllByRole("cell")[0]?.textContent)).toEqual([
      "#103",
      "#102",
      "#101",
    ]);
  });

  it("sorts ascending and descending when the Ticket header is clicked", () => {
    render(
      <HistorialTable
        rows={[
          makeRow({ id: "b", ticket_number: "102", entry_at: "2026-01-10T10:00:00.000Z" }),
          makeRow({ id: "a", ticket_number: "101", entry_at: "2026-01-01T10:00:00.000Z" }),
          makeRow({ id: "c", ticket_number: "103", entry_at: "2026-01-20T10:00:00.000Z" }),
        ]}
      />,
    );

    const ticketHeader = screen.getByRole("columnheader", { name: /Ticket/ });

    fireEvent.click(ticketHeader);
    let body = screen.getAllByRole("row").slice(1);
    expect(body.map((row) => within(row).getAllByRole("cell")[0]?.textContent)).toEqual([
      "#101",
      "#102",
      "#103",
    ]);

    fireEvent.click(ticketHeader);
    body = screen.getAllByRole("row").slice(1);
    expect(body.map((row) => within(row).getAllByRole("cell")[0]?.textContent)).toEqual([
      "#103",
      "#102",
      "#101",
    ]);
  });

  it("reprints a ticket through the print client", async () => {
    printSessionTicketMock.mockResolvedValue({ jobId: "job-1" });
    render(<HistorialTable rows={[makeRow({ id: "row-77" })]} />);

    fireEvent.click(screen.getByRole("button", { name: "Reimprimir" }));

    await waitFor(() =>
      expect(printSessionTicketMock).toHaveBeenCalledWith("row-77", "reprint"),
    );
    expect(
      await screen.findByRole("button", { name: "Reimprimir" }),
    ).toBeEnabled();
  });

  // BUG (HistorialTable.tsx:145): the columns useMemo has an empty dependency list, so the
  // action cell keeps the printingId captured on the first render. The row button never turns
  // into "..." and is never disabled while a reprint is in flight.
  it("keeps the reprint button labelled and enabled while printing (stale closure)", async () => {
    let release: (value: { jobId: string }) => void = () => {};
    printSessionTicketMock.mockReturnValue(
      new Promise<{ jobId: string }>((resolve) => {
        release = resolve;
      }),
    );
    render(<HistorialTable rows={[makeRow({ id: "row-78" })]} />);

    fireEvent.click(screen.getByRole("button", { name: "Reimprimir" }));

    expect(screen.getByRole("button", { name: "Reimprimir" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "..." })).toBeNull();

    release({ jobId: "job-1" });
    await waitFor(() => expect(printSessionTicketMock).toHaveBeenCalledTimes(1));
  });

  it("shows the failing ticket number when a reprint fails", async () => {
    printSessionTicketMock.mockRejectedValue(new Error("impresora apagada"));
    render(<HistorialTable rows={[makeRow({ id: "row-79", ticket_number: "555" })]} />);

    fireEvent.click(screen.getByRole("button", { name: "Reimprimir" }));

    expect(
      await screen.findByText(
        "No se pudo reimprimir el ticket 555: impresora apagada",
      ),
    ).toBeInTheDocument();
  });

  it("uses a generic message when the reprint rejects with a non-Error", async () => {
    printSessionTicketMock.mockRejectedValue("boom");
    render(<HistorialTable rows={[makeRow({ ticket_number: "556" })]} />);

    fireEvent.click(screen.getByRole("button", { name: "Reimprimir" }));

    expect(
      await screen.findByText("No se pudo reimprimir el ticket 556"),
    ).toBeInTheDocument();
  });
});
