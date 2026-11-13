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

  // ===== C3: administración de usuarios (el admin crea empleados desde la UI) =====
  const newEmp = await api("/api/users", {
    method: "POST",
    body: JSON.stringify({
      email: "empleado-e2e@parking.local",
      fullName: "Empleado E2E",
      role: "employee",
      password: "Empleado2026!",
    }),
  });
  ok("alta de usuario 201", newEmp.status === 201 && newEmp.body.user?.id, JSON.stringify(newEmp.body));
  if (newEmp.status !== 201 || !newEmp.body.user?.id) {
    console.log(failures === 0 ? "\nE2E OK" : `\n${failures} FALLARON`);
    process.exitCode = 1;
    process.exit(1);
  }

  const dupUser = await api("/api/users", {
    method: "POST",
    body: JSON.stringify({
      email: "empleado-e2e@parking.local",
      fullName: "Duplicado",
      role: "employee",
      password: "Empleado2026!",
    }),
  });
  ok("email duplicado 409", dupUser.status === 409, JSON.stringify(dupUser.body));

  const usersList = await api("/api/users");
  ok(
    "listado incluye el nuevo",
    usersList.status === 200 && usersList.body.users?.some((u) => u.email === "empleado-e2e@parking.local"),
    JSON.stringify(usersList.body?.users?.length),
  );

  // login del empleado recién creado
  const empLogin = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "empleado-e2e@parking.local", password: "Empleado2026!" }),
  });
  ok("empleado puede loguearse", empLogin.status === 200, JSON.stringify(empLogin.body));

  // volver a la sesión de admin (el login del empleado pisó la cookie del test)
  await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@parking.local", password: "Parking2026!" }),
  });

  // desactivar → ya no puede loguearse
  const empId = newEmp.body.user.id;
  const deact = await api(`/api/users/${empId}`, { method: "PATCH", body: JSON.stringify({ isActive: false }) });
  ok("desactivar usuario 200", deact.status === 200, JSON.stringify(deact.body));
  const empLoginOff = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "empleado-e2e@parking.local", password: "Empleado2026!" }),
  });
  ok("usuario inactivo no loguea", empLoginOff.status === 401, JSON.stringify(empLoginOff.body));

  // reset de contraseña
  const resetPw = await api(`/api/users/${empId}`, { method: "PATCH", body: JSON.stringify({ password: "Nueva2026!" }) });
  ok("reset de contraseña 200", resetPw.status === 200, JSON.stringify(resetPw.body));

  // último admin: no se puede desactivar
  const adminRow = (await dbRows(`SELECT id FROM profiles WHERE role = 'admin' AND is_active ORDER BY created_at LIMIT 1`))[0];
  const lastAdmin = await api(`/api/users/${adminRow.id}`, { method: "PATCH", body: JSON.stringify({ isActive: false }) });
  ok("no desactiva al último admin", lastAdmin.status === 400, JSON.stringify(lastAdmin.body));

  // ===== D1: vehículos (listado + tipos) =====
  const vSearch = await api("/api/vehicles?q=EZE321");
  ok(
    "listado por patente",
    vSearch.status === 200 && vSearch.body.vehicles?.some((v) => v.plate === "EZE321"),
    JSON.stringify(vSearch.body?.vehicles?.length),
  );
  // EZE321 se crea en el flujo de ingreso de este mismo test (con estadía ya cerrada)
  const vRow = vSearch.body.vehicles?.find((v) => v.plate === "EZE321");
  ok("contador de estadías", vRow && vRow.sessions_count >= 1, JSON.stringify(vRow?.sessions_count));

  const newType = await api("/api/vehicle-types", {
    method: "POST",
    body: JSON.stringify({ code: "CAMIONETA", name: "Camioneta", sortOrder: 9 }),
  });
  ok("alta de tipo 201", newType.status === 201 && newType.body.type?.id, JSON.stringify(newType.body));
  const dupType = await api("/api/vehicle-types", {
    method: "POST",
    body: JSON.stringify({ code: "CAMIONETA", name: "Camioneta", sortOrder: 9 }),
  });
  ok("tipo duplicado 409", dupType.status === 409, JSON.stringify(dupType.body));
  // el tipo recién creado no tiene vehículos → se puede desactivar
  const deactType = await api("/api/vehicle-types", {
    method: "PATCH",
    body: JSON.stringify({ id: newType.body.type.id, isActive: false }),
  });
  ok("desactivar tipo sin uso 200", deactType.status === 200 && deactType.body.type.is_active === false, JSON.stringify(deactType.body));
  // un tipo en uso no se puede desactivar (AUTO tiene vehículos)
  const autoType = (await dbRows(`SELECT id FROM vehicle_types WHERE code = 'AUTO'`))[0];
  const deactUsed = await api("/api/vehicle-types", {
    method: "PATCH",
    body: JSON.stringify({ id: autoType.id, isActive: false }),
  });
  ok("tipo en uso no se desactiva", deactUsed.status === 400, JSON.stringify(deactUsed.body));

  // ===== E: tarifas (productos, especiales, medios de pago) =====
  const autoId2 = autoType.id;
  const newTariff = await api("/api/tariffs", {
    method: "POST",
    body: JSON.stringify({
      code: "E2E",
      name: "Tarifa E2E",
      vehicleTypeId: autoId2,
      durationMinutes: 60,
      durationMode: "flat",
      amountCents: 48000,
    }),
  });
  ok("alta de tarifa 201", newTariff.status === 201 && newTariff.body.id, JSON.stringify(newTariff.body));
  const dupTariff = await api("/api/tariffs", {
    method: "POST",
    body: JSON.stringify({
      code: "E2E",
      name: "Tarifa E2E dup",
      vehicleTypeId: autoId2,
      durationMinutes: 30,
      amountCents: 1000,
    }),
  });
  ok("tarifa código duplicado 409", dupTariff.status === 409, JSON.stringify(dupTariff.body));
  const tariffList = await api("/api/tariffs");
  ok(
    "listado de tarifas incluye la nueva",
    tariffList.status === 200 && tariffList.body.tariffs?.some((t) => t.code === "E2E"),
    JSON.stringify(tariffList.body?.tariffs?.length),
  );
  const updTariff = await api("/api/tariffs", {
    method: "PATCH",
    body: JSON.stringify({ id: newTariff.body.id, amountCents: 50000 }),
  });
  ok("editar monto de tarifa 200", updTariff.status === 200, JSON.stringify(updTariff.body));
  const deactTariff = await api("/api/tariffs", {
    method: "PATCH",
    body: JSON.stringify({ id: newTariff.body.id, isActive: false }),
  });
  ok("desactivar tarifa 200", deactTariff.status === 200, JSON.stringify(deactTariff.body));

  const now = new Date();
  const in1h = new Date(now.getTime() + 3600_000);
  const iso = (d) => d.toISOString();
  const badSpecial = await api("/api/special-tariffs", {
    method: "POST",
    body: JSON.stringify({
      name: "E2E inválido",
      startsAt: iso(in1h),
      endsAt: iso(now),
      adjustmentType: "percent",
      adjustmentValue: 50,
    }),
  });
  ok("período especial con fechas invertidas 400", badSpecial.status === 400, JSON.stringify(badSpecial.body));
  const badPct = await api("/api/special-tariffs", {
    method: "POST",
    body: JSON.stringify({
      name: "E2E inválido",
      startsAt: iso(now),
      endsAt: iso(in1h),
      adjustmentType: "percent",
      adjustmentValue: 150,
    }),
  });
  ok("porcentaje fuera de rango 400", badPct.status === 400, JSON.stringify(badPct.body));
  const newSpecial = await api("/api/special-tariffs", {
    method: "POST",
    body: JSON.stringify({
      name: "E2E feriado",
      startsAt: iso(now),
      endsAt: iso(in1h),
      adjustmentType: "percent",
      adjustmentValue: 50,
      priority: 10,
    }),
  });
  ok("crear período especial 201", newSpecial.status === 201 && newSpecial.body.id, JSON.stringify(newSpecial.body));
  const cancelSpecial = await api("/api/special-tariffs", {
    method: "PATCH",
    body: JSON.stringify({ id: newSpecial.body.id, status: "cancelled" }),
  });
  ok("cancelar período especial 200", cancelSpecial.status === 200, JSON.stringify(cancelSpecial.body));

  const newMethod = await api("/api/payment-methods", {
    method: "POST",
    body: JSON.stringify({ code: "E2E", name: "Medio E2E" }),
  });
  ok("alta de medio de pago 201", newMethod.status === 201 && newMethod.body.method?.id, JSON.stringify(newMethod.body));
  const dupMethod = await api("/api/payment-methods", {
    method: "POST",
    body: JSON.stringify({ code: "E2E", name: "Medio E2E" }),
  });
  ok("medio duplicado 409", dupMethod.status === 409, JSON.stringify(dupMethod.body));
  const renameMethod = await api("/api/payment-methods", {
    method: "PATCH",
    body: JSON.stringify({ id: newMethod.body.method.id, name: "Medio E2E renombrado" }),
  });
  ok("renombrar medio 200", renameMethod.status === 200 && renameMethod.body.method?.name === "Medio E2E renombrado", JSON.stringify(renameMethod.body));

  console.log(failures === 0 ? "\nE2E OK" : `\n${failures} FALLARON`);
} finally {
  // limpieza
  try {
    await dbRows(`DELETE FROM audit_logs WHERE entity_type = 'profile' AND entity_id IN (SELECT id::text FROM profiles WHERE email = 'empleado-e2e@parking.local')`, []);
    await dbRows(`DELETE FROM auth_credentials WHERE user_id IN (SELECT id FROM profiles WHERE email = 'empleado-e2e@parking.local')`, []);
    await dbRows(`DELETE FROM profiles WHERE email = 'empleado-e2e@parking.local'`, []);
    await dbRows(`DELETE FROM sync_outbox WHERE entity_type = 'parking_session' AND entity_id IN (SELECT id::text FROM parking_sessions WHERE entry_notes = 'e2e' OR exit_notes = 'e2e')`, []);
    await dbRows(`DELETE FROM payments WHERE session_id IN (SELECT id FROM parking_sessions WHERE entry_notes = 'e2e' OR exit_notes = 'e2e')`, []);
    await dbRows(`DELETE FROM tariff_applications WHERE session_id IN (SELECT id FROM parking_sessions WHERE entry_notes = 'e2e' OR exit_notes = 'e2e')`, []);
    await dbRows(`DELETE FROM parking_sessions WHERE entry_notes = 'e2e' OR exit_notes = 'e2e'`, []);
    await dbRows(`DELETE FROM vehicles WHERE plate = 'EZE321'`, []);
    await dbRows(`DELETE FROM parking_boxes WHERE floor_id IN (SELECT id FROM parking_floors WHERE name LIKE 'Piso E2E%')`, []);
    await dbRows(`DELETE FROM parking_floors WHERE name LIKE 'Piso E2E%'`, []);
    await dbRows(`DELETE FROM audit_logs WHERE entity_type = 'vehicle_type' AND entity_id IN (SELECT id::text FROM vehicle_types WHERE code = 'CAMIONETA')`, []);
    await dbRows(`DELETE FROM vehicle_types WHERE code = 'CAMIONETA'`, []);
    await dbRows(`DELETE FROM audit_logs WHERE entity_type = 'parking_tariff' AND entity_id IN (SELECT id::text FROM parking_tariffs WHERE code = 'E2E')`, []);
    await dbRows(`DELETE FROM parking_tariffs WHERE code = 'E2E'`, []);
    await dbRows(`DELETE FROM audit_logs WHERE entity_type = 'special_tariff_period' AND entity_id IN (SELECT id::text FROM special_tariff_periods WHERE name = 'E2E feriado')`, []);
    await dbRows(`DELETE FROM special_tariff_periods WHERE name = 'E2E feriado'`, []);
    await dbRows(`DELETE FROM audit_logs WHERE entity_type = 'payment_method' AND entity_id IN (SELECT id::text FROM payment_methods WHERE code = 'E2E')`, []);
    await dbRows(`DELETE FROM payment_methods WHERE code = 'E2E'`, []);
  } catch (e) {
    console.error("cleanup:", e.message);
  }
}
process.exitCode = failures === 0 ? 0 : 1;
