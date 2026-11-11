# Auditoría y diseño del sistema de estacionamiento

Objetivo: auditar el prototipo existente y documentar la arquitectura propuesta antes de implementar.
Repositorio: F:\PROGRAMACION\PROYECTOS\parking-system (sin git inicializado). Test runner: pendiente (ninguno hoy). Estrategia de entrega: por etapas (A–H), decisión de PR/rama pendiente.

## Specs

- S1 (Etapa A): "Generá un documento `AUDIT.md` con: - Estado actual del proyecto. - Arquitectura existente. - Funcionalidades encontradas. - Problemas técnicos. - Componentes reutilizables. - Componentes que conviene reemplazar. - Arquitectura propuesta."
- S2 (Etapa A): "No elimines ni sobrescribas funcionalidades existentes durante esta etapa."
- S3 (Etapa A): "Revisa si se puede seguir trabajando sobre este proyecto que inicie hace un tiempo atras sino creamos algo nuevo" → el audit debe incluir el veredicto reutilizar/reconstruir.
- S4 (Fase 2): "Generá: `ARCHITECTURE.md`, `DATABASE.md`, `BUSINESS_RULES.md`, `IMPLEMENTATION_PLAN.md`." + "Identificá las reglas de negocio que todavía necesitan confirmación. No inventes reglas de facturación ni supongas comportamientos que no estén documentados."
- S5 (gate): "No implementes funcionalidades hasta haber auditado el proyecto existente y presentado la arquitectura propuesta."
- S6 (global): Idioma español, moneda ARS, TZ America/Argentina/Cordoba, DD/MM/YYYY, 24h.
- S7 (crítico, prevalece): arquitectura offline-first con servidor local PostgreSQL + Supabase Cloud + motor de sincronización bidireccional (Outbox/Inbox); "no implementar una base IndexedDB independiente por computadora como única fuente de verdad".

## Tasks

- T1 · S1,S2,S3 · Auditoría del código existente (explore, read-only) · done (sesión 2026-11-11)
- T2 · S1 · Escribir AUDIT.md (inline) · done (sesión 2026-11-11)
- T3 · S3 · Presentar veredicto al usuario y decidir: evolucionar vs reconstruir · done (2026-11-11: usuario decidió reconstruir desde 0 con Next.js 16 + Cache Components)
- T4 · S4 · ARCHITECTURE.md, DATABASE.md, BUSINESS_RULES.md, IMPLEMENTATION_PLAN.md · done (2026-11-11, Fase 2)
- T6 · S5 · Presentar arquitectura propuesta al usuario · done (2026-11-11: 4 docs en raíz, reglas abiertas BR-OPEN listadas)
- T7 · · Etapa C (infra local + auth + shell) · done (2026-11-11: C1 ✅ C2 ✅ commit aadb293 · C3 auth local Argon2id+JWT+proxy con fix 42P08 verificado end-to-end (401/200+cookie/307, audit auth.login registrado) · C4 shell+dashboard PPR ◐+PWA, build y lint verdes)
- T8 · · Etapa D (operación diaria) · in_progress (2026-11-11: D3 ✅ open_session RPC + pantalla ingreso con alta rápida de vehículo · D4 ✅ close_session + quote_exit + pantalla egreso con desglose · turnos de caja ✅ abrir/cerrar + arqueo por medio (commits d31877d, f8fa5bd) · pendiente: D1 admin vehículos, D2 mapa boxes, D5 historial/filtros, D6 outbox)
- T5 · · Scaffold Next.js 16.4.6 + React 19.2 + Tailwind 4 + cacheComponents/partialPrefetching; legacy a _legacy/ (git mv); build y lint verdes · done (commit c1d8b7b, rama rebuild/next-16)

## Log

- L1 (2026-11-11): Pedido original del usuario (verbatim, completo): guardado en engram vía captura de prompt de sesión — especifica el sistema integral completo, el requerimiento offline-first crítico (secciones A–J), el stack (Next.js App Router, TS estricto, Supabase, PostgreSQL, RLS, RPC, Tailwind, shadcn/ui, RHF, Zod, TanStack Table, Recharts, date-fns), módulos (operación, boxes, tarifas con motor de resolución + snapshots, dashboard, estadísticas avanzadas, impresión térmica 58mm ESC/POS, RBAC, auditoría, sincronización) y las etapas A–H. Fuentes de tarifas: valores de referencia de fotos (editable, no constantes). Reglas pendientes: fórmula de fraccionamiento (5h = 4h+1h vs 2 bloques vs otra), duración de códigos 60/61/66/67, tolerancias, mínimos, recargos/descuentos.
- L2 (2026-11-11): Auditoría completa vía agente explore. Veredicto: prototipo mínimo (1 pantalla, calculadora + ticket), sin persistencia, sin auth, sin DB, con bugs de cálculo (horas negativas, recalculado duplicado en Ticket) y path de impresión mal usado (HTML serializado a Web Serial). Nada que conserve obliga a evolucionar en sitio; se recomienda reconstruir en este repo manteniendo el prototipo como referencia hasta el corte.
- L3 (2026-11-11): Cierre de caja manual confirmado por el cliente (BR-OPEN-10 → BR-022): uno abre, otro cierra, ~19:00 es costumbre no automatización. Migración 003 (cash_shifts, payments/sessions.shift_id, profiles.email) + migración 004 (RPC open_session/close_session/quote_exit + calc_fee_breakdown con R-01/BR-OPEN-04, boxes provisionales 01-30, tarifas draft activadas para dev). Tests: scripts/test-rpcs.mjs (10 checks SQL) + scripts/test-e2e.mjs (14 checks HTTP) verdes. Gotchas: PG 42P08 (uuid vs text en $1 reutilizado → params separados); 'hora empezada se cobra entera' aplica también a horas extra (301 min = 4HS + 2 extra, correcto); taskkill de listeners en este entorno requiere Get-NetTCPConnection SIN filtro -State.
