import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { ToastProvider, useToast } from "@/components/shell/toast";

function Trigger({ message, tone }: { message: string; tone?: "success" | "error" }) {
  const push = useToast();
  return (
    <button type="button" onClick={() => push(message, tone)}>
      push
    </button>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ToastProvider", () => {
  it("renders children and no toast initially", () => {
    render(
      <ToastProvider>
        <span>child</span>
      </ToastProvider>,
    );
    expect(screen.getByText("child")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("pushes a success toast by default", () => {
    render(
      <ToastProvider>
        <Trigger message="Turno abierto" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("push"));
    expect(screen.getByRole("status")).toHaveTextContent("Turno abierto");
  });

  it("pushes an error toast and removes it after 5 seconds", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger message="Falló el cobro" tone="error" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("push"));

    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Falló el cobro");
    expect(toast.className).toContain("red");

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stacks several toasts and expires them independently", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger message="uno" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("push"));
    fireEvent.click(screen.getByText("push"));
    expect(screen.getAllByRole("status")).toHaveLength(2);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("useToast is a no-op outside the provider", () => {
    render(<Trigger message="sin provider" />);
    expect(() => fireEvent.click(screen.getByText("push"))).not.toThrow();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
