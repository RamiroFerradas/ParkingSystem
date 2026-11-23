import { query } from "@/lib/db/client";
import { getBranchContext } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { formatARS } from "@/lib/format";
import Link from "next/link";
import { TZ } from "@/lib/reports/period";
import { currentMonth, monthLabel } from "@/lib/reports/months";
import { AccessDenied } from "@/components/ui/access-denied";
import { Card, Td, Th } from "@/components/ui/report-table";

export { TZ };
export const PAGE_SIZE = 10;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Rango [inicio, fin) del mes en UTC sobre `entry_at`. */
function monthRangeSql(column: string, placeholder: string): string {
  return `${column} >= ((${placeholder} || '-01')::timestamp AT TIME ZONE '${TZ}')
      AND ${column} < (((${placeholder} || '-01')::timestamp + interval '1 month') AT TIME ZONE '${TZ}')`;
}

interface BoxRow {
  box_id: string;
  box_number: string;
  sector: string;
  movements: string;
  billed_cents: string;
}

export default async function BoxesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; page?: string }>;
}) {
  const context = await getBranchContext();
  if (!context) redirect("/login");
  if (!context.branchId) redirect("/seleccionar-sucursal");
  if (!context.can("reports.read")) {
    return <AccessDenied message="Requiere permiso de reportes (supervisor o administrador)." />;
  }
  const branchId = context.branchId;

  const params = await searchParams;
  const month = params.m && MONTH_RE.test(params.m) ? params.m : currentMonth();
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const range = monthRangeSql("s.entry_at", "$1");

  const totals = await query<{ movements: string; boxes: string; billed: string }>(
    `SELECT count(*)::text AS movements,
            count(DISTINCT s.box_id)::text AS boxes,
            COALESCE(sum(s.final_amount_cents), 0)::text AS billed
       FROM parking_sessions s
      WHERE s.status <> 'annulled' AND s.branch_id = $2::uuid AND ${range}`,
    [month, branchId],
  );
  const summary = totals[0] ?? { movements: "0", boxes: "0", billed: "0" };

  const totalBoxes = Number(summary.boxes);
  const totalPages = Math.max(1, Math.ceil(totalBoxes / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await query<BoxRow>(
    `SELECT b.id::text AS box_id,
            b.number AS box_number,
            COALESCE(b.sector, '—') AS sector,
            count(*)::text AS movements,
            COALESCE(sum(s.final_amount_cents), 0)::text AS billed_cents
       FROM parking_sessions s
       JOIN parking_boxes b ON b.id = s.box_id
      WHERE s.status <> 'annulled' AND s.branch_id = $2::uuid AND ${range}
      GROUP BY b.id, b.number, b.sector
      ORDER BY count(*) DESC, COALESCE(sum(s.final_amount_cents), 0) DESC, b.number
      LIMIT $3 OFFSET $4`,
    [month, branchId, PAGE_SIZE, offset],
  );

  const totalMovements = Number(summary.movements);
  const hrefFor = (targetPage: number) =>
    `/reportes/boxes?m=${month}${targetPage > 1 ? `&page=${targetPage}` : ""}`;

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Boxes con más movimiento</h1>
          <p className="text-sm text-neutral-500">
            Ranking del mes de {monthLabel(month)}: cantidad de estadías por box.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form method="get" className="flex items-center gap-2">
            <label htmlFor="m" className="text-xs text-neutral-500">
              Mes
            </label>
            <input
              id="m"
              type="month"
              name="m"
              defaultValue={month}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-200"
            />
            <button
              type="submit"
              className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              Ver
            </button>
          </form>
          <Link
            href={`/reportes?p=mes`}
            className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Volver a reportes
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3">
        <Card label="Movimientos del mes" value={summary.movements} size="lg" />
        <Card label="Boxes con movimiento" value={summary.boxes} size="lg" />
        <Card label="Recaudado" value={formatARS(summary.billed)} tone="green" size="lg" />
      </section>

      <section className="overflow-x-auto rounded-xl border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
            <tr>
              <Th padding="wide">Box</Th>
              <Th padding="wide">Sector</Th>
              <Th right padding="wide">Movimientos</Th>
              <Th right padding="wide">% del mes</Th>
              <Th right padding="wide">Recaudado</Th>
              <Th right padding="wide">Promedio</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  Sin movimientos en {monthLabel(month)}.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const movements = Number(row.movements);
              const share = totalMovements > 0 ? (movements / totalMovements) * 100 : 0;
              const average = movements > 0 ? Number(row.billed_cents) / movements : 0;
              return (
                <tr key={row.box_id}>
                  <Td mono padding="wide">{row.box_number}</Td>
                  <Td padding="wide">{row.sector}</Td>
                  <Td right strong padding="wide">
                    {row.movements}
                  </Td>
                  <Td right padding="wide">{share.toFixed(1)}%</Td>
                  <Td right padding="wide">{formatARS(row.billed_cents)}</Td>
                  <Td right padding="wide">{formatARS(average)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <nav
        aria-label="Paginación del ranking"
        className="flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-400"
      >
        <p>
          {totalBoxes === 0
            ? "0 boxes"
            : `Página ${page} de ${totalPages} · ${totalBoxes} boxes`}
        </p>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              href={hrefFor(page - 1)}
              className="rounded-md border border-neutral-700 px-3 py-1 text-neutral-300 hover:bg-neutral-800"
              rel="prev"
            >
              ← Anterior
            </Link>
          ) : (
            <span className="rounded-md border border-neutral-800 px-3 py-1 text-neutral-600">
              ← Anterior
            </span>
          )}
          {page < totalPages ? (
            <Link
              href={hrefFor(page + 1)}
              className="rounded-md border border-neutral-700 px-3 py-1 text-neutral-300 hover:bg-neutral-800"
              rel="next"
            >
              Siguiente →
            </Link>
          ) : (
            <span className="rounded-md border border-neutral-800 px-3 py-1 text-neutral-600">
              Siguiente →
            </span>
          )}
        </div>
      </nav>
    </div>
  );
}
