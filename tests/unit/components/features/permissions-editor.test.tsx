import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PermissionsEditor } from "@/app/(app)/administracion/usuarios/permissions-editor";

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

interface Row {
  permission: string;
  label: string;
  group: string;
  roleAllowed: boolean;
  override: boolean | null;
  effective: boolean;
}

const ROWS: Row[] = [
  {
    permission: "user.manage",
    label: "Usuarios",
    group: "Administración",
    roleAllowed: true,
    override: null,
    effective: true,
  },
  {
    permission: "tariff.manage",
    label: "Productos tarifarios",
    group: "Tarifas",
    roleAllowed: false,
    override: true,
    effective: true,
  },
  {
    permission: "reports.read",
    label: "Reportes",
    group: "Estadísticas",
    roleAllowed: true,
    override: false,
    effective: false,
  },
];

function permissionsPayload(rows: Row[] = ROWS) {
  return jsonResponse({ permissions: rows });
}

function mockGetRows(rows: Row[] = ROWS) {
  fetchMock.mockImplementation(() => Promise.resolve(permissionsPayload(rows)));
}

function renderEditor(overrides: Partial<Parameters<typeof PermissionsEditor>[0]> = {}) {
  return render(
    <PermissionsEditor
      userId="u1"
      userLabel="Ana Pérez"
      isSelf={false}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

async function findSelect(label: string) {
  const item = (await screen.findByText(label)).closest("li");
  return item!.querySelector("select") as HTMLSelectElement;
}

describe("PermissionsEditor", () => {
  it("requests the permissions of the given user on mount", async () => {
    mockGetRows();
    renderEditor({ userId: "u7" });

    expect(await screen.findByText("Usuarios")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe("/api/users/u7/permissions");
    expect(init).toBeUndefined();
  });

  it("shows the loading state until the request resolves", async () => {
    mockGetRows();
    renderEditor();

    expect(screen.getByText("Cargando accesos…")).toBeInTheDocument();
    await screen.findByText("Usuarios");
    expect(screen.queryByText("Cargando accesos…")).toBeNull();
  });

  it("groups rows and describes the role value plus inheritance", async () => {
    mockGetRows();
    renderEditor();

    expect(await screen.findByText("Administración")).toBeInTheDocument();
    expect(screen.getByText("Tarifas")).toBeInTheDocument();
    expect(screen.getByText("Estadísticas")).toBeInTheDocument();

    expect(screen.getByText("Rol: permitido · heredado")).toBeInTheDocument();
    expect(screen.getByText("Rol: negado · excepción")).toBeInTheDocument();
    expect(screen.getByText("Rol: permitido · excepción")).toBeInTheDocument();
  });

  it("maps the stored override to inherit/allow/deny on each select", async () => {
    mockGetRows();
    renderEditor();

    expect((await findSelect("Usuarios")).value).toBe("inherit");
    expect((await findSelect("Productos tarifarios")).value).toBe("allow");
    expect((await findSelect("Reportes")).value).toBe("deny");
  });

  it("saves every row as an override and refreshes the page", async () => {
    fetchMock.mockImplementation((input, init) => {
      if ((init as RequestInit | undefined)?.method === "PUT") {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      return Promise.resolve(permissionsPayload());
    });
    renderEditor();

    fireEvent.change(await findSelect("Reportes"), { target: { value: "allow" } });
    fireEvent.change(await findSelect("Usuarios"), { target: { value: "deny" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar accesos" }));

    expect(await screen.findByText("Accesos actualizados")).toBeInTheDocument();

    const putCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PUT",
    ) as [string, RequestInit];
    expect(putCall[0]).toBe("/api/users/u1/permissions");
    expect(JSON.parse(String(putCall[1].body))).toEqual({
      overrides: [
        { permission: "user.manage", allowed: false },
        { permission: "tariff.manage", allowed: true },
        { permission: "reports.read", allowed: true },
      ],
    });
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("re-fetches the permissions after a successful save", async () => {
    fetchMock.mockImplementation((input, init) => {
      if ((init as RequestInit | undefined)?.method === "PUT") {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      return Promise.resolve(permissionsPayload());
    });
    renderEditor();

    await screen.findByText("Usuarios");
    fireEvent.click(screen.getByRole("button", { name: "Guardar accesos" }));

    await screen.findByText("Accesos actualizados");
    const gets = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method !== "PUT",
    );
    expect(gets).toHaveLength(2);
  });

  it("shows the load error and no form when the GET fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Usuario inexistente" }, 404));
    renderEditor();

    expect(await screen.findByText("Usuario inexistente")).toBeInTheDocument();
    expect(screen.queryByText("Cargando accesos…")).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar accesos" })).toBeNull();
  });

  it("reports a connection failure while loading", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    renderEditor();

    expect(await screen.findByText("No se pudieron cargar los accesos")).toBeInTheDocument();
  });

  it("keeps the edits and shows the server error when saving fails", async () => {
    fetchMock.mockImplementation((input, init) => {
      if ((init as RequestInit | undefined)?.method === "PUT") {
        return Promise.resolve(jsonResponse({ error: "No autorizado" }, 403));
      }
      return Promise.resolve(permissionsPayload());
    });
    renderEditor();

    await findSelect("Reportes");
    fireEvent.click(screen.getByRole("button", { name: "Guardar accesos" }));

    expect(await screen.findByText("No autorizado")).toBeInTheDocument();
    expect(screen.queryByText("Accesos actualizados")).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();
    expect((await findSelect("Reportes")).value).toBe("deny");
  });

  it("locks the user.manage row when editing your own permissions", async () => {
    mockGetRows();
    renderEditor({ isSelf: true });

    const locked = await findSelect("Usuarios");
    expect(locked).toBeDisabled();
    expect(locked).toHaveAttribute("title", "No podés quitarte la administración de usuarios");
    expect(await findSelect("Reportes")).toBeEnabled();
  });

  it("calls onClose when the Cerrar button is pressed", async () => {
    mockGetRows();
    const onClose = vi.fn();
    renderEditor({ onClose });

    await screen.findByText("Usuarios");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
