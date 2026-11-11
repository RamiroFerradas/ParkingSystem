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
- T7 · · Etapa C (infra local + auth + shell) · pending
- T5 · · Scaffold Next.js 16.4.6 + React 19.2 + Tailwind 4 + cacheComponents/partialPrefetching; legacy a _legacy/ (git mv); build y lint verdes · done (commit c1d8b7b, rama rebuild/next-16)

## Log

- L1 (2026-11-11): Pedido original del usuario (verbatim, completo): guardado en engram vía captura de prompt de sesión — especifica el sistema integral completo, el requerimiento offline-first crítico (secciones A–J), el stack (Next.js App Router, TS estricto, Supabase, PostgreSQL, RLS, RPC, Tailwind, shadcn/ui, RHF, Zod, TanStack Table, Recharts, date-fns), módulos (operación, boxes, tarifas con motor de resolución + snapshots, dashboard, estadísticas avanzadas, impresión térmica 58mm ESC/POS, RBAC, auditoría, sincronización) y las etapas A–H. Fuentes de tarifas: valores de referencia de fotos (editable, no constantes). Reglas pendientes: fórmula de fraccionamiento (5h = 4h+1h vs 2 bloques vs otra), duración de códigos 60/61/66/67, tolerancias, mínimos, recargos/descuentos.
- L2 (2026-11-11): Auditoría completa vía agente explore. Veredicto: prototipo mínimo (1 pantalla, calculadora + ticket), sin persistencia, sin auth, sin DB, con bugs de cálculo (horas negativas, recalculado duplicado en Ticket) y path de impresión mal usado (HTML serializado a Web Serial). Nada que conserve obliga a evolucionar en sitio; se recomienda reconstruir en este repo manteniendo el prototipo como referencia hasta el corte.
