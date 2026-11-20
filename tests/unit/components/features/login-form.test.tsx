import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/app/login/login-form";

const router = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const fetchMock = vi.hoisted(() => vi.fn());
const fetchCalls = () => fetchMock.mock.calls.length;

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

async function fillAndSubmit(email = "ana@estaciona.test", password = "secreta123") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Contraseña"), password);
  await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));
}

describe("LoginForm", () => {
  it("renders the email and password fields with their Spanish labels", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("posts the credentials as JSON and redirects to the dashboard on success", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    render(<LoginForm />);

    await fillAndSubmit("ana@estaciona.test", "secreta123");

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(fetchCalls()).toBe(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({
      email: "ana@estaciona.test",
      password: "secreta123",
    });
  });

  it("shows the server error message and does not redirect", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Credenciales inválidas" }, 401));
    render(<LoginForm />);

    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent("Credenciales inválidas");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    render(<LoginForm />);

    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo iniciar sesión");
  });

  it("reports a network failure with its own message", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"));
    render(<LoginForm />);

    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo conectar con el servidor. Intentá de nuevo.",
    );
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("disables the submit button and shows progress while the request is pending", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    render(<LoginForm />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "ana@estaciona.test");
    await user.type(screen.getByLabelText("Contraseña"), "secreta123");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    const pendingButton = screen.getByRole("button", { name: "Ingresando..." });
    expect(pendingButton).toBeDisabled();

    await act(async () => {
      resolveFetch?.(jsonResponse({ ok: true }));
    });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
  });
});
