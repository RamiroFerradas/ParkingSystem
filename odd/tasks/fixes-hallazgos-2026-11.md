# Corrección de hallazgos del suite de testing — parking-system

Objetivo: corregir los defectos que encontró la suite de tests, con test de regresión por cada uno.
Branch: `rebuild/next-16` · Delivery: commits por área · Runner: `pnpm test:unit` (vitest) + `tsc --noEmit` + `pnpm build`

## Specs

- **S1** (verbatim usuario): "si, hace todos los que falten absdolutamente todos y deja todo listo y pushea al final"
- **S2** Cada defecto corregido lleva un test que falla antes del fix y pasa después. Ningún test existente se borra; si fijaba el comportamiento defectuoso, se actualiza con un comentario que explica el cambio.
- **S3** Seguridad: `api/print-jobs` y `api/sessions/[id]` deben respetar el alcance de sucursal/permiso, igual que `api/sessions/close`.
- **S4** Integridad: el `COMMIT` de `users` y `floors` debe cubrir también el insert de `audit_logs`.
- **S5** Ningún handler devuelve 500 por excepción no capturada ni `NaN` como parámetro SQL.
- **S6** Toda la suite queda verde (`pnpm test:unit`), `tsc --noEmit` limpio y `pnpm build` OK.
- **S7** Sin cambios de comportamiento fuera de los defectos listados.
- **S8** Al final: commit por área y `git push` a `origin/rebuild/next-16`.

## Tasks

| ID | Archivo | Defecto | Área |
|---|---|---|---|
| A1 | `src/app/api/users/route.ts` | audit_logs fuera de la transacción | api-tx |
| A2 | `src/app/api/floors/route.ts` | audit_logs fuera de la transacción | api-tx |
| A3 | `src/app/api/vehicle-types/route.ts` | mensaje de error nombra el campo equivocado | api-sec |
| A4 | `src/app/api/audit-logs/route.ts` | `NaN` llega a `LIMIT` | api-sec |
| B1 | `src/app/api/print-jobs/route.ts` | POST/PATCH sin filtro de sucursal | api-sec |
| B2 | `src/app/api/vehicles/route.ts` | `NaN` llega a `LIMIT` | api-sec |
| B3 | `src/app/api/sessions/[id]/route.ts` | lectura sin scope | api-sec |
| B4 | `src/app/api/vehicles/lookup/route.ts`, `sessions/export/route.ts` | sin try/catch → 500 | api-sec |
| B5 | `src/app/api/sessions/close/route.ts` | `rows[0]!.r` sin chequeo de null | api-sec |
| B6 | `src/app/api/reports/summary/route.ts` | campo `annulled` fantasma | api-tx |
| B7 | `src/app/api/sessions/export/route.ts` | nombre de archivo en UTC | api-sec |
| C1 | `src/lib/print/ticket.ts` | `pad()` recorta la indentación de continuación | lib |
| C2 | `src/lib/print/ticket.ts` | caracteres de control borrados en vez de reemplazados | lib |
| C3 | `src/lib/queries/historial.ts` | `UUID_RE` / `DATE_RE` demasiado laxos | lib |
| C4 | `src/lib/reports/period.ts` | default 30 días documentado, devuelve 90 | lib |
| D1 | `src/components/shell/app-header.tsx` | rol null se rotula "Master" | shell |
| D2 | `src/components/shell/user-menu.tsx` | `logout()` sin try/catch | shell |
| D3 | `src/components/shell/sidebar-nav.tsx` | `item.note` nunca se renderiza | shell |
| D4 | `src/components/ui/dialog.tsx` | ids hardcodeados | shell |
| D5 | `src/components/shell/branch-picker.tsx` | `busy` no se libera en éxito | shell |
| E1 | `src/app/(app)/operaciones/ingreso/print-queue.tsx` | el mensaje de reintento se pierde | ops |
| E2 | `src/app/(app)/operaciones/historial/HistorialTable.tsx` | `useMemo` con stale closure | ops |
| E3 | `src/app/(app)/boxes/administracion/FloorManager.tsx` | limpia el form aunque falle el create | ops |
| E4 | `src/app/(app)/operaciones/ingreso/ingreso-form.tsx` | doble mensaje de vacío | ops |
| E5 | `src/app/(app)/operaciones/ingreso/ingreso-form.tsx` | import `PARKING_NAME` sin usar | ops |
| F1 | `methods-manager.tsx`, `specials-manager.tsx`, `tariffs-manager.tsx` | `GET` con body → llega a lanzar en navegador real | admin |
| F2 | `src/app/(app)/tarifas/abonados/abonados-manager.tsx` | `window.confirm` nativo | admin |
| F3 | `src/app/(app)/tarifas/especiales/specials-manager.tsx` | sin chequeo `endsAt > startsAt` | admin |
| F4 | `src/app/(app)/tarifas/abonados/abonados-manager.tsx` | `planId` viejo tras reload | admin |
| F5 | `src/app/(app)/vehiculos/vehicles-list.tsx` | búsqueda sin secuenciación | admin |

## Log

- **L1** (2026-11-20) Pedido verbatim del usuario: corregir todo y pushear.
- **L2** (2026-11-20) Origen: 29 defectos + 3 observaciones del suite de 854 tests (`odd/tasks/testing-cobertura-2026-11.md`).
- **L3** (2026-11-20) Riesgo: items 2 (seguridad: auth/permisos), 3 (contratos: API pública y permisos), 5 (dependencias no cambian). Se tocan rutas de dinero (cierre de sesión) y de seguridad.
- **L4** (2026-11-20) Los 30 items corregidos, cada uno con test de regresión escrito antes del fix. Verificación final: `pnpm test:unit` → **78 archivos / 883 tests / 0 fallos**; `tsc --noEmit` limpio; `pnpm build` compila. Cobertura previa a los fixes: statements 91.79%.
- **L5** (2026-11-20) Commits: `725f882` (B1,B3), `1e5de53` (B2,B4,B5,B7,A3,A4), `568980d` (A1,A2,B6). El resto (C1-C5, D1-D5, E1-E5, F1-F5) quedó incluido en `aa5ee7c`, commit de la sesión paralela que barrió el árbol de trabajo con `git add -A`. Contenido verificado por marcadores en HEAD (`keepIndent`, `isCalendarDate`, `PERIODS[2]`, `useId`, `requestSeq`, `resolvePeriod`, ausencia de `window.confirm`).
- **L6** (2026-11-20) Push: `origin/rebuild/next-16` al día (el push lo efectuó la sesión paralela; `git push` devolvió "Everything up-to-date").
- **L7** (2026-11-20) Lección de proceso: dos sesiones con `git add -A` sobre el mismo worktree hacen imposible atribuir commits. Tres veces se barrió trabajo ajeno dentro de un commit con otro mensaje. Mitigación aplicada: stage por ruta explícita; no alcanza cuando la otra sesión commitea primero.
