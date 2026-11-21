import type { AdminBox } from "./FloorManager";

const STATUS_DOT: Record<string, string> = {
  available: "bg-emerald-500",
  occupied: "bg-amber-500",
  out_of_service: "bg-red-500",
};

/** Cada box es solo lectura acá: se edita desde el mapa, con este link directo. */
export function BoxChip({ box }: { box: AdminBox }) {
  return (
    <a
      href={`/boxes/mapa?box=${box.id}`}
      data-box-map-link
      title="Editar en el mapa"
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition hover:border-neutral-500 ${
        box.is_active
          ? box.status === "occupied"
            ? "border-amber-900 bg-amber-950/50 text-amber-200"
            : "border-neutral-800 bg-neutral-950 text-neutral-200"
          : "border-dashed border-neutral-800 text-neutral-600"
      }`}
    >
      <span className={`size-2 rounded-full ${STATUS_DOT[box.status ?? ""] ?? "bg-neutral-600"}`} />
      <span className="font-mono font-semibold">{box.number}</span>
      {box.sector && <span className="text-neutral-500">· {box.sector}</span>}
      {box.status === "occupied" && box.plate && (
        <span className="font-medium">{box.plate}</span>
      )}
      {!box.is_active && <span className="text-[10px] uppercase tracking-wider">baja</span>}
    </a>
  );
}
