# Testing de cobertura total — parking-system

Objetivo: suite de tests automáticos para lógica, API handlers y client components.
Branch: `main` (se crea rama de trabajo) · Delivery: una sola rama, commits por unidad · Runner: `vitest` (unit) + `node --test` (db, existente)

## Specs

- **S1** Requerimiento original (verbatim del usuario): "necesito testear todos los componentes serviiso y todos los archivos que se puedan de la app. enecesito testing de todo"
- **S2** Stack elegido por el usuario: Vitest + @testing-library/react + jsdom + vite-tsconfig-paths como devDependencies. Debe convivir con la suite existente `tests/db/*` (node:test) sin romperla.
- **S3** Los 29 client components (`"use client"`) tienen al menos un test de render, y los que reciben props con lógica tienen test de interacción o de props.
- **S4** Los API route handlers (`src/app/api/**/route.ts`) tienen tests de contrato: status HTTP, forma del payload, y comportamiento del guard de auth. Mocks de `@/lib/db/client` y `@/lib/auth/*` vía `vi.mock`.
- **S5** Los archivos de `src/lib` tienen tests: los puros (plate, format, period, ticket, serial, shifts/format) sin mocks; los que tocan DB o auth con mocks.
- **S6** `pnpm build` sigue funcionando y la suite de DB existente (`pnpm test:db`) no se modifica ni rompe.
- **S7** Scripts en package.json: `test` queda intacto (node:test sobre `tests/`, contrato documentado en `openspec/changes/multi-branch/tasks.md`); se agregan `test:db` (alias), `test:unit` (vitest), `test:watch`, `test:coverage` y `test:all`.
- **S8** Cobertura medida con `@vitest/coverage-v8` y reportada en el cierre.
- **S9** Los server components async (páginas `/src/app/**/page.tsx`) NO se testean con unit tests (dependen de `next/headers` y DB); quedan cubiertos por el E2E HTTP existente `scripts/test-e2e.mjs`. Se documenta el motivo en el cierre.
- **S10** Ningún test depende de estado global mutable entre archivos: jsdom + cleanup de RTL por test, mocks restaurados con `vi.restoreAllMocks`.

## Tasks

| ID | Cubre | Ruta | Archivos | Commit |
|---|---|---|---|---|
| T1 | S2,S7 | inline | `vitest.config.ts`, `tests/unit/setup.ts`, `package.json`, `.github/workflows/ci.yml` | |
| T2 | S5 | inline | `tests/unit/lib/*.test.ts` | |
| T3 | S4 | delegated | `tests/unit/api/*.test.ts` | |
| T4 | S3 | delegated | `tests/unit/components/shell/*.test.tsx` | |
| T5 | S3 | delegated | `tests/unit/components/features/*.test.tsx` | |
| T6 | S8,S6 | inline | cobertura + verificación build | |

## Log
- **L1** (2026-11-20) Pedido del usuario, verbatim: "necesito testear todos los componentes serviiso y todos los archivos que se puedan de la app. enecesito testing de todo"
- **L2** (2026-11-20) Exploración: 107 archivos en `src` (58 tsx: 29 client / 29 server; 48 ts). Única infra de test: `tests/db/*` (node:test + pg + rollback). Sin vitest/jsdom/testing-library instalados. Node 24.14.1, pnpm 10.33.0, Next 16.4.6, React 19.2.0.
- **L3** (2026-11-20) Decisión del usuario: instalar Vitest + Testing Library (opción recomendada sobre cero-deps o vitest sin DOM).
- **L4** (2026-11-20) CI actual (`.github/workflows/ci.yml`) corre migraciones + smoke + build + e2e, pero NO corre tests unitarios. Se agrega el paso de unit tests.
- **L5** (2026-11-20) T1 cerrado: deps instaladas (vitest 5.1.1, @vitest/coverage-v8, jsdom 31, @testing-library/react 16.3.3, user-event, jest-dom 8). `vitest.config.mts` con `resolve.tsconfigPaths: true` (Vite ya resuelve `@/*` nativo; se descartó `vite-tsconfig-paths`), jsdom, setup con jest-dom + cleanup. Smoke verificado: 34 tests verdes en 6 archivos (lib puros + toast + connectivity-badge).
- **L6** (2026-11-20) Hallazgo (bug real, NO corregido — fuera de alcance de testing): `src/lib/reports/period.ts:34-36` documenta "Período por defecto: 30 días" pero `resolvePeriod` devuelve `PERIODS[3]` = `key: "90"`. La página `src/app/(app)/reportes/turnos/page.tsx:43` la usa con `params.p`, así que sin `?p=` el reporte de turnos muestra 90 días en vez de 30. Test `tests/unit/lib/period.test.ts` fija el comportamiento ACTUAL (90) y deja el comentario del hallazgo.

- **L7** (2026-11-20) T2–T6 cerrados. Suite final: **78 archivos / 854 tests / 0 fallos**, `tsc --noEmit` limpio, `pnpm build` OK. Cobertura: statements **91.79%**, branches **85.66%**, functions **85.89%**, lines **93.27%**.
- **L8** (2026-11-20) Tests alineados 3 veces contra cambios de la otra sesión concurrente: `AppHeader` + `MobileNavProvider`, `historial` con `pc.email`, `mini-box-map` con `aria-label` y nueva paleta, `BoxMapBoard` con filtros por piso. Regla adoptada: aseverar semántica (`aria-label`, `role`, `data-*`) y no clases Tailwind.
- **L9** (2026-11-20) Commits: `31cb25a` (740 tests), `d137f20` (admin/tarifas + alineación), `cb56672` (estilos responsive pendientes), `9e48d8b` (últimos 10 archivos, 104 tests).
- **L10** (2026-11-20) Hallazgos abiertos: **29 defectos + 3 observaciones**. Los dos de seguridad: `api/print-jobs` (`POST`/`PATCH` sin filtrar `branchId`) y `api/sessions/[id]` (sin `session.read_all`). Ninguno corregido: quedan fuera del alcance de testing.
- **L11** (2026-11-20) Riesgo de la entrega: item 5 (devDependencies + paso de CI). Sin cambios de comportamiento en `src/`.
