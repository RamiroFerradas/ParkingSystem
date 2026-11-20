import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { SwRegistration } from "@/components/pwa/sw-registration";

const register = vi.fn<() => Promise<void>>();

function setServiceWorker(value: unknown) {
  Object.defineProperty(navigator, "serviceWorker", {
    value,
    configurable: true,
  });
}

beforeEach(() => {
  register.mockReset();
  register.mockResolvedValue(undefined);
  setServiceWorker({ register });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("SwRegistration", () => {
  it("renders nothing", () => {
    const { container } = render(<SwRegistration />);
    expect(container).toBeEmptyDOMElement();
  });

  it("registers the service worker once on mount", async () => {
    render(<SwRegistration />);

    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("swallows registration failures", async () => {
    register.mockRejectedValue(new Error("scope conflict"));

    const { container } = render(<SwRegistration />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(register).toHaveBeenCalledWith("/sw.js");
    expect(container).toBeEmptyDOMElement();
  });

  it("does nothing when the browser has no service workers", () => {
    Reflect.deleteProperty(navigator, "serviceWorker");

    expect(() => render(<SwRegistration />)).not.toThrow();
    expect(register).not.toHaveBeenCalled();
  });
});
