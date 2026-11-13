"use client";

/**
 * Impresión térmica por Web Serial (Chrome/Edge, sitio HTTPS o localhost).
 * Cada impresión es una acción explícita del operador: requestPort exige
 * user gesture, así que el flujo es "tocar Imprimir → elegir impresora".
 */

export function isSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

/** Escribe los bytes del ticket al puerto elegido por el usuario. */
export async function printTicket(bytes: Uint8Array): Promise<void> {
  const serial = (navigator as unknown as {
    serial: {
      requestPort(options?: unknown): Promise<unknown>;
    };
  }).serial;
  if (!serial) throw new Error("Web Serial no disponible en este navegador");

  const port = (await serial.requestPort()) as {
    open(options: { baudRate: number }): Promise<void>;
    writable: {
      getWriter(): {
        write(data: Uint8Array): Promise<void>;
        releaseLock(): void;
      };
    } | null;
  };

  await port.open({ baudRate: 9600 });
  const writer = port.writable?.getWriter();
  if (!writer) throw new Error("El puerto no permite escritura");
  try {
    await writer.write(bytes);
    await new Promise((r) => setTimeout(r, 150)); // deja salir el buffer
  } finally {
    writer.releaseLock();
  }
}
