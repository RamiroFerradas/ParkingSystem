# Turnos obligatorios y reportes por turno (nov 2026)

Objetivo: exigir un turno de caja abierto para registrar ingresos, permitir que el empleado abra/cierre su propio turno, y agregar reporte de turnos con facturación, usuarios, cantidad de autos, detalle de movimientos y filtro por hora.
Rama: `rebuild/next-16`. Entrega: commits en la rama + deploy a Vercel cuando el usuario lo pida. Test runner: `scripts/test-e2e.mjs` y `pnpm build`.

## Specs

- S1: "finalemnte necesito que para cargar un primer vehiculo tenga que haber un turno asociado si o si" → ningún ingreso se registra sin turno de caja abierto: lo valida la base (trigger), la API responde `409 NO_OPEN_SHIFT` y la pantalla de ingreso avisa y bloquea el alta.
- S2: "que en los reportes se puedan ver lo que facturo cada turno etc" → reporte de turnos con recaudación, cobros y autos por turno.
- S3: "tambien se pueda cerrar un turno y que muestre quien abrio y quien cerro cada turno(usuario) en el reporte y la facturacion y la cantidad de autos" → cada fila muestra abrió, cerró, fecha/hora, facturado y cantidad de autos; el cierre registra `closed_by`.
- S4: "y si lo clickeas te detalle un historial de ingresos y egresos de ese turno" → detalle por turno con el historial de ingresos y egresos.
- S5: "tambien que se pueda buscar por x hora que vehiculo entro en ese turno por ejemplo" → el detalle filtra por rango de horas de ingreso y por patente.
- S6 (decisión del usuario): "Empleado abre y cierra su turno (Recomendado)" → `employee` recibe `shift.manage` y puede cerrar solo el turno que abrió; un turno no se cierra mientras tenga vehículos sin egreso.

## Tasks

- T1 · S1, S6 · Migración `011_turnos_ingreso.sql`: trigger que rechaza estadías abiertas sin `shift_id` y `shift.manage` para `employee` · done · aplicada en `dev` y `public` (renombrar a 012 por colisión con `011_user_permissions.sql`)
- T2 · S1, S6 · API: `409 NO_OPEN_SHIFT` en ingreso; cierre con control de autos sin egreso, cierre solo del propio turno para empleado y auditoría `shift.open`/`shift.close` · done (sin commit)
- T3 · S1, S3 · UI de ingreso (aviso y bloqueo) y de turnos (facturado, autos adentro, enlace al reporte) · done (sin commit)
- T4 · S2, S3, S4, S5 · `/reportes/turnos` + `/reportes/turnos/[id]` con detalle, filtros por hora/patente y desglose por medio · done (sin commit)
- T5 · S1..S6 · Navegación, e2e y build · pending · bloqueado: otra sesión edita el mismo repo (configurador de permisos)
- T6 · S1..S6 · Verificación, evidencia y commits · pending · bloqueado hasta que la otra sesión cierre

## Log

- L1: "ya actualice manualmente el usuario, finalemnte necesito que para cargar un primer vehiculo tenga que haber un turno asociado si o si, y que en los reportes se puedan ver lo que facturo cada turno etc, y tambien se pueda cerrar un turno y que muestre quien abrio y quien cerro cada turno(usuario) en el reporte y la facturacion y la cantidad de autos y si lo clickeas te detalle un historial de ingresos y egresos de ese turno, tambien que se pueda buscar por x hora que vehiculo entro en ese turno por ejemplo."
- L2: "Empleado abre y cierra su turno (Recomendado)" (respuesta a quién puede abrir el turno de caja).
- L3 (cierre de sesión): se pautó commit y push al terminar, pero la verificación quedó bloqueada: otra sesión está editando el mismo working tree (feature `configurador-permisos-usuario`, migración `011_user_permissions.sql`, refactor de `hasPermission(user, ...)` en ~40 archivos). Decisión del usuario: esperar a que esa sesión cierre antes de commitear. Estado: código implementado y build OK a las 13:44 (previo a los edits de la otra sesión); migración aplicada en `dev` y `public`; e2e 99 ✓ con 22 fallas explicadas por (a) residuos del run anterior en `dev` (AB1234/MOV123 abiertos de un run abortado) y (b) la ruta `/api/users/[id]/permissions` de la otra sesión no está en el build. Falta al retomar: renombrar la migración a `012_turnos_ingreso.sql`, limpiar residuos e2e en `dev`, rebuild y corrida completa.
