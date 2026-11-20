import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiveStatus } from "@/components/shell/live-status";

const router = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
}));

beforeEach(() => {
  router.refresh.mockClear();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LiveStatus", () => {
  it("announces live data and refreshes on demand", async () => {
    const user = userEvent.setup();
    render(<LiveStatus />);

    await user.click(
      screen.getByRole("button", { name: "Datos en vivo. Actualizar ahora." }),
    );

    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes the server components on the configured interval", () => {
    vi.useFakeTimers();
    render(<LiveStatus intervalMs={1000} />);

    vi.advanceTimersByTime(1000);
    expect(router.refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    expect(router.refresh).toHaveBeenCalledTimes(3);
  });

  it("holds the refresh while a dialog is open", () => {
    vi.useFakeTimers();
    render(
      <>
        <LiveStatus intervalMs={1000} />
        <div role="dialog" aria-label="Edición en curso" />
      </>,
    );

    vi.advanceTimersByTime(1000);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("holds the refresh while the user is typing", () => {
    vi.useFakeTimers();
    render(
      <>
        <LiveStatus intervalMs={1000} />
        <input aria-label="Patente" />
      </>,
    );
    screen.getByLabelText("Patente").focus();

    vi.advanceTimersByTime(1000);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("stops refreshing when the device goes offline", () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    render(<LiveStatus intervalMs={1000} />);

    vi.advanceTimersByTime(5000);
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
