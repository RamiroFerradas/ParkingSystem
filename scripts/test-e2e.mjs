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

  // D6: el movimiento quedó encolado para el cloud (no se pierde sin Internet)
  const obx = await dbRows(
    `SELECT op, status FROM sync_outbox
      WHERE entity_type = 'parking_session' AND entity_id = $1
      ORDER BY created_at`,
    [sessionId],
  );
  ok(
    "outbox: ingreso+cobro encolados pendientes",
    obx.length === 2 &&
      obx[0].op === "insert" &&
      obx[1].op === "update" &&
      obx.every((r) => r.status === "pending"),
    JSON.stringify(obx),
  );

  // el pago quedó atribuido al turno
  const pay = await dbRows(`SELECT p.amount_charged_cents, p.shift_id FROM payments p WHERE p.session_id = $1`, [sessionId]);
  ok("payment atribuido al turno", pay[0]?.shift_id !== null, JSON.stringify(pay));

  // cerrar turno
  const shiftClose = await api("/api/shifts/close", { method: "POST", body: JSON.stringify({ notes: "e2e fin" }) });
  ok("turno cerrado", shiftClose.status === 200, JSON.stringify(shiftClose.body));

  // pantallas server-rendered
  for (const path of ["/", "/operaciones/ingreso", "/operaciones/estadias", "/operaciones/egreso", "/administracion/turnos", "/boxes/mapa", "/boxes/administracion", "/operaciones/historial"]) {
    const res = await fetch(BASE + path, { headers: { cookie: cookieHeader() } });
    ok(`GET ${path} 200`, res.status === 200, String(res.status));
  }

  // historial con filtros server-side
  const hist = await fetch(BASE + "/operaciones/historial?plate=EZE321&status=closed", {
    headers: { cookie: cookieHeader() },
  });
  const histHtml = await hist.text();
  ok("historial con filtros muestra la estadía", hist.status === 200 && histHtml.includes("EZE321"), String(hist.status));

  // export CSV con el mismo filtro
  const csv = await fetch(BASE + "/api/sessions/export?plate=EZE321", {
    headers: { cookie: cookieHeader() },
  });
  const csvText = await csv.text();
  ok(
    "export CSV 200 con patente",
    csv.status === 200 && csv.headers.get("content-type")?.includes("csv") && csvText.includes("EZE321"),
    String(csv.status),
  );

  // administración de pisos: crear piso con boxes en lote (solo admin)
  const floorName = `Piso E2E ${Date.now()}`;
  const floorCreate = await api("/api/floors", {
    method: "POST",
    body: JSON.stringify({ name: floorName, boxCount: 3, prefix: "TST", sortOrder: 999 }),
  });
  ok("crear piso + 3 boxes 201", floorCreate.status === 201, JSON.stringify(floorCreate.body));
  const floorId = floorCreate.body?.floor?.id;
  const tstBoxes = await dbRows(
    `SELECT id, number FROM parking_boxes WHERE floor_id = $1 ORDER BY number`,
    [floorId],
  );
  ok("boxes TST-01..03 generados", tstBoxes.length === 3 && tstBoxes[0].number === "TST-01", JSON.stringify(tstBoxes));

  const floorDup = await api("/api/floors", {
    method: "POST",
    body: JSON.stringify({ name: floorName, boxCount: 0 }),
  });
  ok("piso duplicado 409", floorDup.status === 409, String(floorDup.status));

  const floorRename = await api("/api/floors", {
    method: "PATCH",
    body: JSON.stringify({ id: floorId, name: `Piso E2E renombrado ${Date.now()}` }),
  });
  ok("renombrar piso 200", floorRename.status === 200, JSON.stringify(floorRename.body));

  // toggle de servicio sobre un box del nuevo piso
  const tstBox = tstBoxes[0];
  const tglOff = await api("/api/boxes/toggle", {
    method: "POST",
    body: JSON.stringify({ boxId: tstBox.id, serviceEnabled: false }),
  });
  ok("deshabilitar box 200", tglOff.status === 200 && tglOff.body.isServiceEnabled === false, JSON.stringify(tglOff.body));
  const stOff = await dbRows(`SELECT status FROM box_status WHERE id = $1`, [tstBox.id]);
  ok("box fuera de servicio en vista", stOff[0]?.status === "out_of_service", JSON.stringify(stOff));
  await api("/api/boxes/toggle", { method: "POST", body: JSON.stringify({ boxId: tstBox.id, serviceEnabled: true }) });

  // baja de box: desaparece de box_status
  const boxOff = await api("/api/boxes", {
    method: "PATCH",
    body: JSON.stringify({ id: tstBox.id, isActive: false }),
  });
  ok("baja de box 200", boxOff.status === 200 && boxOff.body.box.is_active === false, JSON.stringify(boxOff.body));
  const stGone = await dbRows(`SELECT id FROM box_status WHERE id = $1`, [tstBox.id]);
  ok("box de baja fuera de la vista", stGone.length === 0, JSON.stringify(stGone));

  console.log(failures === 0 ? "\nE2E OK" : `\n${failures} FALLARON`);
} finally {
  // limpieza
  try {
    await dbRows(`DELETE FROM sync_outbox WHERE entity_type = 'parking_session' AND entity_id IN (SELECT id::text FROM parking_sessions WHERE entry_notes = 'e2e' OR exit_notes = 'e2e')`, []);
    await dbRows(`DELETE FROM payments WHERE session_id IN (SELECT id FROM parking_sessions WHERE entry_notes = 'e2e' OR exit_notes = 'e2e')`, []);
    await dbRows(`DELETE FROM tariff_applications WHERE session_id IN (SELECT id FROM parking_sessions WHERE entry_notes = 'e2e' OR exit_notes = 'e2e')`, []);
    await dbRows(`DELETE FROM parking_sessions WHERE entry_notes = 'e2e' OR exit_notes = 'e2e'`, []);
    await dbRows(`DELETE FROM vehicles WHERE plate = 'EZE321'`, []);
    await dbRows(`DELETE FROM parking_boxes WHERE floor_id IN (SELECT id FROM parking_floors WHERE name LIKE 'Piso E2E%')`, []);
    await dbRows(`DELETE FROM parking_floors WHERE name LIKE 'Piso E2E%'`, []);
  } catch (e) {
    console.error("cleanup:", e.message);
  }
}
process.exitCode = failures === 0 ? 0 : 1;
