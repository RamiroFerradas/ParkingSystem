import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, ConfirmDialog, PromptDialog } from "@/components/ui/dialog";

function overlay(): HTMLElement {
  const element = document.querySelector<HTMLElement>(".dialog-overlay");
  if (!element) throw new Error("dialog overlay not found");
  return element;
}

describe("Dialog", () => {
  it("renders nothing while closed", () => {
    render(
      <Dialog open={false} onClose={vi.fn()} title="Título">
        body
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Título")).toBeNull();
  });

  it("renders a modal labelled by its title with description and footer", () => {
    render(
      <Dialog
        open
        onClose={vi.fn()}
        title="Eliminar box"
        description="Se borra el box 12"
        footer={<button type="button">Aceptar</button>}
      >
        <p>contenido</p>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Eliminar box");
    expect(dialog).toHaveTextContent("Se borra el box 12");
    expect(dialog).toHaveTextContent("contenido");
    expect(
      within(dialog).getByRole("button", { name: "Aceptar" }),
    ).toBeInTheDocument();
    expect(overlay().parentElement).toBe(document.body);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} title="Título" />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a backdrop mousedown but not on a panel mousedown", () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} title="Título" />);

    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(overlay());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("locks body scroll while open and restores it on close", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog open={false} onClose={onClose} title="Título" />,
    );
    expect(document.body.style.overflow).not.toBe("hidden");

    rerender(<Dialog open onClose={onClose} title="Título" />);
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<Dialog open={false} onClose={onClose} title="Título" />);
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("focuses the first control and restores the previous focus on close", () => {
    const onClose = vi.fn();
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">Origen</button>
          <Dialog
            open={open}
            onClose={onClose}
            title="Título"
            footer={
              <>
                <button type="button">Primero</button>
                <button type="button">Segundo</button>
              </>
            }
          />
        </>
      );
    }

    const { rerender } = render(<Harness open={false} />);
    const origin = screen.getByRole("button", { name: "Origen" });
    origin.focus();
    expect(origin).toHaveFocus();

    rerender(<Harness open />);
    expect(screen.getByRole("button", { name: "Primero" })).toHaveFocus();

    rerender(<Harness open={false} />);
    expect(origin).toHaveFocus();
  });

  it("wraps Tab and Shift+Tab inside the panel", () => {
    render(
      <Dialog
        open
        onClose={vi.fn()}
        title="Título"
        footer={
          <>
            <button type="button">Primero</button>
            <button type="button">Segundo</button>
          </>
        }
      />,
    );

    const first = screen.getByRole("button", { name: "Primero" });
    const last = screen.getByRole("button", { name: "Segundo" });

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("ignores Escape when no dialog is open", () => {
    const onClose = vi.fn();
    render(<Dialog open={false} onClose={onClose} title="Título" />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ConfirmDialog", () => {
  it("renders the confirm label and calls the callbacks", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Eliminar box"
        description="No se puede deshacer"
        confirmLabel="Eliminar box"
      />,
    );

    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Eliminar box" }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the busy state and blocks every close path", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        busy
        onClose={onClose}
        onConfirm={onConfirm}
        title="Eliminar box"
        confirmLabel="Eliminar box"
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Procesando…");
    expect(
      within(dialog).getByRole("button", { name: "Procesando…" }),
    ).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeDisabled();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(overlay());
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders the error message and the icon block", () => {
    render(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Eliminar box"
        description="Tiene una estadía abierta"
        confirmLabel="Eliminar"
        icon={<svg data-testid="icon" />}
        error="La operación falló"
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Tiene una estadía abierta");
    expect(dialog).toHaveTextContent("La operación falló");
    expect(within(dialog).getByTestId("icon")).toBeInTheDocument();
  });

  it("uses the neutral (non-danger) styling when tone is default", () => {
    render(
      <ConfirmDialog
        open
        tone="default"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Guardar"
        confirmLabel="Guardar"
      />,
    );

    expect(overlay()).toHaveAttribute("data-tone", "default");
  });
});

describe("PromptDialog", () => {
  it("prefills the input and keeps submit disabled while empty", () => {
    const { rerender } = render(
      <PromptDialog
        key="empty"
        open
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        title="Nuevo box"
        label="Nombre del box"
        confirmLabel="Crear"
      />,
    );

    const input = screen.getByLabelText("Nombre del box");
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("maxLength", "72");
    expect(screen.getByRole("button", { name: "Crear" })).toBeDisabled();

    // Callers remount with a new `key` to seed a different default value.
    rerender(
      <PromptDialog
        key="prefilled"
        open
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        title="Nuevo box"
        label="Nombre del box"
        defaultValue="A-12"
        confirmLabel="Crear"
      />,
    );
    expect(screen.getByLabelText("Nombre del box")).toHaveValue("A-12");
    expect(screen.getByRole("button", { name: "Crear" })).toBeEnabled();
  });

  it("submits the typed value", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <PromptDialog
        open
        onClose={vi.fn()}
        onSubmit={onSubmit}
        title="Nuevo box"
        label="Nombre del box"
        confirmLabel="Crear"
      />,
    );

    await user.type(screen.getByLabelText("Nombre del box"), "B-07");
    await user.click(screen.getByRole("button", { name: "Crear" }));

    expect(onSubmit).toHaveBeenCalledWith("B-07");
  });

  it("enforces minLength before enabling submit", async () => {
    const user = userEvent.setup();
    render(
      <PromptDialog
        open
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        title="Nueva clave"
        label="Clave"
        type="password"
        minLength={4}
        confirmLabel="Guardar"
      />,
    );

    const input = screen.getByLabelText("Clave");
    expect(input).toHaveAttribute("type", "password");

    await user.type(input, "abc");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();

    await user.type(input, "d");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });

  it("shows the hint, error and busy state", () => {
    render(
      <PromptDialog
        open
        busy
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        title="Nueva clave"
        label="Clave"
        defaultValue="secreta"
        hint="Mínimo 8 caracteres"
        confirmLabel="Guardar"
        error="Clave demasiado corta"
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Mínimo 8 caracteres");
    expect(dialog).toHaveTextContent("Clave demasiado corta");
    expect(
      within(dialog).getByRole("button", { name: "Guardando…" }),
    ).toBeDisabled();
  });

  it("blocks closing while busy", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <PromptDialog
        open
        busy
        onClose={onClose}
        onSubmit={vi.fn()}
        title="Nueva clave"
        label="Clave"
        defaultValue="secreta"
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(overlay());
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onClose).not.toHaveBeenCalled();
  });
});
