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
    // Mismo contrato que la app: DATABASE_SCHEMA selecciona el ambiente
    // (public = prod, dev = pruebas) vía search_path.
    const schema = process.env.DATABASE_SCHEMA;
    if (schema) {
      if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) throw new Error("DATABASE_SCHEMA inválido");
      await client.query(`SET search_path TO "${schema}", public`);
    }
    return (await client.query(sql, params)).rows;
  } finally {
    await client.end();
  }
};

// Usuario admin de prueba (CI no tiene seed de usuarios; también evita
// depender de una credencial estática en el repo).
const smokeEmail = `smoke-admin-${Date.now()}@test.local`;
const smokePassword = "smoke-" + crypto.randomUUID();
async function createSmokeAdmin() {
  const { hash } = await import("@node-rs/argon2");
  const pwHash = await hash(smokePassword);
  const rows = await dbRows(
    `INSERT INTO profiles (id, full_name, role, is_active, email)
     VALUES (gen_random_uuid(), 'Admin E2E', 'admin', true, $1) RETURNING id`,
    [smokeEmail],
  );
  await dbRows(`INSERT INTO auth_credentials (user_id, password_hash) VALUES ($1, $2)`, [
    rows[0].id,
    pwHash,
  ]);
}
async function deleteSmokeAdmin() {
  await dbRows(
    `DELETE FROM payments WHERE shift_id IN (SELECT id FROM cash_shifts WHERE opened_by IN (SELECT id FROM profiles WHERE email = $1))`,
    [smokeEmail],
  );
  await dbRows(
    `DELETE FROM cash_shifts WHERE opened_by IN (SELECT id FROM profiles WHERE email = $1)`,
    [smokeEmail],
  );
  await dbRows(
    `DELETE FROM audit_logs WHERE actor_id IN (SELECT id FROM profiles WHERE email = $1)`,
    [smokeEmail],
  );
  await dbRows(
    `DELETE FROM auth_credentials WHERE user_id IN (SELECT id FROM profiles WHERE email = $1)`,
    [smokeEmail],
  );
  await dbRows(`DELETE FROM profiles WHERE email = $1`, [smokeEmail]);
}

// Tarifas creadas por el test (incluye bloques sin código, que no se pueden
// filtrar por `code` en la limpieza).
const createdTariffIds = [];

try {
  // login
  await createSmokeAdmin();
  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: smokeEmail, password: smokePassword }),
  });
  ok("login 200", login.status === 200, JSON.stringify(login));

  // login: texto genérico (no todos los usuarios son empleados)
  const loginPage = await fetch(BASE + "/login");
  const loginHtml = await loginPage.text();
  ok(
    "login sin palabra empleado",
    loginPage.status === 200 &&
      loginHtml.includes("Ingresá con tu cuenta") &&
      !loginHtml.includes("cuenta de empleado"),
    `status=${loginPage.status}`,
  );

  // ingreso: selector visual de boxes (mapa clickeable) con filtro, sin <select>
  const ingresoRes = await fetch(BASE + "/operaciones/ingreso", {
    headers: { cookie: cookieHeader() },
  });
  const ingresoHtml = await ingresoRes.text();
  const avail = await dbRows(`SELECT count(*) n FROM box_status WHERE status = 'available'`);
  const boxOptions = (ingresoHtml.match(/(?<= )data-box-option(?=="true")/g) ?? []).length;
  ok(
    "ingreso: mapa de boxes clickeable con filtro",
    ingresoRes.status === 200 &&
      ingresoHtml.includes('id="box-filter"') &&
      !ingresoHtml.includes('<select id="box"') &&
      boxOptions === Number(avail[0].n),
    `options=${boxOptions} disponibles=${avail[0].n}`,
  );

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

  // mapa de boxes: muestra info ampliada del ocupado (patente, tipo, ticket)
  const mapaRes = await fetch(BASE + "/boxes/mapa", { headers: { cookie: cookieHeader() } });
  const mapaHtml = await mapaRes.text();
  const autoTypeName = await dbRows(`SELECT name FROM vehicle_types WHERE code = 'AUTO'`);
  ok(
    "mapa grande muestra patente y ticket del box ocupado",
    mapaRes.status === 200 &&
      mapaHtml.includes("data-box-tile") &&
      mapaHtml.includes("EZE321") &&
      mapaHtml.includes(`Ticket #${ticket}`) &&
      mapaHtml.includes(autoTypeName[0].name),
    `status=${mapaRes.status}`,
  );

  // patente: el servidor descarta espacios y signos (solo alfanumérico)
  const freeBox = await dbRows(
    `SELECT id FROM parking_boxes
      WHERE is_active
        AND id NOT IN (SELECT box_id FROM parking_sessions WHERE status = 'open')
      ORDER BY number LIMIT 1`,
  );
  const plateOpen = await api("/api/sessions/open", {
    method: "POST",
    body: JSON.stringify({
      sessionId: crypto.randomUUID(),
      plate: "ab-12 34",
      vehicleTypeId: vt,
      boxId: freeBox[0].id,
      notes: "e2e",
    }),
  });
  const normPlate = await dbRows(`SELECT plate FROM vehicles WHERE plate = 'AB1234'`);
  ok(
    "patente descarta espacios y signos",
    plateOpen.status === 200 && normPlate.length === 1,
    JSON.stringify({ status: plateOpen.status, body: plateOpen.body }),
  );

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

  // mover vehículo de box: reingresar la misma patente en otro box no crea una
  // segunda estadía; la API devuelve dónde está y el front ofrece moverla.
  const moveBoxes = await dbRows(
    `SELECT b.id, b.number
       FROM parking_boxes b
       JOIN parking_floors f ON f.id = b.floor_id AND f.is_active
      WHERE b.is_active AND b.is_service_enabled
        AND b.id NOT IN (SELECT box_id FROM parking_sessions WHERE status = 'open')
      ORDER BY b.number
      LIMIT 2`,
  );
  const [movA, movB] = moveBoxes;
  const movOpen = await api("/api/sessions/open", {
    method: "POST",
    body: JSON.stringify({ sessionId: crypto.randomUUID(), plate: "MOV123", vehicleTypeId: vt, boxId: movA.id, notes: "e2e" }),
  });
  ok("mover: ingreso inicial en box A", movOpen.status === 200 && movOpen.body.ticketNumber > 0, JSON.stringify(movOpen.body));

  const movConflict = await api("/api/sessions/open", {
    method: "POST",
    body: JSON.stringify({ sessionId: crypto.randomUUID(), plate: "mov-123", vehicleTypeId: vt, boxId: movB.id, notes: "e2e" }),
  });
  ok(
    "mover: misma patente en otro box pide confirmación (409)",
    movConflict.status === 409 &&
      movConflict.body?.code === "VEHICLE_PARKED" &&
      movConflict.body?.sameBox === false &&
      movConflict.body?.session?.boxNumber === movA.number &&
      movConflict.body?.session?.ticketNumber === movOpen.body.ticketNumber,
    JSON.stringify(movConflict.body),
  );

  const movSessionId = movConflict.body?.session?.id;
  const mov = await api("/api/sessions/move", {
    method: "POST",
    body: JSON.stringify({ sessionId: movSessionId, boxId: movB.id }),
  });
  ok(
    "mover: conserva el ticket y cambia de box",
    mov.status === 200 &&
      mov.body.ticketNumber === movOpen.body.ticketNumber &&
      mov.body.boxNumber === movB.number,
    JSON.stringify(mov.body),
  );

  const movAgain = await api("/api/sessions/open", {
    method: "POST",
    body: JSON.stringify({ sessionId: crypto.randomUUID(), plate: "MOV123", vehicleTypeId: vt, boxId: movB.id, notes: "e2e" }),
  });
  ok(
    "mover: la estadía quedó en el box destino",
    movAgain.status === 409 && movAgain.body?.code === "VEHICLE_PARKED" && movAgain.body?.sameBox === true,
    JSON.stringify(movAgain.body),
  );

  const movOriginFree = await dbRows(
    `SELECT 1 FROM parking_sessions WHERE box_id = $1 AND status = 'open' LIMIT 1`,
    [movA.id],
  );
  ok("mover: el box de origen queda libre", movOriginFree.length === 0);

  // el recíproco: mover la misma estadía al box que ya está ocupado se rechaza
  const occupied = await dbRows(
    `SELECT box_id FROM parking_sessions WHERE status = 'open' AND id <> $1 LIMIT 1`,
    [movSessionId],
  );
  const movBusy = await api("/api/sessions/move", {
    method: "POST",
    body: JSON.stringify({ sessionId: movSessionId, boxId: occupied[0].box_id }),
  });
  ok(
    "mover: destino ocupado rechazado",
    movBusy.status === 409 && typeof movBusy.body?.error === "string",
    JSON.stringify(movBusy.body),
  );

  const movObx = await dbRows(
    `SELECT op, payload FROM sync_outbox WHERE entity_type = 'parking_session' AND entity_id = $1 ORDER BY created_at`,
    [movSessionId],
  );
  ok(
    "mover: outbox update con el box nuevo",
    movObx.some((r) => r.op === "update" && r.payload?.box_id === movB.id),
    JSON.stringify(movObx.map((r) => ({ op: r.op, box_id: r.payload?.box_id }))),
  );
  const movAudit = await dbRows(
    `SELECT before, after FROM audit_logs WHERE action = 'session.move' AND entity_id = $1`,
    [movSessionId],
  );
  ok(
    "mover: auditoría session.move con origen y destino",
    movAudit.length === 1 &&
      movAudit[0].before?.box_id === movA.id &&
      movAudit[0].after?.box_id === movB.id,
    JSON.stringify(movAudit),
  );

  await api("/api/sessions/close", {
    method: "POST",
    body: JSON.stringify({ sessionId: movSessionId, methodId: method, notes: "e2e" }),
  });

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

  // ===== edición desde el mapa (modo edición + panel lateral) =====
  const mapaAdmin = await fetch(BASE + "/boxes/mapa", { headers: { cookie: cookieHeader() } });
  const mapaAdminHtml = await mapaAdmin.text();
  ok(
    "mapa: boxes editables para admin",
    mapaAdmin.status === 200 && mapaAdminHtml.includes("data-box-editable"),
    `status=${mapaAdmin.status}`,
  );

  const tstBox2 = tstBoxes[1];
  const renamed = await api("/api/boxes", {
    method: "PATCH",
    body: JSON.stringify({ id: tstBox2.id, number: "TST-99", sector: "B" }),
  });
  ok(
    "mapa: renombrar box 200",
    renamed.status === 200 && renamed.body.box?.number === "TST-99",
    JSON.stringify(renamed.body),
  );

  const admRes = await fetch(BASE + "/boxes/administracion", {
    headers: { cookie: cookieHeader() },
  });
  const admHtml = await admRes.text();
  ok(
    "estructura: chips linkean al mapa",
    admRes.status === 200 &&
      admHtml.includes("data-box-map-link") &&
      admHtml.includes("/boxes/mapa?box="),
    `status=${admRes.status}`,
  );

  const deepRes = await fetch(BASE + "/boxes/mapa?box=" + tstBox2.id, {
    headers: { cookie: cookieHeader() },
  });
  const deepHtml = await deepRes.text();
  ok(
    "mapa: deep link abre el panel del box",
    deepRes.status === 200 &&
      deepHtml.includes("data-box-edit-panel") &&
      deepHtml.includes('value="TST-99"'),
    `status=${deepRes.status}`,
  );

  const reactivate = await api("/api/boxes", {
    method: "PATCH",
    body: JSON.stringify({ id: tstBox.id, isActive: true }),
  });
  const stBack = await dbRows(`SELECT status FROM box_status WHERE id = $1`, [tstBox.id]);
  ok(
    "mapa: reactivar box vuelve a la vista",
    reactivate.status === 200 && reactivate.body.box?.is_active === true && stBack.length === 1,
    JSON.stringify({ status: reactivate.status, back: stBack }),
  );

  // Un box con estadía abierta (AB1234) no se da de baja ni se renumera.
  const busyDeactivate = await api("/api/boxes", {
    method: "PATCH",
    body: JSON.stringify({ id: freeBox[0].id, isActive: false }),
  });
  const busyRenumber = await api("/api/boxes", {
    method: "PATCH",
    body: JSON.stringify({ id: freeBox[0].id, number: "ZZ-99" }),
  });
  ok(
    "mapa: box ocupado no se da de baja ni se renumera",
    busyDeactivate.status === 400 && busyRenumber.status === 400,
    `baja=${busyDeactivate.status} ren=${busyRenumber.status}`,
  );

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

  const empMapaRes = await fetch(BASE + "/boxes/mapa", { headers: { cookie: cookieHeader() } });
  const empMapaHtml = await empMapaRes.text();
  ok(
    "mapa: empleado sin edición",
    empMapaRes.status === 200 && !empMapaHtml.includes("data-box-editable"),
    `status=${empMapaRes.status}`,
  );

  // El menú se filtra por rol: el empleado no ve secciones que no puede abrir
  // (antes las veía y terminaba en "Acceso restringido").
  const empHomeRes = await fetch(BASE + "/", { headers: { cookie: cookieHeader() } });
  const empHomeHtml = await empHomeRes.text();
  const empSees = (href) => empHomeHtml.includes(`href="${href}"`);
  ok(
    "sidebar: empleado no ve secciones restringidas",
    empHomeRes.status === 200 &&
      !empSees("/administracion/usuarios") &&
      !empSees("/administracion/auditoria") &&
      !empSees("/tarifas/productos") &&
      !empSees("/boxes/administracion") &&
      !empSees("/reportes") &&
      !empSees("/administracion/turnos") &&
      !empSees("/vehiculos") &&
      empSees("/operaciones/ingreso") &&
      empSees("/boxes/mapa"),
    `status=${empHomeRes.status}`,
  );

  // Permiso shift.manage: el empleado no gestiona turnos de caja.
  const empTurnosRes = await fetch(BASE + "/administracion/turnos", {
    headers: { cookie: cookieHeader() },
  });
  const empTurnosHtml = await empTurnosRes.text();
  const empShift = await api("/api/shifts/open", { method: "POST", body: JSON.stringify({}) });
  ok(
    "turnos: empleado bloqueado (página + endpoint)",
    empTurnosRes.status === 200 &&
      empTurnosHtml.includes("Acceso restringido") &&
      empShift.status === 403,
    `page=${empTurnosRes.status} api=${empShift.status}`,
  );

  // session.read_own: el empleado solo ve las estadías que él abrió.
  // AB1234 sigue abierta por el admin y EZE321 figura cerrada en el historial.
  const empEstRes = await fetch(BASE + "/operaciones/estadias", {
    headers: { cookie: cookieHeader() },
  });
  const empEstHtml = await empEstRes.text();
  const empHistRes = await fetch(BASE + "/operaciones/historial", {
    headers: { cookie: cookieHeader() },
  });
  const empHistHtml = await empHistRes.text();
  ok(
    "read_own: empleado no ve estadías ajenas",
    empEstHtml.includes("No hay estadías activas") &&
      !empEstHtml.includes("AB1234") &&
      empHistHtml.includes("Tus estadías") &&
      !empHistHtml.includes("EZE321"),
    `est=${empEstRes.status} hist=${empHistRes.status}`,
  );

  // volver a la sesión de admin (el login del empleado pisó la cookie del test)
  await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: smokeEmail, password: smokePassword }),
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

  // último admin: no se puede desactivar al único admin activo.
  // Se baja al resto de los admins por SQL (temporal), se intenta desactivar
  // al admin de la sesión y se reactivan.
  const meRow = (await dbRows(`SELECT id FROM profiles WHERE email = $1`, [smokeEmail]))[0];
  await dbRows(`UPDATE profiles SET is_active = false WHERE role = 'admin' AND email <> $1`, [smokeEmail]);
  const lastAdmin = await api(`/api/users/${meRow.id}`, { method: "PATCH", body: JSON.stringify({ isActive: false }) });
  ok("no desactiva al último admin", lastAdmin.status === 400, JSON.stringify(lastAdmin.body));
  await dbRows(`UPDATE profiles SET is_active = true WHERE role = 'admin' AND email <> $1`, [smokeEmail]);

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

  // ===== E2: tarifario rediseñado (bloques por vehículo + vigencia) =====
  const bikeType = (await dbRows(`SELECT id FROM vehicle_types WHERE code = 'BICICLETA'`))[0];
  const plainBlock = await api("/api/tariffs", {
    method: "POST",
    body: JSON.stringify({ vehicleTypeId: bikeType.id, durationMinutes: 30, amountCents: 12300 }),
  });
  ok("alta de bloque sin código ni nombre 201", plainBlock.status === 201 && plainBlock.body.id, JSON.stringify(plainBlock.body));
  createdTariffIds.push(plainBlock.body.id);
  const plainRow = (await (await api("/api/tariffs")).body.tariffs).find((t) => t.id === plainBlock.body.id);
  ok(
    "bloque: nombre autogenerado, sin código y vigencia fija",
    plainRow?.name === "Bicicleta 30 min" && plainRow?.code === null && plainRow?.valid_to === null,
    JSON.stringify(plainRow),
  );

  const nowDate = new Date();
  const tempFrom = new Date(nowDate.getTime() - 3600_000);
  const tempTo = new Date(nowDate.getTime() + 3600_000);
  const tempBlock = await api("/api/tariffs", {
    method: "POST",
    body: JSON.stringify({
      vehicleTypeId: bikeType.id,
      durationMinutes: 60,
      amountCents: 99900,
      validFrom: tempFrom.toISOString(),
      validTo: tempTo.toISOString(),
    }),
  });
  ok("alta de bloque temporal 201", tempBlock.status === 201 && tempBlock.body.id, JSON.stringify(tempBlock.body));
  createdTariffIds.push(tempBlock.body.id);
  const tempRow = (await (await api("/api/tariffs")).body.tariffs).find((t) => t.id === tempBlock.body.id);
  ok(
    "bloque temporal devuelve su vigencia",
    Boolean(tempRow?.valid_to) && tempRow?.valid_to_local,
    JSON.stringify(tempRow),
  );

  const badValidity = await api("/api/tariffs", {
    method: "PATCH",
    body: JSON.stringify({
      id: tempBlock.body.id,
      validFrom: tempTo.toISOString(),
      validTo: tempFrom.toISOString(),
    }),
  });
  ok("vigencia invertida 400", badValidity.status === 400, JSON.stringify(badValidity.body));

  const backToFixed = await api("/api/tariffs", {
    method: "PATCH",
    body: JSON.stringify({ id: tempBlock.body.id, validFrom: tempFrom.toISOString(), validTo: null }),
  });
  const fixedRow = (await (await api("/api/tariffs")).body.tariffs).find((t) => t.id === tempBlock.body.id);
  ok(
    "volver a vigencia fija 200",
    backToFixed.status === 200 && fixedRow?.valid_to === null,
    JSON.stringify({ status: backToFixed.status, valid_to: fixedRow?.valid_to }),
  );

  // Precedencia en el cobro: temporal vigente > fija, y al vencer vuelve la fija.
  const autoTariffId = autoId2;
  const calc = async (minutes) =>
    Number((await dbRows(`SELECT (calc_fee_breakdown($1::uuid, $2)->>'total_cents')::bigint AS c`, [autoTariffId, minutes]))[0].c);
  const fixedCents = await calc(60);
  const tempAuto = await dbRows(
    `INSERT INTO parking_tariffs (name, vehicle_type_id, duration_minutes, duration_mode, amount_cents, valid_from, valid_to)
     VALUES ('E2E temporal AUTO', $1, 60, 'flat', 999900, now() - interval '1 hour', now() + interval '1 hour')
     RETURNING id`,
    [autoTariffId],
  );
  createdTariffIds.push(tempAuto[0].id);
  ok("cálculo: temporal vigente pisa a la fija", (await calc(60)) === 999900, `fixed=${fixedCents}`);
  await dbRows(`UPDATE parking_tariffs SET valid_to = now() - interval '1 minute' WHERE id = $1`, [tempAuto[0].id]);
  ok("cálculo: temporal vencida vuelve a la fija", (await calc(60)) === fixedCents);
  const futureOnly = await dbRows(
    `INSERT INTO parking_tariffs (name, vehicle_type_id, duration_minutes, duration_mode, amount_cents, valid_from)
     VALUES ('E2E futura AUTO', $1, 60, 'flat', 777700, now() + interval '1 day')
     RETURNING id`,
    [autoTariffId],
  );
  createdTariffIds.push(futureOnly[0].id);
  ok("cálculo: tarifa futura no se aplica antes de tiempo", (await calc(60)) === fixedCents);

  const admTariffsHtml = await (
    await fetch(BASE + "/tarifas/productos", { headers: { cookie: cookieHeader() } })
  ).text();
  ok(
    "UI tarifas: agrupada por vehículo y sin código",
    admTariffsHtml.includes("Tarifas por vehículo") &&
      admTariffsHtml.includes("Bicicleta") &&
      admTariffsHtml.includes("Agregar bloque") &&
      !admTariffsHtml.includes("Código"),
    `len=${admTariffsHtml.length}`,
  );

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

  // ===== D6/G/H: sincronización, reportes, auditoría =====
  const syncStatus = await api("/api/sync/status");
  ok("estado de sincronización 200", syncStatus.status === 200 && Array.isArray(syncStatus.body.byStatus) && Array.isArray(syncStatus.body.recentRuns), JSON.stringify(syncStatus.body?.byStatus));
  const reportSummary = await api("/api/reports/summary?days=30");
  ok(
    "resumen de reportes 200",
    reportSummary.status === 200 && Array.isArray(reportSummary.body.daily) && Array.isArray(reportSummary.body.byMethod),
    JSON.stringify(reportSummary.body?.totals),
  );
  const auditList = await api("/api/audit-logs?limit=5");
  ok(
    "auditoría lista eventos",
    auditList.status === 200 && Array.isArray(auditList.body.logs) && auditList.body.logs.length > 0,
    JSON.stringify(auditList.body?.logs?.length),
  );
  const auditFiltered = await api("/api/audit-logs?action=payment_method.create&limit=5");
  ok(
    "auditoría filtra por acción",
    auditFiltered.status === 200 && auditFiltered.body.logs.every((l) => l.action.includes("payment_method")),
    JSON.stringify(auditFiltered.body?.logs?.length),
  );

  // ===== F: cola de impresión =====
  const closedSession = (
    await dbRows(`SELECT id::text AS id FROM parking_sessions WHERE (entry_notes = 'e2e' OR exit_notes = 'e2e') AND status = 'closed' LIMIT 1`)
  )[0];
  const newJob = await api("/api/print-jobs", {
    method: "POST",
    body: JSON.stringify({ sessionId: closedSession.id, kind: "reprint" }),
  });
  ok("crear job de reimpresión 201", newJob.status === 201 && newJob.body.id, JSON.stringify(newJob.body));
  const pendingJobs = await api("/api/print-jobs?status=pending");
  ok(
    "cola pendiente incluye el job",
    pendingJobs.status === 200 && pendingJobs.body.jobs?.some((j) => j.id === newJob.body.id),
    JSON.stringify(pendingJobs.body?.jobs?.length),
  );
  const ticketPayload = await api(`/api/sessions/${closedSession.id}`);
  ok(
    "payload de ticket 200",
    ticketPayload.status === 200 && ticketPayload.body.session?.ticket_number && ticketPayload.body.session?.tariff_snapshot,
    JSON.stringify(ticketPayload.body?.session?.ticket_number),
  );
  const markPrinted = await api("/api/print-jobs", {
    method: "PATCH",
    body: JSON.stringify({ id: newJob.body.id, status: "printed" }),
  });
  ok("marcar impreso 200", markPrinted.status === 200, JSON.stringify(markPrinted.body));
  const badJob = await api("/api/print-jobs", {
    method: "PATCH",
    body: JSON.stringify({ id: "00000000-0000-0000-0000-000000000000", status: "printed" }),
  });
  ok("job inexistente 404", badJob.status === 404, JSON.stringify(badJob.body));
  const csvRes = await fetch(BASE + "/api/reports/export?p=30", { headers: { cookie: cookieHeader() } });
  const reportCsv = await csvRes.text();
  ok(
    "export CSV de reportes",
    csvRes.status === 200 && reportCsv.startsWith("dia,cobros,recaudado_cents"),
    reportCsv.split("\n")[1] ?? "",
  );

  // ===== Dashboard: mini mapa de boxes =====
  const dashRes = await fetch(BASE + "/", { headers: { cookie: cookieHeader() } });
  const dashHtml = await dashRes.text();
  const gridIdx = dashHtml.indexOf('data-box-grid-mini');
  const activeBoxes = await dbRows(
    `SELECT count(*) n FROM parking_boxes WHERE is_active`,
    [],
  );
  // El HTML trae además el payload RSC (que repite los strings escapados);
  // contar solo celdas de markup: 'data-box-cell' rodeado de espacios, sin
  // comillas alrededor (en flight aparece como "data-box-cell").
  const cells = gridIdx >= 0 ? (dashHtml.match(/(?<= )data-box-cell(?=="true")/g) ?? []).length : 0;
  ok(
    "dashboard: mini mapa de boxes con cuadritos",
    gridIdx >= 0 && cells === Number(activeBoxes[0].n),
    `cells=${cells} activos=${activeBoxes[0].n}`,
  );

  // Sidebar: ítem de la sección actual marcado (aria-current="page").
  // React puede reordenar atributos: verificar dentro del mismo <a>.
  const repRes = await fetch(BASE + "/reportes", { headers: { cookie: cookieHeader() } });
  const repHtml = await repRes.text();
  const anchors = (repHtml.match(/<a [^>]+>/g) ?? []).filter((a) =>
    a.includes('aria-current="page"'),
  );
  ok(
    "sidebar: seccion actual marcada en reportes",
    repRes.status === 200 &&
      anchors.length === 1 &&
      anchors[0].includes('href="/reportes"'),
    `current=${anchors.length}`,
  );

  // Contraparte: el admin sí ve todo el menú y todas las estadías.
  ok(
    "sidebar: admin si ve secciones restringidas",
    dashHtml.includes('href="/reportes"') &&
      dashHtml.includes('href="/administracion/usuarios"') &&
      dashHtml.includes('href="/administracion/auditoria"') &&
      dashHtml.includes('href="/vehiculos"'),
    "faltan secciones para admin",
  );

  const admEstRes = await fetch(BASE + "/operaciones/estadias", {
    headers: { cookie: cookieHeader() },
  });
  const admEstHtml = await admEstRes.text();
  const admHistRes = await fetch(BASE + "/operaciones/historial", {
    headers: { cookie: cookieHeader() },
  });
  const admHistHtml = await admHistRes.text();
  ok(
    "read_own: admin ve todas las estadías",
    admEstHtml.includes("AB1234") &&
      admHistHtml.includes("Todas las estadías") &&
      admHistHtml.includes("EZE321"),
    `est=${admEstRes.status} hist=${admHistRes.status}`,
  );

  console.log(failures === 0 ? "\nE2E OK" : `\n${failures} FALLARON`);
} finally {
  // limpieza
  try {
    await dbRows(`DELETE FROM audit_logs WHERE entity_type = 'profile' AND entity_id IN (SELECT id::text FROM profiles WHERE email = 'empleado-e2e@parking.local')`, []);
    await dbRows(`DELETE FROM auth_credentials WHERE user_id IN (SELECT id FROM profiles WHERE email = 'empleado-e2e@parking.local')`, []);
    await dbRows(`DELETE FROM profiles WHERE email = 'empleado-e2e@parking.local'`, []);
    await dbRows(`DELETE FROM sync_outbox WHERE entity_type = 'parking_session' AND entity_id IN (SELECT id::text FROM parking_sessions WHERE entry_notes = 'e2e' OR exit_notes = 'e2e')`, []);
    await dbRows(`DELETE FROM print_jobs WHERE session_id IN (SELECT id FROM parking_sessions WHERE entry_notes = 'e2e' OR exit_notes = 'e2e')`, []);
    await dbRows(`DELETE FROM audit_logs WHERE action = 'ticket.reprint' AND entity_id IN (SELECT id::text FROM parking_sessions WHERE entry_notes = 'e2e' OR exit_notes = 'e2e')`, []);
    await dbRows(`DELETE FROM payments WHERE session_id IN (SELECT id FROM parking_sessions WHERE entry_notes = 'e2e' OR exit_notes = 'e2e')`, []);
    await dbRows(`DELETE FROM tariff_applications WHERE session_id IN (SELECT id FROM parking_sessions WHERE entry_notes = 'e2e' OR exit_notes = 'e2e')`, []);
    await dbRows(`DELETE FROM parking_sessions WHERE entry_notes = 'e2e' OR exit_notes = 'e2e'`, []);
    await dbRows(`DELETE FROM vehicles WHERE plate = 'EZE321'`, []);
    await dbRows(`DELETE FROM vehicles WHERE plate = 'AB1234'`, []);
    await dbRows(`DELETE FROM vehicles WHERE plate = 'MOV123'`, []);
    await dbRows(`DELETE FROM parking_boxes WHERE floor_id IN (SELECT id FROM parking_floors WHERE name LIKE 'Piso E2E%')`, []);
    await dbRows(`DELETE FROM parking_floors WHERE name LIKE 'Piso E2E%'`, []);
    await dbRows(`DELETE FROM audit_logs WHERE entity_type = 'vehicle_type' AND entity_id IN (SELECT id::text FROM vehicle_types WHERE code = 'CAMIONETA')`, []);
    await dbRows(`DELETE FROM vehicle_types WHERE code = 'CAMIONETA'`, []);
    await dbRows(`DELETE FROM audit_logs WHERE entity_type = 'parking_tariff' AND entity_id IN (SELECT id::text FROM parking_tariffs WHERE id = ANY($1::uuid[]))`, [createdTariffIds]);
    await dbRows(`DELETE FROM parking_tariffs WHERE id = ANY($1::uuid[])`, [createdTariffIds]);
    await dbRows(`DELETE FROM audit_logs WHERE entity_type = 'parking_tariff' AND entity_id IN (SELECT id::text FROM parking_tariffs WHERE code = 'E2E')`, []);
    await dbRows(`DELETE FROM parking_tariffs WHERE code = 'E2E'`, []);
    await dbRows(`DELETE FROM audit_logs WHERE entity_type = 'special_tariff_period' AND entity_id IN (SELECT id::text FROM special_tariff_periods WHERE name = 'E2E feriado')`, []);
    await dbRows(`DELETE FROM special_tariff_periods WHERE name = 'E2E feriado'`, []);
    await dbRows(`DELETE FROM audit_logs WHERE entity_type = 'payment_method' AND entity_id IN (SELECT id::text FROM payment_methods WHERE code = 'E2E')`, []);
    await dbRows(`DELETE FROM payment_methods WHERE code = 'E2E'`, []);
    await deleteSmokeAdmin();
  } catch (e) {
    console.error("cleanup:", e.message);
  }
}
process.exitCode = failures === 0 ? 0 : 1;
