import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Alert } from "@/components/ui/alert";
import { StatCard } from "@/components/ui/stat-card";
import { Card, Empty, TableSection, Td, Th } from "@/components/ui/report-table";
import { StatusPill } from "@/components/ui/status-pill";
import { PlateBadge } from "@/components/ui/plate-badge";
import { AccessDenied } from "@/components/ui/access-denied";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, TextInput } from "@/components/ui/field";

describe("Alert", () => {
  it("renders its message with the dominant error palette by default", () => {
    render(<Alert>No se pudo guardar</Alert>);
    const alert = screen.getByText("No se pudo guardar");
    expect(alert).toHaveClass("border-red-800");
    expect(alert).toHaveClass("bg-red-950/50");
    expect(alert).toHaveClass("text-red-300");
  });

  it("keeps the soft red variant as its own tone", () => {
    render(<Alert tone="error-soft">Sin conexión</Alert>);
    const alert = screen.getByText("Sin conexión");
    expect(alert).toHaveClass("bg-red-500/10");
    expect(alert).toHaveClass("text-red-400");
    expect(alert).not.toHaveClass("border-red-800");
  });

  it("renders the warning and info palettes", () => {
    const { unmount } = render(<Alert tone="warning">Turno cerrado</Alert>);
    expect(screen.getByText("Turno cerrado")).toHaveClass("text-amber-200");
    unmount();

    render(<Alert tone="info">Dato informativo</Alert>);
    expect(screen.getByText("Dato informativo")).toHaveClass("text-sky-300");
  });

  it("accepts extra classes", () => {
    render(<Alert className="mt-3">Falla</Alert>);
    expect(screen.getByText("Falla")).toHaveClass("mt-3");
  });
});

describe("StatCard", () => {
  it("renders label and value with the neutral tone by default", () => {
    render(<StatCard label="Recaudado" value="$ 12.400" />);
    expect(screen.getByText("Recaudado")).toBeInTheDocument();
    const value = screen.getByText("$ 12.400");
    expect(value).toHaveClass("text-neutral-100");
    expect(value).toHaveClass("tabular-nums");
  });

  it("maps the green and amber tones", () => {
    const { unmount } = render(<StatCard label="Cobrado" value="1" tone="green" />);
    expect(screen.getByText("1")).toHaveClass("text-emerald-400");
    unmount();

    render(<StatCard label="Pendiente" value="2" tone="amber" />);
    expect(screen.getByText("2")).toHaveClass("text-amber-400");
  });

  it("sizes the value for md and lg", () => {
    const { unmount } = render(<StatCard label="a" value="md" size="md" />);
    expect(screen.getByText("md")).toHaveClass("text-lg");
    unmount();

    render(<StatCard label="a" value="lg" size="lg" />);
    expect(screen.getByText("lg")).toHaveClass("text-2xl");
  });

  it("renders an optional hint", () => {
    render(<StatCard label="a" value="b" hint="últimas 24 h" />);
    expect(screen.getByText("últimas 24 h")).toBeInTheDocument();
  });
});

describe("report table", () => {
  it("renders a section with its title and a table", () => {
    render(
      <TableSection title="Por día">
        <tbody />
      </TableSection>,
    );
    expect(screen.getByRole("heading", { name: "Por día" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("aligns Th to the right only when asked", () => {
    render(
      <table>
        <thead>
          <tr>
            <Th>Fecha</Th>
            <Th right>Total</Th>
          </tr>
        </thead>
      </table>,
    );
    const [fecha, total] = screen.getAllByRole("columnheader");
    expect(fecha).not.toHaveClass("text-right");
    expect(total).toHaveClass("text-right");
  });

  it("applies right, strong and mono to Td", () => {
    render(
      <table>
        <tbody>
          <tr>
            <Td>texto</Td>
            <Td right strong mono>
              123
            </Td>
          </tr>
        </tbody>
      </table>,
    );
    const [plain, rich] = screen.getAllByRole("cell");
    expect(plain).toHaveClass("text-neutral-300");
    expect(plain).not.toHaveClass("tabular-nums");
    expect(rich).toHaveClass("text-right");
    expect(rich).toHaveClass("tabular-nums");
    expect(rich).toHaveClass("font-medium");
    expect(rich).toHaveClass("text-neutral-100");
    expect(rich).toHaveClass("font-mono");
  });

  it("renders the fallback message spanning the requested columns", () => {
    render(
      <table>
        <tbody>
          <Empty cols={3} />
        </tbody>
      </table>,
    );
    const cell = screen.getByRole("cell");
    expect(cell).toHaveAttribute("colspan", "3");
    expect(cell).toHaveTextContent("Sin datos en el período.");
  });

  it("renders custom Empty children", () => {
    render(
      <table>
        <tbody>
          <Empty cols={2}>Sin abonados.</Empty>
        </tbody>
      </table>,
    );
    expect(screen.getByRole("cell")).toHaveTextContent("Sin abonados.");
  });

  it("reuses the stat card as Card", () => {
    render(<Card label="Caja" value="$ 500" tone="green" />);
    expect(screen.getByText("$ 500")).toHaveClass("text-emerald-400");
  });
});

describe("StatusPill", () => {
  it("renders the badge chrome with a neutral tone by default", () => {
    render(<StatusPill>Fija</StatusPill>);
    const pill = screen.getByText("Fija");
    expect(pill).toHaveClass("rounded-full");
    expect(pill).toHaveClass("border-neutral-700");
    expect(pill).toHaveClass("text-neutral-400");
  });

  it("maps green, amber and red tones", () => {
    const { unmount } = render(<StatusPill tone="green">Vigente</StatusPill>);
    expect(screen.getByText("Vigente")).toHaveClass("text-emerald-300");
    unmount();

    const amber = render(<StatusPill tone="amber">Temporal</StatusPill>);
    expect(screen.getByText("Temporal")).toHaveClass("text-amber-300");
    amber.unmount();

    render(<StatusPill tone="red">Vencido</StatusPill>);
    expect(screen.getByText("Vencido")).toHaveClass("text-red-300");
  });
});

describe("PlateBadge", () => {
  it("renders the plate chrome with the plate text", () => {
    render(<PlateBadge plate="ab123cd" />);
    const plate = screen.getByText("ab123cd");
    expect(plate).toHaveClass("text-plate-ink");
    expect(plate).toHaveClass("uppercase");
    expect(plate.parentElement).toHaveClass("bg-plate");
    expect(plate.previousElementSibling).toHaveClass("bg-plate-blue");
  });
});

describe("AccessDenied", () => {
  it("renders the default message", () => {
    render(<AccessDenied />);
    expect(screen.getByText("Acceso restringido")).toBeInTheDocument();
    expect(
      screen.getByText("Requiere permiso de reportes (supervisor o administrador)."),
    ).toBeInTheDocument();
  });

  it("renders a custom message", () => {
    render(<AccessDenied message="Solo el administrador puede gestionar usuarios." />);
    expect(
      screen.getByText("Solo el administrador puede gestionar usuarios."),
    ).toBeInTheDocument();
  });
});

describe("SubmitButton", () => {
  it("submits by default and renders its label", () => {
    render(<SubmitButton>Confirmar ingreso</SubmitButton>);
    const button = screen.getByRole("button", { name: "Confirmar ingreso" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toBeEnabled();
  });

  it("disables while busy and swaps the label", () => {
    render(
      <SubmitButton busy busyLabel="Registrando...">
        Confirmar ingreso
      </SubmitButton>,
    );
    const button = screen.getByRole("button", { name: "Registrando..." });
    expect(button).toBeDisabled();
    expect(screen.queryByText("Confirmar ingreso")).toBeNull();
  });

  it("merges extra classes without losing the primary chrome", () => {
    render(<SubmitButton className="sm:w-full">Guardar</SubmitButton>);
    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button).toHaveClass("bg-neutral-100");
    expect(button).toHaveClass("sm:w-full");
  });
});

describe("Field and TextInput", () => {
  it("wires the label to the control and shows hint and error", () => {
    render(
      <Field label="Patente" htmlFor="plate" hint="Sin espacios" error="Patente inválida">
        <TextInput id="plate" />
      </Field>,
    );
    expect(screen.getByLabelText("Patente")).toHaveAttribute("id", "plate");
    expect(screen.getByText("Sin espacios")).toBeInTheDocument();
    expect(screen.getByText("Patente inválida")).toBeInTheDocument();
  });

  it("applies the shared input classes and merges className", () => {
    render(<TextInput placeholder="ABC123" className="w-full" />);
    const input = screen.getByPlaceholderText("ABC123");
    expect(input).toHaveClass("border-neutral-700");
    expect(input).toHaveClass("focus:border-neutral-500");
    expect(input).toHaveClass("w-full");
  });

  it("forwards native input props", () => {
    render(<TextInput placeholder="mail" type="email" required />);
    const input = screen.getByPlaceholderText("mail");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toBeRequired();
  });
});
