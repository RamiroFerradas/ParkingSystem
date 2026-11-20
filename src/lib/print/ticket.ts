/**
 * Builder ESC/POS para tickets de 58 mm (RP-T001 / POS-5890C).
 * Produce bytes crudos listos para escribir por Web Serial.
 *
 * 58 mm útiles ≈ 32 columnas a fuente normal (font A, 12x24).
 * Los textos se pliegan a ASCII seguro: las codepages de acentos varían
 * entre firmwares, y un ticket de estacionamiento no pierde legibilidad
 * sin tildes.
 */

const WIDTH = 32; // columnas de fuente normal en 58mm

const ESC = 0x1b;
const GS = 0x1d;

export interface EntryTicketData {
  parkingName: string;
  ticketNumber: number;
  plate: string;
  vehicleType: string;
  boxNumber: string;
  entryAt: string; // ISO
  notes?: string | null;
  /** true = el cliente deja la llave dentro del vehículo. */
  keyLeft?: boolean;
  /** Roturas declaradas al ingresar (texto libre). */
  damageNotes?: string | null;
  reprint?: boolean;
}

export interface ExitReceiptData {
  parkingName: string;
  ticketNumber: number;
  plate: string;
  vehicleType: string;
  boxNumber: string;
  entryAt: string;
  exitAt: string;
  durationMinutes: number;
  breakdownLines: { label: string; amountCents: number }[];
  totalCents: number;
  methodName: string;
  reprint?: boolean;
}

/** Plega a ASCII printable single-line-safe (sin tildes ni ñ). */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/gi, "n")
    .replace(/[^\x20-\x7e]/g, "")
    .trim();
}

function pad(text: string, width = WIDTH): string {
  const t = fold(text);
  return t.length >= width ? t.slice(0, width) : t + " ".repeat(width - t.length);
}

/** Envuelve un texto libre en líneas de `width`, con sangría alineada al label. */
function block(label: string, value: string, width = WIDTH): string[] {
  const indent = " ".repeat(label.length);
  // El textarea permite Enter: se colapsan los blancos para no pegar palabras.
  const words = fold(value.replace(/\s+/g, " ")).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  // Un token más largo que la línea se parte en trozos, si no `pad()` lo truncaría.
  const room = width - label.length;
  const chunks = words.flatMap((word) => {
    if (word.length <= room) return [word];
    const parts: string[] = [];
    for (let i = 0; i < word.length; i += room) parts.push(word.slice(i, i + room));
    return parts;
  });
  const lines: string[] = [];
  let current = label;
  for (const word of chunks) {
    const gap = current.endsWith(" ") ? 0 : 1;
    if (current.length + gap + word.length > width) {
      lines.push(pad(current));
      current = indent + word;
    } else {
      current += " ".repeat(gap) + word;
    }
  }
  lines.push(pad(current));
  return lines;
}

/** Dos columnas: izquierda alineada, derecha alineada a la derecha. */
function twoCol(left: string, right: string, width = WIDTH): string {
  const l = fold(left);
  const r = fold(right);
  const space = Math.max(1, width - l.length - r.length);
  return l + " ".repeat(space) + r;
}

function center(text: string, width = WIDTH): string {
  const t = fold(text);
  if (t.length >= width) return t.slice(0, width);
  const left = Math.floor((width - t.length) / 2);
  return " ".repeat(left) + t;
}

function formatAr(cents: number): string {
  return `$${(cents / 100).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
}

/** Fecha/hora del negocio en texto local (se imprime tal cual llega formateada). */
function stamp(iso: string): string {
  // America/Argentina/Cordoba == sin DST desde 2009 == UTC-3 fijo
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function text(bytes: number[], s: string) {
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined) bytes.push(cp & 0xff);
  }
}

/** init + font A + double-size title */
function header(bytes: number[], title: string) {
  bytes.push(ESC, 0x40); // init
  bytes.push(ESC, 0x74, 0x00); // codepage 0
  bytes.push(ESC, 0x21, 0x30); // double width+height
  text(bytes, center(title) + "\n");
  bytes.push(ESC, 0x21, 0x00); // normal
}

function rule(bytes: number[]) {
  text(bytes, "-".repeat(WIDTH) + "\n");
}

export function buildEntryTicket(d: EntryTicketData): Uint8Array {
  const bytes: number[] = [];
  header(bytes, d.parkingName);
  bytes.push(ESC, 0x45, 0x01); // bold on
  text(bytes, center(d.reprint ? "*** REIMPRESION ***" : "COMPROBANTE DE INGRESO") + "\n");
  bytes.push(ESC, 0x45, 0x00); // bold off
  rule(bytes);
  text(bytes, twoCol("Ticket:", String(d.ticketNumber)) + "\n");
  bytes.push(ESC, 0x21, 0x20); // double width
  text(bytes, center(d.plate) + "\n");
  bytes.push(ESC, 0x21, 0x00);
  text(bytes, twoCol("Tipo:", d.vehicleType) + "\n");
  text(bytes, twoCol("Box:", d.boxNumber) + "\n");
  text(bytes, twoCol("Ingreso:", stamp(d.entryAt)) + "\n");
  text(bytes, twoCol("Llave:", d.keyLeft ? "EN EL VEHICULO" : "RETIRADA") + "\n");
  if (d.damageNotes) {
    for (const line of block("Rotura: ", d.damageNotes)) text(bytes, line + "\n");
  }
  if (d.notes) text(bytes, pad(`Obs: ${d.notes}`) + "\n");
  rule(bytes);
  text(bytes, center("Conserve este ticket") + "\n");
  text(bytes, center(stamp(new Date().toISOString())) + "\n");
  // feed + cut
  bytes.push(0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0x00);
  return new Uint8Array(bytes);
}

export function buildExitReceipt(d: ExitReceiptData): Uint8Array {
  const bytes: number[] = [];
  header(bytes, d.parkingName);
  bytes.push(ESC, 0x45, 0x01);
  text(bytes, center(d.reprint ? "*** REIMPRESION ***" : "COMPROBANTE DE PAGO") + "\n");
  bytes.push(ESC, 0x45, 0x00);
  rule(bytes);
  text(bytes, twoCol("Ticket:", String(d.ticketNumber)) + "\n");
  text(bytes, twoCol("Patente:", d.plate) + "\n");
  text(bytes, twoCol("Tipo:", d.vehicleType) + "\n");
  text(bytes, twoCol("Box:", d.boxNumber) + "\n");
  text(bytes, twoCol("Ingreso:", stamp(d.entryAt)) + "\n");
  text(bytes, twoCol("Egreso:", stamp(d.exitAt)) + "\n");
  text(bytes, twoCol("Tiempo:", duration(d.durationMinutes)) + "\n");
  rule(bytes);
  for (const line of d.breakdownLines) {
    text(bytes, twoCol(line.label, formatAr(line.amountCents)) + "\n");
  }
  bytes.push(ESC, 0x45, 0x01);  text(bytes, twoCol("TOTAL", formatAr(d.totalCents)) + "\n");
  bytes.push(ESC, 0x45, 0x00);
  text(bytes, twoCol("Pago:", d.methodName) + "\n");
  rule(bytes);
  text(bytes, center("Gracias por su visita") + "\n");
  text(bytes, center(stamp(new Date().toISOString())) + "\n");
  bytes.push(0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0x00);
  return new Uint8Array(bytes);
}
