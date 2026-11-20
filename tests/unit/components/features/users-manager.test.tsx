import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { UsersManager, type ManagedUser } from "@/app/(app)/administracion/usuarios/users-manager";

const router = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
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

const USERS: ManagedUser[] = [
  { id: "u1", full_name: "Ana Pérez", email: "ana@estaciona.test", role: "admin", is_active: true },
  { id: "u2", full_name: "Bruno Díaz", email: "bruno@estaciona.test", role: "employee", is_active: true },
  { id: "u3", full_name: "Carla Ruiz", email: "carla@estaciona.test", role: "supervisor", is_active: false },
];

/** Default fetch handler: permission loads return an empty catalogue. */
function mockFetch(
  handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
) {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/permissions")) return Promise.resolve(jsonResponse({ permissions: [] }));
    return Promise.resolve(handler(url, init));
  });
}

function rowOf(name: string) {
  return screen.getByText(name).closest("tr") as HTMLTableRowElement;
}

function bodyOf(init: RequestInit | undefined) {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

function fillNewUser(values: { email?: string; name?: string; password?: string }) {
  if (values.email !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: values.email } });
  }
  if (values.name !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("Nombre y apellido"), {
      target: { value: values.name },
    });
  }
  if (values.password !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("Contraseña (mín. 8)"), {
      target: { value: values.password },
    });
  }
}

describe("UsersManager", () => {
  it("renders every user with role, status and actions", () => {
    mockFetch(() => jsonResponse({}));
    render(<UsersManager currentUserId="u9" users={USERS} />);

    expect(screen.getByRole("heading", { name: "Usuarios" })).toBeInTheDocument();
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("ana@estaciona.test")).toBeInTheDocument();
    expect(screen.getAllByText("Activo")).toHaveLength(2);
    expect(screen.getByText("Inactivo")).toBeInTheDocument();

    expect(within(rowOf("Ana Pérez")).getByRole("combobox")).toHaveValue("admin");
    expect(within(rowOf("Bruno Díaz")).getByRole("combobox")).toHaveValue("employee");
    expect(within(rowOf("Carla Ruiz")).getByRole("combobox")).toHaveValue("supervisor");
  });

  it("explains the role catalogue in the footer", () => {
    mockFetch(() => jsonResponse({}));
    render(<UsersManager currentUserId="u9" users={USERS} />);

    expect(
      screen.getByText(
        "Administrador: acceso total. Supervisor: operación + reportes. Empleado: operación diaria.",
      ),
    ).toBeInTheDocument();
  });

  it("requires email, name and an 8 character password before creating a user", () => {
    mockFetch(() => jsonResponse({}));
    render(<UsersManager currentUserId="u9" users={USERS} />);

    const create = screen.getByRole("button", { name: "Crear usuario" });
    expect(create).toBeDisabled();

    fillNewUser({ email: "nuevo@estaciona.test", name: "Nuevo Usuario", password: "corta" });
    expect(create).toBeDisabled();

    fillNewUser({ password: "12345678" });
    expect(create).toBeEnabled();
  });

  it("creates a user with the selected role and appends it to the table", async () => {
    mockFetch(() =>
      jsonResponse({
        user: { id: "u4", full_name: "Nuevo Usuario", email: "nuevo@estaciona.test", role: "supervisor", is_active: true },
      }),
    );
    render(<UsersManager currentUserId="u9" users={USERS} />);

    fillNewUser({ email: "nuevo@estaciona.test", name: "Nuevo Usuario", password: "12345678" });
    const roleSelect = screen.getAllByRole("combobox")[0]!;
    fireEvent.change(roleSelect, { target: { value: "supervisor" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(await screen.findByText("Nuevo Usuario")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/users");
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toEqual({
      email: "nuevo@estaciona.test",
      fullName: "Nuevo Usuario",
      role: "supervisor",
      password: "12345678",
    });

    expect((screen.getByPlaceholderText("Email") as HTMLInputElement).value).toBe("");
    expect((screen.getByPlaceholderText("Nombre y apellido") as HTMLInputElement).value).toBe("");
    expect((screen.getByPlaceholderText("Contraseña (mín. 8)") as HTMLInputElement).value).toBe("");
  });

  it("shows the creation error and does not add the user", async () => {
    mockFetch(() => jsonResponse({ error: "El email ya está registrado" }, 409));
    render(<UsersManager currentUserId="u9" users={USERS} />);

    fillNewUser({ email: "ana@estaciona.test", name: "Otra Ana", password: "12345678" });
    fireEvent.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(await screen.findByText("El email ya está registrado")).toBeInTheDocument();
    expect(screen.queryByText("Otra Ana")).toBeNull();
  });

  it("patches the role and refreshes the route", async () => {
    mockFetch(() => jsonResponse({ user: {} }));
    render(<UsersManager currentUserId="u9" users={USERS} />);

    fireEvent.change(within(rowOf("Bruno Díaz")).getByRole("combobox"), {
      target: { value: "supervisor" },
    });

    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/users/u2");
    expect(init.method).toBe("PATCH");
    expect(bodyOf(init)).toEqual({ role: "supervisor" });
    await waitFor(() =>
      expect(within(rowOf("Bruno Díaz")).getByRole("combobox")).toHaveValue("supervisor"),
    );
  });

  it("deactivates a user and flips the action label", async () => {
    mockFetch(() => jsonResponse({ user: {} }));
    render(<UsersManager currentUserId="u9" users={USERS} />);

    fireEvent.click(within(rowOf("Bruno Díaz")).getByRole("button", { name: "Desactivar" }));

    await waitFor(() =>
      expect(within(rowOf("Bruno Díaz")).getByRole("button", { name: "Reactivar" })).toBeInTheDocument(),
    );
    expect(bodyOf(fetchMock.mock.calls[0]![1] as RequestInit)).toEqual({ isActive: false });
    expect(within(rowOf("Bruno Díaz")).getByText("Inactivo")).toBeInTheDocument();
  });

  it("protects the last active administrator from demotion and deactivation", () => {
    mockFetch(() => jsonResponse({}));
    render(<UsersManager currentUserId="u9" users={USERS} />);

    const row = rowOf("Ana Pérez");
    expect(within(row).getByRole("combobox")).toBeDisabled();
    expect(within(row).getByRole("button", { name: "Desactivar" })).toBeDisabled();
  });

  it("prevents the current user from changing their own role or deactivating themselves", () => {
    const alone: ManagedUser[] = [
      { id: "u1", full_name: "Ana Pérez", email: "ana@estaciona.test", role: "admin", is_active: true },
      { id: "u2", full_name: "Bruno Díaz", email: "bruno@estaciona.test", role: "admin", is_active: true },
    ];
    mockFetch(() => jsonResponse({}));
    render(<UsersManager currentUserId="u1" users={alone} />);

    const row = rowOf("Ana Pérez");
    expect(within(row).getByRole("combobox")).toBeDisabled();
    expect(within(row).getByRole("button", { name: "Desactivar" })).toBeDisabled();
    expect(within(rowOf("Bruno Díaz")).getByRole("combobox")).toBeEnabled();
  });

  it("opens the permissions editor for the chosen user", async () => {
    mockFetch(() => jsonResponse({}));
    render(<UsersManager currentUserId="u9" users={USERS} />);

    fireEvent.click(within(rowOf("Bruno Díaz")).getByRole("button", { name: "Accesos" }));

    expect(await screen.findByRole("heading", { name: "Accesos de Bruno Díaz" })).toBeInTheDocument();
    const calls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calls).toContain("/api/users/u2/permissions");
  });

  it("keeps the password dialog closed until the button is pressed and blocks short passwords", async () => {
    mockFetch(() => jsonResponse({}));
    render(<UsersManager currentUserId="u9" users={USERS} />);

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(within(rowOf("Bruno Díaz")).getByRole("button", { name: "Contraseña" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Cambiar contraseña" })).toBeInTheDocument();
    expect(within(dialog).getByText(/Nueva contraseña para/)).toHaveTextContent("Bruno Díaz");
    expect(within(dialog).getByText("Mínimo 8 caracteres.")).toBeInTheDocument();

    const input = within(dialog).getByLabelText("Contraseña nueva");
    fireEvent.change(input, { target: { value: "corta" } });
    expect(within(dialog).getByRole("button", { name: "Cambiar contraseña" })).toBeDisabled();

    fireEvent.change(input, { target: { value: "12345678" } });
    expect(within(dialog).getByRole("button", { name: "Cambiar contraseña" })).toBeEnabled();
  });

  it("saves the new password and closes the dialog", async () => {
    mockFetch(() => jsonResponse({ ok: true }));
    render(<UsersManager currentUserId="u9" users={USERS} />);

    fireEvent.click(within(rowOf("Bruno Díaz")).getByRole("button", { name: "Contraseña" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Contraseña nueva"), {
      target: { value: "nuevaClave9" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cambiar contraseña" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/users/u2");
    expect(init.method).toBe("PATCH");
    expect(bodyOf(init)).toEqual({ password: "nuevaClave9" });
  });

  it("shows the server error inside the password dialog", async () => {
    mockFetch(() => jsonResponse({ error: "La contraseña es demasiado débil" }, 400));
    render(<UsersManager currentUserId="u9" users={USERS} />);

    fireEvent.click(within(rowOf("Bruno Díaz")).getByRole("button", { name: "Contraseña" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Contraseña nueva"), {
      target: { value: "12345678" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cambiar contraseña" }));

    expect(await screen.findByText("La contraseña es demasiado débil")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
