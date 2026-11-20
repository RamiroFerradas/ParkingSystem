/**
 * Snapshot del turno abierto que el shell muestra en el sidebar.
 * Vive fuera del loader para que el componente cliente importe solo el tipo,
 * sin arrastrar dependencias de servidor (pg).
 */
export interface OpenShiftSummary {
  id: string;
  /** Epoch ms de apertura: el navegador calcula el transcurrido sin zona horaria. */
  openedAtMs: number;
  /** Minutos transcurridos al momento de renderizar el servidor. */
  elapsedMinutes: number;
  /** Hora local de apertura ya formateada (evita desajustes de hidratación). */
  openedAtLabel: string;
  openedByName: string;
  /** Facturado del turno ya formateado en ARS. */
  collectedLabel: string;
  openSessions: number;
  /** Admin/supervisor cierran cualquiera; el empleado, solo el que abrió. */
  canClose: boolean;
}
