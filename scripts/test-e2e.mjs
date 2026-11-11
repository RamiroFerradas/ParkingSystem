#!/usr/bin/env node
// Prueba E2E de la Etapa D por HTTP: login → turno → ingreso → cobro → cierre.
const BASE = process.env.BASE ?? "http://localhost:3200";
let failures = 0;
const ok = (name, cond, extra = "") => {
  if (cond) console.log(`✓ ${name}`);
  else { failures++; console.error(`✗ ${name} ${extra}`); }
};

const jar = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function api(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { "Content-Type": "application/json", cookie: cookieHeader(), ...(options.headers ?? {}) },
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

const dbRows = async (sql, params) => {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows;
  } finally {
    await client.end();
  }
};

try {
  // login
  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@parking.local", password: "Parking2026!" }),
  });
  ok("login 200", login.status === 200, JSON.stringify(login));

  // sin auth las rutas operativas exigen sesión
  const anon = await fetch(BASE + "/api/sessions/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  ok("API operativa exige sesión", anon.status === 401, String(anon.status));

  // abrir turno
  const shiftOpen = await api("/api/shifts/open", { method: "POST", body: JSON.stringify({ notes: "e2e" }) });
  ok("turno abierto", shiftOpen.status === 200 && !!shiftOpen.body.shiftId, JSON.stringify(shiftOpen.body));
  const dup = await api("/api/shifts/open", { method: "POST", body: JSON.stringify({}) });
  ok("doble turno rechazado", dup.status === 400, JSON.stringify(dup.body));

  // ids de referencia
  const refs = await dbRows(
    `SELECT (SELECT id FROM vehicle_types WHERE code='AUTO') vt,
            (SELECT id FROM parking_boxes WHERE number='05') box,
            (SELECT id FROM payment_methods WHERE code='EFECTIVO') method`);
  const { vt, box, method } = refs[0];

  // ingreso
  const open = await api("/api/sessions/open", {
    method: "POST",
    body: JSON.stringify({ sessionId: crypto.randomUUID(), plate: "EZE321", vehicleTypeId: vt, boxId: box, notes: "e2e" }),
  });
  ok("ingreso 200 con ticket", open.status === 200 && open.body.ticketNumber > 0, JSON.stringify(open.body));
  const ticket = open.body?.ticketNumber;

  // lookup reconoce el vehículo creado
  const lookup = await api("/api/vehicles/lookup?plate=eze321");
  ok("lookup normaliza patente", lookup.body.found === true, JSON.stringify(lookup.body));

  // egreso: cobro por HTTP
  const sessionId = (await dbRows(`SELECT id FROM parking_sessions WHERE ticket_number = $1`, [ticket]))[0].id;
  const close = await api("/api/sessions/close", {
    method: "POST",
    body: JSON.stringify({ sessionId, methodId: method, notes: "e2e" }),
  });
  ok("cobro 200", close.status === 200 && close.body.finalCents > 0, JSON.stringify(close.body));

  // el pago quedó atribuido al turno
  const pay = await dbRows(`SELECT p.amount_charged_cents, p.shift_id FROM payments p WHERE p.session_id = $1`, [sessionId]);
  ok("payment atribuido al turno", pay[0]?.shift_id !== null, JSON.stringify(pay));

  // cerrar turno
  const shiftClose = await api("/api/shifts/close", { method: "POST", body: JSON.stringify({ notes: "e2e fin" }) });
  ok("turno cerrado", shiftClose.status === 200, JSON.stringify(shiftClose.body));

  // pantallas server-rendered
  for (const path of ["/", "/operaciones/ingreso", "/operaciones/estadias", "/operaciones/egreso", "/administracion/turnos"]) {
    const res = await fetch(BASE + path, { headers: { cookie: cookieHeader() } });
    ok(`GET ${path} 200`, res.status === 200, String(res.status));
  }

  console.log(failures === 0 ? "\nE2E OK" : `\n${failures} FALLARON`);
} finally {
  // limpieza
  try {
    await dbRows(`DELETE FROM payments WHERE session_id IN (SELECT id FROM parking_sessions WHERE entry_notes = 'e2e' OR exit_notes = 'e2e')`, []);
    await dbRows(`DELETE FROM tariff_applications WHERE session_id IN (SELECT id FROM parking_sessions WHERE entry_notes = 'e2e' OR exit_notes = 'e2e')`, []);
    await dbRows(`DELETE FROM parking_sessions WHERE entry_notes = 'e2e' OR exit_notes = 'e2e'`, []);
    await dbRows(`DELETE FROM vehicles WHERE plate = 'EZE321'`, []);
  } catch (e) {
    console.error("cleanup:", e.message);
  }
}
process.exitCode = failures === 0 ? 0 : 1;
