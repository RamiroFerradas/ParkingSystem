import { describe, it, expect, vi, afterEach } from "vitest";
import { isSerialSupported, printTicket } from "@/lib/print/serial";

function stubSerial(serial: unknown) {
  Object.defineProperty(navigator, "serial", {
    value: serial,
    configurable: true,
    writable: true,
  });
}

function clearSerial() {
  // jsdom's navigator keeps the property once defined.
  delete (navigator as unknown as { serial?: unknown }).serial;
}

afterEach(() => {
  clearSerial();
  vi.useRealTimers();
});

describe("isSerialSupported", () => {
  it("is false when navigator has no serial API", () => {
    clearSerial();
    expect(isSerialSupported()).toBe(false);
  });

  it("is true when navigator exposes serial", () => {
    stubSerial({});
    expect(isSerialSupported()).toBe(true);
  });
});

describe("printTicket", () => {
  it("rejects when Web Serial is unavailable", async () => {
    clearSerial();
    await expect(printTicket(new Uint8Array([1]))).rejects.toThrow(
      "Web Serial no disponible en este navegador",
    );
  });

  it("requests a port, opens it at 9600 baud and writes the bytes", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const releaseLock = vi.fn();
    const open = vi.fn().mockResolvedValue(undefined);
    const requestPort = vi.fn().mockResolvedValue({
      open,
      writable: { getWriter: () => ({ write, releaseLock }) },
    });
    stubSerial({ requestPort });

    vi.useFakeTimers();
    const bytes = new Uint8Array([27, 64]);
    const done = printTicket(bytes);
    await vi.runAllTimersAsync();
    await done;

    expect(requestPort).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({ baudRate: 9600 });
    expect(write).toHaveBeenCalledWith(bytes);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it("rejects when the port exposes no writable stream", async () => {
    stubSerial({
      requestPort: vi.fn().mockResolvedValue({
        open: vi.fn().mockResolvedValue(undefined),
        writable: null,
      }),
    });

    await expect(printTicket(new Uint8Array([1]))).rejects.toThrow(
      "El puerto no permite escritura",
    );
  });
});
