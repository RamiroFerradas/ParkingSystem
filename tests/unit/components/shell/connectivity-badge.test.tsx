import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ConnectivityBadge } from "@/components/shell/connectivity-badge";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

beforeEach(() => {
  setOnline(true);
});

describe("ConnectivityBadge", () => {
  it("renders nothing while online", () => {
    setOnline(true);
    const { container } = render(<ConnectivityBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the offline notice when the browser goes offline", async () => {
    setOnline(false);
    render(<ConnectivityBadge />);
    expect(await screen.findByRole("status")).toHaveTextContent("Sin conexión");
  });

  it("reacts to online/offline events after mount", async () => {
    setOnline(true);
    render(<ConnectivityBadge />);
    expect(screen.queryByRole("status")).toBeNull();

    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Sin conexión");

    await act(async () => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
