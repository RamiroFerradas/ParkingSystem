# Configurador de permisos por usuario (nov 2026)

Objetivo: que el administrador habilite o niegue, por usuario, las secciones del sidebar, con efecto real en el menú, la página y la API (no sólo cosmético).
Rama: `rebuild/next-16`. Entrega: commit + deploy cuando el usuario lo apruebe. Test runner: `scripts/test-e2e.mjs` (HTTP + DB) y `pnpm build`.

## Specs

- S1: "Quiero tener un configurador para que el administrador pueda habilitarle u ocultarle las secciones del sidebar a los diferentes usuarios" → en `/administracion/usuarios` cada usuario tiene un editor de accesos por sección.
- S2: Alcance decidido con el usuario: **acceso real por usuario**. Un permiso negado oculta la sección del menú, muestra "Acceso restringido" en la página y responde 403 en la API. No es ocultamiento cosmético.
- S3: Jerarquía de evaluación: excepción por usuario (`user_permissions`) → si no hay excepción, matriz de rol (`role_permissions`, incluido el wildcard `*` del admin). Una negación explícita gana sobre el wildcard.
- S4: Sin excepciones cargadas, el comportamiento es idéntico al actual (compatibilidad total).
- S5: Estados del editor por permiso: "Heredado del rol" (sin fila), "Permitido" y "Denegado". Volver a heredado borra la excepción.
- S6: Protecciones: nadie se quita a sí mismo `user.manage`; no se puede dejar al sistema sin ningún usuario activo con `user.manage` efectivo.
- S7: Toda escritura de excepciones queda en `audit_logs` con acción `user.permissions`.
- S8: Cobertura del sidebar: se agregan los permisos `session.open` y `session.close` para "Registrar ingreso" y "Registrar egreso", concedidos por defecto a los tres roles (sin cambio de comportamiento). Dashboard, Estadías activas e Historial no se gatean: dependen de la sesión y del alcance de lectura (`session.read_all`/`read_own`).
- S9: Las excepciones por usuario **no se cachean**: páginas y route handlers corren en instancias separadas del servidor y una caché local no se puede invalidar entre ellas; una revocación tiene que aplicar en el request siguiente. La matriz de roles sí mantiene su caché de 60 s (sólo cambia por migración).

## Tasks

- T1 · S1,S3,S4,S5 · Migración `012_user_permissions.sql`: tabla de excepciones + permisos `session.open`/`session.close` para admin, supervisor y empleado · done · aplicada a `dev` (no a `public`)
- T2 · S3,S4,S9 · `src/lib/auth/permissions.ts`: evaluación efectiva por usuario (excepción > rol), `PermissionSubject`, `roleHasPermission` y sin caché de excepciones · done · tsc + build OK
- T3 · S3 · Call sites: `hasPermission(user, perm)` y `permissionsFor(user)` en 34 archivos; el compilador garantiza que no queda ningún call site por rol · done · `tsc --noEmit` sin errores
- T4 · S8 · `nav-config.ts`: permisos en ingreso/egreso y `configurableSections()` como fuente única del editor y de la validación de la API · done · 12 permisos configurables
- T5 · S1,S5,S6,S7 · `GET`/`PUT /api/users/[id]/permissions` con validación de claves, reglas anti-lockout y auditoría · done · checks e2e verdes
- T6 · S1,S5 · Editor de accesos en `/administracion/usuarios` (botón "Accesos" por fila, panel agrupado por sección) · done · build OK
- T7 · S2,S4 · Checks e2e: RED antes de implementar (10 fallos), GREEN después · done · `E2E OK`, 10 checks nuevos
- T8 · S2 · Paridad menú→página: `/boxes/mapa` no verificaba `box.read` (el menú lo anunciaba); ahora exige el permiso, y el mapa compacto del dashboard no se renderiza sin `box.read` · done · check "denegado oculta el menú y bloquea la página" verde
- T9 · S6,S7 · Correcciones de la verificación independiente: `null` ("heredado") también dispara las reglas anti-lockout (antes sólo `allowed:false`); el conteo de supervivientes usa las excepciones reales y no sólo el rol; el chequeo se serializa con `pg_advisory_xact_lock` dentro de la transacción (antes era check-then-act y dos revokes concurrentes podían dejar cero administradores); la auditoría registra toda escritura, incluidas las vueltas a heredado, con `before` y `after` · done · 10/10 checks del probe acotado verdes

## Log

- L1: "Quiero tener un configurador para que el administrador pueda habilitarle u ocultarle las secciones del sidebar a los diferentes usuarios"
- Decisión (L1): se consultó el alcance. El usuario eligió "Acceso real por usuario": el configurador controla menú + página + API. Motivo técnico: ocultar un ítem no impide entrar por URL; la autorización ya vive en `hasPermission(rol, perm)` en ~25 puntos.
- Estado inicial relevado: `role_permissions (role, permission, allowed)` con wildcard `*` para admin; `permissionsFor(user.role)` filtra el sidebar; `hasPermission(user.role, perm)` en 20+ páginas y APIs; `/administracion/usuarios` ya existía con su API.
- Evidencia RED: 10 checks nuevos fallaron contra el build previo (`null` en los GET, menú sin cambios, `n=0` de auditoría).
- Hallazgo: la primera versión cacheaba las excepciones 30 s en memoria. El e2e mostró que el grant aplicaba en la API (route handler) pero NO en la página ni el sidebar: son instancias distintas del servidor, así que `invalidatePermissionCache()` sólo limpiaba la del escritor. Se eliminó la caché de excepciones (S9). La matriz de roles sigue cacheada porque sólo cambia por migración.
- Hallazgo: `/boxes/mapa` declaraba `box.read` en el menú pero la página no lo exigía (sólo `box.manage` para editar). Se agregó el gate (T8) para que negar el permiso no deje la página abierta por URL.
- Reconciliación: la migración 011 (`turnos_ingreso`, trabajo en curso de otra sesión) le da `shift.manage` al empleado, así que el check "sidebar: empleado no ve secciones restringidas" ya no puede exigir que Turnos de caja esté oculto. Se actualizó esa aserción.
- Reconciliación: el check "turno: empleado abre y cierra el propio" abría el turno con la cookie del admin (el empleado estaba desactivado en ese punto), así que `closed_by` nunca podía ser el empleado. Se reactiva al empleado e inicia sesión antes de la prueba.
- Evidencia GREEN: `pnpm exec tsc --noEmit` limpio; `pnpm build` OK (ruta `/api/users/[id]/permissions` en el manifiesto); `node scripts/test-e2e.mjs` contra build de producción en :3200 → **E2E OK**, incluidos los 10 checks nuevos: heredar rol, conceder, concedido abre menú/página/API, denegar, denegado oculta y bloquea, empleado no administra accesos (403), clave inválida (400), el admin no se auto-quita `user.manage` (400), volver a heredado, escrituras auditadas.
- Nota de entorno: el pooler de Supabase en modo sesión (:5432) estaba saturado (EMAXCONNSESSION, límite 15). Para aplicar/consultar se usó el pooler en modo transacción (:6543) con `options=-c search_path=dev,public`; la app sigue usando :5432.
- Nota de convivencia: durante la verificación **otra sesión estaba escribiendo el mismo working tree** (apareció `db/migrations/013_condicion_ingreso.sql` y se modificaron `lib/print/*`, `sessions/[id]`, `estadias`, `DATABASE.md`). Por eso el número de migración propio es 012 y no 011. Después de ese cambio, la corrida completa del e2e falla en un check ajeno (`key_left`, migración 013 sin aplicar en `dev`), fuera del alcance de esta feature.
- Verificación independiente (contexto fresco, read-only): **FAIL** con 3 blockers reales, todos corregidos (T9): (1) negar `user.manage` con `null` no disparaba la auto-protección y la regla del último administrador sólo miraba `target.role === 'admin'`; (2) el chequeo anti-lockout era check-then-act fuera de la transacción (dos revokes concurrentes podían dejar cero administradores); (3) las reversiones a heredado no se auditaban y sólo se guardaba `after`. Advisories aceptados como preexistentes/fuera de alcance: autorización secundaria por rol en `/api/shifts/close:37`, `GET /api/payment-methods` con `tariff.read`, `GET /api/sessions/[id]` sin alcance, y falta de catálogo FK para `permission`.
- Evidencia final (build de producción en :3200): `tsc --noEmit` limpio, eslint limpio en los archivos de la feature, `pnpm build` OK, probe acotado 10/10 (hereda, concede menú/página/API, deniega menú/página/dashboard, 403 sin `user.manage`, clave inválida 400, auto-lockout con `false`, auto-lockout con `null` desde un no-admin, heredado restaura el rol, auditoría con reversiones y `before/after`, admin conserva el mini mapa). Prueba en navegador (Playwright): admin abre "Accesos" de un empleado, pone "Negar" en Mapa de boxes, guarda → "Accesos actualizados" y la fila queda "Rol: permitido · excepción"; el empleado ya no ve el ítem ni el mini mapa del dashboard y `/boxes/mapa` responde "Acceso restringido".
- Datos de prueba limpiados en `dev`: usuarios `smoke-*`, `p2-*`, `ui-*` y `probe-*` borrados; turno de residuo sin pagos cerrado; sin servidores propios levantados al terminar.
