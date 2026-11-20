# Auditoría de reutilización + tipado Zod — parking-system

Objetivo: extraer la lógica y los componentes duplicados, partir los archivos
demasiado grandes y unificar el tipado de borde (request/response) con Zod.
Branch: `rebuild/next-16` · Delivery: work units por área · Runner: `pnpm test:unit`
(vitest) + `npx tsc --noEmit` + `pnpm build`

## Specs

- **S1** (verbatim usuario): "neceisto que hagamos una auditoria de todos los metodos y componetnes de la app que se puedan hacer reutililizables, que no queden archivos muy grandes tambien implementa zod para el tipado de todo"
- **S2** **Cero cambios de comportamiento no pedidos.** Todo refactor conserva: status codes, mensajes de error (string exacto), cuerpos de respuesta, orden de parámetros SQL y semántica de validación. Si un hallazgo exige cambiar comportamiento (p. ej. dos dialectos CSV distintos), se documenta como hallazgo y no se corrige silenciosamente.
- **S3** Toda ruta que lee un body JSON declara un schema Zod en `src/lib/schemas/**` y lo consume con `parseBody()` / `parseOptionalBody()` de `src/lib/api/body.ts`. Los tipos de payload salen de `z.infer`, no de interfaces manuscritas.
- **S4** Las reglas de negocio que Zod debe preservar: trim/upper-case de códigos y patentes, `validTo > validFrom`, allow-lists de enums, silencio de `parseHistorialFilters`, upper-case de número de box, y los códigos 409 por razón (`VEHICLE_PARKED`, `BOX_TAKEN`, `NO_OPEN_SHIFT`, `SHIFT_HAS_OPEN_SESSIONS`).
- **S5** La suite existente (883 tests) sigue verde sin borrar tests; `npx tsc --noEmit` limpio.
- **S6** Ningún archivo nuevo supera ~300 líneas; los archivos > 300 líneas se parten por responsabilidad con re-export desde el path original para no romper imports ni tests.
- **S7** Los primitivos compartidos viven en `src/components/ui/**` (componentes) y `src/lib/**` (lógica). Las páginas no redefinen un primitivo que ya existe.
- **S8** Los tipos de fila de base de datos (`*Row`) NO se validan con Zod en runtime: `src/lib/db/client.ts` castea filas de SQL. Zod cubre el borde de entrada (request) y los payloads de respuesta que el cliente consume.

## Hallazgos de la auditoría

### A. Duplicación (métodos / lógica)

| # | Clúster | Sitios | Destino propuesto |
|---|---|---|---|
| D1 | `Acceso restringido` idéntico en páginas | 18 | `components/ui/access-denied.tsx` |
| D2 | `call()` fetch/mutación por manager | 6 | `src/lib/api/client.ts` |
| D3 | Scaffold `list/busy/error + reload` por manager | 5 | `src/lib/hooks/use-resource.ts` |
| D4 | `inputCls` / `btnCls` / `badgeCls` | 9 | `src/lib/ui-classes.ts` |
| D5 | Parse de body JSON + `typeof` | 25 | `src/lib/api/body.ts` (Zod) |
| D6 | Insert `audit_logs` | 24 | `src/lib/audit.ts` — **diferido**: los tests fijan el orden de `$N` |
| D7 | Guard 403 por permiso | 25 | `getBranchContextOrFail` — **diferido**: los tests mockean `hasPermission` |
| D8 | `Card` / `Th` / `Td` / `Empty` en reportes | 5 | `components/ui/report-table.tsx` |
| D9 | `lastTwelveMonths()` / mes actual | 3 | `src/lib/reports/months.ts` |
| D10 | `PERIODS` duplicado (drift semántico) | 1 | reutilizar `src/lib/reports/period.ts` |
| D11 | CSV: dos dialectos (`;`+BOM vs `,`) | 2 | `src/lib/csv.ts` — **reportar**, no unificar sin decisión |
| D12 | Fila/tipo de tarifa + SELECT | 3 | `src/lib/queries/tariffs.ts` |
| D13 | `bg-plate` + franja | 3 | `components/ui/plate-badge.tsx` |
| D14 | Banner de error | 14 | `components/ui/alert.tsx` |
| D15 | `clampLimit`, `branchOf`, `TZ` | 2/2/6 | foundation helpers |

### B. Archivos sobredimensionados (> 300 líneas)

| Archivo | Líneas | Plan |
|---|---|---|
| `tarifas/productos/tariffs-manager.tsx` | 772 | `tariffs-types.ts`, `vehicle-card.tsx`, `monthly-plans.tsx`, `tariff-row.tsx` |
| `reportes/page.tsx` | 656 | `lib/queries/reports/overview.ts`, `lib/reports/months.ts`, `AccessDenied`, `report-table` |
| `operaciones/ingreso/ingreso-form.tsx` | 568 | `use-plate-lookup.ts`, `use-ingreso-submit.ts`, `ingreso-success.tsx`, `box-picker.tsx` |
| `(app)/page.tsx` | 535 | una sección por archivo en `_components/dashboard/` + `lib/queries/dashboard.ts` |
| `tarifas/abonados/abonados-manager.tsx` | 416 | `use-abonados.ts` + helpers |
| `reportes/turnos/[id]/page.tsx` | 402 | `lib/queries/shift-detail.ts` + `report-table` |
| `components/shell/skeletons.tsx` | 399 | carpeta `skeletons/` con un archivo por variante |
| `boxes/administracion/FloorManager.tsx` | 351 | `new-floor-form.tsx`, `floor-card.tsx`, `box-chip.tsx` |
| `components/shell/shift-control.tsx` | 315 | `use-shift-mutation.ts` |
| `components/ui/dialog.tsx` | 308 | `lib/hooks/use-dialog-behavior.ts` |
| `lib/print/ticket.ts` | 209 | OK (cohesivo) |

### C. Tipado

- 25 rutas repiten `let body; try { body = (await request.json()) as Record<string, unknown> } catch { 400 }`.
- 8 pares `*Row` (server) / `*View` (client) duplicados; Zod es la fuente única.
- `src/lib/db/client.ts:44` (`rows as T[]`) es el único punto de cast de filas.
- Casts inseguros en el cliente: `rows as ManagedUser[]`, `r.tariffs as TariffView[]`, `data.vehicles` sin tipo, `res.json() as Record<string, unknown>` en print.

### D. Primitivos ya existentes pero subusados

- `requireBranchContext()` (`src/lib/auth/context.ts:83`) — 0 consumidores; 17 páginas lo reimplementan.
- `getBranchContextOrFail()` — 10 rutas lo usan; 12 lo reimplementan.
- `normalizePlate` reimplementado en `abonados-manager.tsx:63`.
- `formatDate`/`formatTime` reimplementados en `abonados-manager.tsx:42-61`.
- `ConfirmDialog`/`PromptDialog` ignorados por `shift-control`, `user-menu`, `BoxEditPanel`.
- `useToast` con 2 consumidores de 12.

## Tasks

| ID | Área | Alcance | Estado |
|---|---|---|---|
| T1 | foundation | `src/lib/schemas/common.ts`, `src/lib/api/body.ts` + tests | done |
| T2 | zod/catalogs | `schemas/catalogs.ts` + 7 rutas catálogo | pending |
| T3 | zod/money | `schemas/money.ts` + 6 rutas económicas/usuarios | pending |
| T4 | zod/ops | `schemas/operations.ts` + rutas de sesiones/turnos/print | pending |
| T5 | zod/misc | `schemas/misc.ts` + auth/vehicles/reports/audit-logs | pending |
| T6 | ui | `components/ui/*` primitivos + `src/lib/ui-classes.ts` | pending |
| T7 | lib | `api/client.ts`, `reports/months.ts`, `queries/tariffs.ts` | pending |
| T8 | apply | managers y páginas consumen primitivos | pending |
| T9 | splits | partir los archivos > 300 líneas con re-export | pending |

## Log

- **L1** (usuario, 2026-11-20): "neceisto que hagamos una auditoria de todos los metodos y componetnes de la app que se puedan hacer reutililizables, que no queden archivos muy grandes tambien implementa zod para el tipado de todo"
- **L2** Línea base verificada: 78 archivos / 883 tests verdes, `tsc --noEmit` limpio, tree limpio en `rebuild/next-16`.
- **L3** `zod@4.6.7` agregado como dependencia (`pnpm add zod`).
- **L4** Decisiones de riesgo: se difieren `auditLog()` (D6), adopción de `getBranchContextOrFail` (D7) y unificación de CSV (D11) porque cambian orden de parámetros SQL / mocks de tests / formato de salida, y S2 prohíbe cambios de comportamiento no pedidos durante el refactor.
