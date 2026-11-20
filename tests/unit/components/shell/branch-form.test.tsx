import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BranchForm } from "@/components/shell/branch-form";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/sucursales",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}));

function response(
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): Response {
  const ok = init.ok ?? true;
  return {
    ok,
    status: init.status ?? (ok ? 200 : 400),
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BranchForm", () => {
  it("keeps submit disabled until a name is typed", async () => {
    const user = userEvent.setup();
    render(<BranchForm />);

    const submit = screen.getByRole("button", { name: "Crear sucursal" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Nombre"), "   ");
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Nombre"), "Centro");
    expect(submit).toBeEnabled();
  });

  it("creates the branch, clears the form and refreshes", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response({ ok: true }));
    render(<BranchForm />);

    await user.type(screen.getByLabelText("Nombre"), "Sucursal Norte");
    await user.type(screen.getByLabelText("Código (opcional)"), "NORTE");
    await user.click(screen.getByRole("button", { name: "Crear sucursal" }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/branches",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Sucursal Norte", code: "NORTE" }),
      }),
    );
    expect(screen.getByLabelText("Nombre")).toHaveValue("");
    expect(screen.getByLabelText("Código (opcional)")).toHaveValue("");
  });

  it("shows the API error message and keeps the entered values", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      response({ error: "El código ya existe" }, { ok: false }),
    );
    render(<BranchForm />);

    await user.type(screen.getByLabelText("Nombre"), "Centro");
    await user.click(screen.getByRole("button", { name: "Crear sucursal" }));

    expect(await screen.findByText("El código ya existe")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Centro");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for a non-JSON error body", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    render(<BranchForm />);

    await user.type(screen.getByLabelText("Nombre"), "Centro");
    await user.click(screen.getByRole("button", { name: "Crear sucursal" }));

    expect(
      await screen.findByText("No se pudo crear la sucursal"),
    ).toBeInTheDocument();
  });

  it("reports a network failure", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<BranchForm />);

    await user.type(screen.getByLabelText("Nombre"), "Centro");
    await user.click(screen.getByRole("button", { name: "Crear sucursal" }));

    expect(
      await screen.findByText("No se pudo crear la sucursal"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear sucursal" })).toBeEnabled();
  });
});
