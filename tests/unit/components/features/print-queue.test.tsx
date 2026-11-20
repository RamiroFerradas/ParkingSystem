import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrintQueuePanel } from "@/app/(app)/operaciones/ingreso/print-queue";

const { printSessionTicketMock } = vi.hoisted(() => ({
  printSessionTicketMock: vi.fn(),
}));

vi.mock("@/lib/print/client", () => ({
  printSessionTicket: printSessionTicketMock,
}));

interface Job {
  id: string;
  session_id: string;
  kind: string;
  attempts: number;
  last_error: string | null;
  ticket_number: string;
  plate: string | null;
}

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    session_id: "session-1",
    kind: "entry",
    attempts: 1,
    last_error: null,
    ticket_number: "42",
    plate: "AB123CD",
    ...overrides,
  };
}

const fetchMock = vi.fn();

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function serveJobs(pending: Job[], failed: Job[] = []) {
  fetchMock.mockImplementation(async (url: unknown) => {
    const target = String(url);
    if (target.includes("status=pending")) return jsonResponse({ jobs: pending });
    if (target.includes("status=error")) return jsonResponse({ jobs: failed });
    throw new Error(`unexpected fetch: ${target}`);
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  printSessionTicketMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PrintQueuePanel", () => {
  it("shows the empty state when there are no pending jobs", async () => {
    serveJobs([], []);
    render(<PrintQueuePanel />);

    expect(
      await screen.findByText("Sin tickets pendientes."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tickets pendientes de impresión" })).toBeInTheDocument();
  });

  it("lists pending and failed jobs with their ticket, plate and last error", async () => {
    serveJobs(
      [job({ id: "job-1", ticket_number: "42", plate: "AB123CD", attempts: 3 })],
      [job({ id: "job-2", ticket_number: "43", plate: null, kind: "reprint", last_error: "papel trabado" })],
    );
    render(<PrintQueuePanel />);

    expect(await screen.findByText(/Ticket 42 · AB123CD/)).toBeInTheDocument();
    expect(screen.getByText("intento 3")).toBeInTheDocument();
    expect(screen.getByText(/Ticket 43 · —/)).toBeInTheDocument();
    expect(screen.getByText("papel trabado")).toBeInTheDocument();
    expect(screen.queryByText(/intento 1/)).not.toBeInTheDocument();
  });

  it("queries pending and failed jobs on mount", async () => {
    serveJobs([], []);
    render(<PrintQueuePanel />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledWith("/api/print-jobs?status=pending");
    expect(fetchMock).toHaveBeenCalledWith("/api/print-jobs?status=error");
  });

  it("retries an entry job and reloads the queue", async () => {
    serveJobs([job({ id: "job-1", session_id: "session-1", kind: "entry" })], []);
    printSessionTicketMock.mockResolvedValue({ jobId: "job-1" });
    render(<PrintQueuePanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Imprimir" }));

    await waitFor(() =>
      expect(printSessionTicketMock).toHaveBeenCalledWith("session-1", "entry"),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });

  it("reprints non-entry jobs", async () => {
    serveJobs([job({ id: "job-1", session_id: "session-9", kind: "reprint" })], []);
    printSessionTicketMock.mockResolvedValue({ jobId: "job-1" });
    render(<PrintQueuePanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Imprimir" }));

    await waitFor(() =>
      expect(printSessionTicketMock).toHaveBeenCalledWith("session-9", "reprint"),
    );
  });

  it("disables the button while printing", async () => {
    serveJobs([job({ id: "job-1" })], []);
    let release: (value: { jobId: string }) => void = () => {};
    printSessionTicketMock.mockReturnValue(
      new Promise<{ jobId: string }>((resolve) => {
        release = resolve;
      }),
    );
    render(<PrintQueuePanel />);

    const button = await screen.findByRole("button", { name: "Imprimir" });
    fireEvent.click(button);

    const busy = await screen.findByRole("button", { name: "Imprimiendo..." });
    expect(busy).toBeDisabled();

    release({ jobId: "job-1" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Imprimiendo..." })).toBeNull());
  });

  // FIXED (print-queue.tsx:61-65): this test used to assert the bug — the catch block set
  // "Sigue pendiente: ..." and then awaited reload(), whose success branch called
  // setError(null), so the operator never saw why the retry failed. The reload now keeps the
  // retry message when it succeeds.
  it("keeps the pending message after the failed retry reloads the queue", async () => {
    serveJobs([job({ id: "job-1", session_id: "session-1" })], []);
    printSessionTicketMock.mockRejectedValue(new Error("sin conexión"));
    render(<PrintQueuePanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Imprimir" }));

    expect(await screen.findByText("Sigue pendiente: sin conexión")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(screen.getByText("Sigue pendiente: sin conexión")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeEnabled();
  });

  it("shows the load error when both the retry and the reload fail", async () => {
    serveJobs([job()], []);
    printSessionTicketMock.mockRejectedValue(new Error("sin conexión"));
    render(<PrintQueuePanel />);

    const button = await screen.findByRole("button", { name: "Imprimir" });
    fetchMock.mockRejectedValue(new Error("offline"));
    fireEvent.click(button);

    expect(
      await screen.findByText("No se pudo cargar la cola de impresión"),
    ).toBeInTheDocument();
  });

  it("shows a load error when the queue cannot be fetched", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<PrintQueuePanel />);

    expect(
      await screen.findByText("No se pudo cargar la cola de impresión"),
    ).toBeInTheDocument();
    expect(screen.getByText("Sin tickets pendientes.")).toBeInTheDocument();
  });

  it("reloads when refreshKey changes", async () => {
    serveJobs([], []);
    const { rerender } = render(<PrintQueuePanel refreshKey={0} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    rerender(<PrintQueuePanel refreshKey={1} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });
});
