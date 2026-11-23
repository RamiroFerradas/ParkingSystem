import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/lib/db/client";
import { getBranchContext } from "@/lib/auth/context";
import { AccessDenied } from "@/components/ui/access-denied";
import { Card, Td, Th } from "@/components/ui/report-table";
import { formatARS, formatDate, formatTime } from "@/lib/format";
import { PERIODS, resolvePeriod } from "@/lib/reports/period";

// La página consulta la DB en el servidor; en Next 16 dev la navegación se
// valida contra datos sin cachear. Se opta por ruta bloqueante (sin PPR).
export const instant = false;

interface BranchRow {
  id: string;
  name: string;
  entries: string;
  exits: string;
  inside: string;
  payments: string;
  collected: string;
  abonos: string;
  active_subs: string;
  recurring: string;
  last_payment: string | null;
}

export default async function SucursalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const context = await getBranchContext();
  if (!context) redirect("/login");
  if (!context.isMaster) {
    return (
      <AccessDenied message="Solo el dueño (master) puede ver el consolidado de todas las sucursales." />
    );
  }

  const params = await searchParams;
  const period = resolvePeriod(params.p);
  const paid = period.where("p.paid_at");
  const entry = period.where("s.entry_at");
  const exit = period.where("s.exit_at");

  const rows = await query<BranchRow>(
    `SELECT b.id, b.name,
            (SELECT count(*) FROM parking_sessions s
              WHERE s.branch_id = b.id AND ${entry})::text AS entries,
            (SELECT count(*) FROM parking_sessions s
              WHERE s.branch_id = b.id AND s.status = 'closed' AND ${exit})::text AS exits,
            (SELECT count(*) FROM parking_sessions s
              WHERE s.branch_id = b.id AND s.status = 'open')::text AS inside,
            (SELECT count(*) FROM payments p
              WHERE p.branch_id = b.id AND ${paid})::text AS payments,
            (SELECT COALESCE(sum(p.amount_charged_cents), 0) FROM payments p
              WHERE p.branch_id = b.id AND ${paid})::text AS collected,
            (SELECT COALESCE(sum(p.amount_charged_cents), 0) FROM payments p
              WHERE p.branch_id = b.id AND p.concept = 'subscription' AND ${paid})::text AS abonos,
            (SELECT count(*) FROM subscriptions s
              WHERE s.branch_id = b.id AND s.status = 'active'
                AND s.starts_on <= (now() AT TIME ZONE 'America/Argentina/Cordoba')::date
                AND s.ends_on >= (now() AT TIME ZONE 'America/Argentina/Cordoba')::date)::text AS active_subs,
            (SELECT COALESCE(sum(s.amount_cents), 0) FROM subscriptions s
              WHERE s.branch_id = b.id AND s.status = 'active'
                AND s.starts_on <= (now() AT TIME ZONE 'America/Argentina/Cordoba')::date
                AND s.ends_on >= (now() AT TIME ZONE 'America/Argentina/Cordoba')::date)::text AS recurring,
            (SELECT max(p.paid_at)::text FROM payments p
              WHERE p.branch_id = b.id) AS last_payment
       FROM branches b
      WHERE b.is_active
      ORDER BY b.name`,
  );

  const totals = rows.reduce(
    (acc, r) => ({
      collected: acc.collected + Number(r.collected),
      entries: acc.entries + Number(r.entries),
      exits: acc.exits + Number(r.exits),
      inside: acc.inside + Number(r.inside),
      payments: acc.payments + Number(r.payments),
      abonos: acc.abonos + Number(r.abonos),
      activeSubs: acc.activeSubs + Number(r.active_subs),
      recurring: acc.recurring + Number(r.recurring),
    }),
    {
      collected: 0,
      entries: 0,
      exits: 0,
      inside: 0,
      payments: 0,
      abonos: 0,
      activeSubs: 0,
      recurring: 0,
    },
  );

  const sorted = [...rows].sort((a, b) => Number(b.collected) - Number(a.collected));
  const maxCollected = Math.max(1, ...sorted.map((r) => Number(r.collected)));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
            Cómo viene cada sucursal
          </h1>
          <p className="text-sm text-neutral-500">
            Movimientos y facturación de todas las sucursales · período:{" "}
            {period.label.toLowerCase()}.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-1.5">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`/reportes/sucursales?p=${p.key}`}
              className={
                "rounded-md border px-2.5 py-1 text-xs " +
                (p.key === period.key
                  ? "border-neutral-400 bg-neutral-800 text-neutral-100"
                  : "border-neutral-700 text-neutral-400 hover:bg-neutral-800")
              }
            >
              {p.label}
            </Link>
          ))}
          <Link
            href="/sucursales"
            className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Administrar sucursales
          </Link>
        </nav>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Facturación total" value={formatARS(totals.collected)} tone="green" size="md" />
        <Card label="Movimientos" value={String(totals.entries + totals.exits)} size="md" />
        <Card label="Autos adentro" value={String(totals.inside)} size="md" />
        <Card
          label={`Abonados activos · ${formatARS(totals.recurring)}/mes`}
          value={String(totals.activeSubs)}
          size="md"
        />
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-neutral-200">Facturación por sucursal</h2>
          <span className="text-xs text-neutral-500">{formatARS(totals.collected)} total</span>
        </div>
        <ul className="mt-4 space-y-3">
          {sorted.map((r) => {
            const value = Number(r.collected);
            const width = Math.max(2, Math.round((value / maxCollected) * 100));
            const share = totals.collected > 0 ? (value / totals.collected) * 100 : 0;
            return (
              <li key={r.id}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate text-neutral-200">{r.name}</span>
                  <span className="shrink-0 tabular-nums text-neutral-400">
                    {formatARS(value)}
                    <span className="ml-2 text-neutral-500">{share.toFixed(1)}%</span>
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-emerald-500/70"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="overflow-x-auto rounded-xl border border-neutral-800">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-neutral-900 text-left text-xs text-neutral-500">
            <tr>
              <Th>Sucursal</Th>
              <Th right>Ingresos</Th>
              <Th right>Egresos</Th>
              <Th right>Adentro</Th>
              <Th right>Cobros</Th>
              <Th right>Ticket prom.</Th>
              <Th right>Abonos</Th>
              <Th right>Facturado</Th>
              <Th right>% total</Th>
              <Th>Último cobro</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-sm text-neutral-500">
                  No hay sucursales activas.
                </td>
              </tr>
            )}
            {sorted.map((r) => {
              const collected = Number(r.collected);
              const payments = Number(r.payments);
              const ticket = payments > 0 ? Math.round(collected / payments) : 0;
              const share = totals.collected > 0 ? (collected / totals.collected) * 100 : 0;
              return (
                <tr key={r.id} className="hover:bg-neutral-900/60">
                  <Td tone="inherit">{r.name}</Td>
                  <Td right tone="inherit">{r.entries}</Td>
                  <Td right tone="inherit">{r.exits}</Td>
                  <Td right tone="inherit">
                    <span className={Number(r.inside) > 0 ? "text-amber-300" : ""}>
                      {r.inside}
                    </span>
                  </Td>
                  <Td right tone="inherit">{r.payments}</Td>
                  <Td right tone="inherit">{formatARS(ticket)}</Td>
                  <Td right tone="inherit">{formatARS(r.abonos)}</Td>
                  <Td right strong tone="inherit">{formatARS(collected)}</Td>
                  <Td right tone="inherit">{share.toFixed(1)}%</Td>
                  <Td>
                    {r.last_payment
                      ? `${formatDate(r.last_payment)} ${formatTime(r.last_payment)}`
                      : "—"}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-500">
        “Adentro” son los autos estacionados ahora en cada sucursal. Los cobros y abonos
        se cuentan por la fecha de pago; los ingresos y egresos por la fecha de la estadía.
      </p>
    </div>
  );
}
