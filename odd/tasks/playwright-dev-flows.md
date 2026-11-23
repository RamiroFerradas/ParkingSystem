# Playwright: todos los flujos principales (admin + empleado) contra la base dev

Objetivo: cubrir en Playwright los flujos principales de la app como administrador y como empleado,
corriendo contra la base `dev` de Supabase, con la suite entera en verde.
Rama: `main`. Entrega: un commit de trabajo. Test runner: `pnpm test:e2e` con `E2E_TARGET=dev`.

## Specs

- S1: "Quiero tener todos los flujos principales posiubles en playwrite como empleado y como administrador en playwrite contra la base de dev y que los corras y salgan todos en verde"
  - S1.1: la suite corre contra el schema `dev` de Supabase (la base de dev real). Docker local no está disponible en esta máquina, así que `dev` es el único destino dev.
  - S1.2: los flujos quedan separados por rol: carpeta `e2e/admin/` y `e2e/employee/`; el admin ve todas las secciones y el empleado solo las operativas.
  - S1.3: la suite se ejecuta completa y termina en verde (`pnpm test:e2e` con `E2E_TARGET=dev`).
  - S1.4: los flujos son idempotentes y re-ejecutables: cada corrida deja la base dev en un estado conocido y no depende de datos de corridas anteriores.

## Supuestos (marcados como supuestos)

- A1: "la base de dev" = schema `dev` de Supabase (`SUPABASE_DB_URL_DEV` / `DATABASE_SCHEMA=dev`), no el Postgres de `docker-compose` (no está corriendo).
- A2: "todos los flujos principales posibles" = cada página del menú de cada rol + los flujos de dinero (ingreso, egreso, mover de box, turno de caja) + los CRUD de administración (boxes, tipos, tarifas, abonos, usuarios, medios de pago) + reportes y auditoría/sincronización.
- A3: para no ensuciar la sucursal real (`Sucursal 01`) la suite usa una sucursal dedicada `E2E QA (Playwright)` con sus propios pisos, boxes, tarifas y usuarios. `public` (producción) sigue prohibido.
- A4: las filas que crea la suite dentro de la sucursal E2E se reinician al inicio de cada corrida; no se toca ningún dato de `Sucursal 01`.

- S2: "arregla lo que haga falta en el codigo si alguno rompe" → las pantallas que consultaban datos sin filtrar por sucursal mostrando boxes/estadías/turnos de otra sucursal se corrigen (ingreso, egreso, estadías, historial, mapa de boxes, estructura de boxes, auditoría). Sin ese arreglo el flujo de ingreso ofrecía boxes que el servidor rechaza y el historial mostraba estadías ajenas.

## Tasks

- T1 · S1.1 · Destino dev en el harness: `E2E_TARGET=dev` resuelve el schema `dev`, rechaza el pooler transaccional (`:6543`) y el webServer arranca la app con `DATABASE_SCHEMA=dev` · done · `node e2e/support/target.mts` imprime el destino
- T2 · S1.4 · Fixtures dev idempotentes: sucursal `E2E QA`, piso, boxes `E2E-01..06`, tarifas Auto (1 h / 4 h / abono), usuarios `e2e-admin`/`e2e-empleado`/`e2e-multibranch`, reset de estadías/turnos de la sucursal · done · `node e2e/support/dev-fixtures.mts prepare` dos veces seguidas sin error
- T3 · S1.2 · Sesiones por rol en `auth.setup.ts` (admin, empleado, multibranch) · done · 3 `storageState` generados
- T4 · S1.2 · Flujos de empleado: menú permitido, accesos restringidos, ingreso (con y sin turno), egreso, mover de box, estadías/historial, turno propio · done · specs verdes
- T5 · S1.2 · Flujos de administrador: boxes (mapa + estructura), tipos de vehículo, medios de pago, tarifas (productos/especiales/abonados), usuarios, turnos, auditoría, sincronización · done · specs verdes
- T6 · S1.2 · Flujos de lectura: dashboard, reportes (general/boxes/abonados/turnos + detalle) y export CSV · done · specs verdes
- T7 · S1.2 · Selección de sucursal y cambio de sucursal (usuario con dos sucursales) · done · spec verde
- T8 · S1.3 · Corrida completa contra dev en verde · done · 65/65 verde con build (`pnpm test:e2e:dev`)
- T9 · S2 · Alcance por sucursal en las pantallas: ingreso (boxes + turno), egreso (lista + detalle), estadías, historial (filas + filtros), mapa de boxes, estructura de boxes y auditoría · done · unit 1033/1033, DB 13/13 y e2e 65/65 en verde

## Log

- L1: "Quiero tener todos los flujos principales posiubles en playwrite como empleado y como administrador en playwrite contra la base de dev y que los corras y salgan todos en verde"
- Evidencia: `e2e/` pasa a 15 archivos / 65 tests contra el schema `dev` de Supabase con `E2E_TARGET=dev`. La suite usa la sucursal `E2E QA (Playwright)` (10 boxes `E2E-01..10`, tarifas Auto 1 h/4 h y abono mensual, usuarios `e2e-admin`, `e2e-employee`, `e2e-multibranch`); `dev-fixtures.mts prepare` reinicia solo las filas de esa sucursal y nunca dropea el schema. Los 3 `auth.setup` son el proyecto `setup` de Playwright, no la suite completa.
- Evidencia: primer fallo real era de producto, no del test: la pantalla de ingreso listaba boxes de todas las sucursales (`box_status` sin filtro) y el aviso de turno consultaba cualquier sucursal, así que la sucursal real de dev (con turno abierto) ocultaba el estado real de la sucursal E2E. Se corrigió el alcance por sucursal en ingreso, egreso (lista + detalle), estadías, historial (+ opciones de filtro), mapa de boxes, estructura y auditoría.
- Evidencia: `pnpm test:unit` 1033/1033 (se actualizaron los tests de `historialScopeForSession`, `loadFilterOptions`, export CSV y los 4 de `shifts-close` que estaban en rojo desde el cambio de cierre de turno); `node --test tests/db/*.test.mjs` 13/13; `pnpm test:e2e:dev` 65/65 con build.
- Learned: las mutaciones de la pantalla de estructura de boxes se afirman sobre una navegación nueva (waitForResponse + goto) porque el `router.refresh()` del cliente puede quedar pendiente y no reflejar el cambio en el DOM.
