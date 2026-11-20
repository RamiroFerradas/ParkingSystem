# Mauricio's Parking

Sistema integral de gestión de estacionamiento (Córdoba, Argentina).

Reconstrucción desde cero sobre **Next.js 16 (App Router, Cache Components)**. El
prototipo anterior está preservado sin modificaciones en `_legacy/` (ver
`AUDIT.md` para la auditoría completa).

## Stack

- Next.js 16 · React 19 · TypeScript estricto (`noUncheckedIndexedAccess`)
- Tailwind CSS 4
- Supabase (Auth, PostgreSQL, Realtime, Storage) — integración por etapas
- Arquitectura offline-first: servidor local PostgreSQL + Supabase Cloud +
  motor de sincronización (Outbox/Inbox) — diseño en `ARCHITECTURE.md`

## Scripts

```bash
pnpm install
pnpm dev      # servidor de desarrollo (Turbopack)
pnpm build    # build de producción
pnpm lint     # eslint
```

## Configuración

- `next.config.ts` activa `cacheComponents: true`: los reads cacheables usan la
  directiva `'use cache'` y los datos dinámicos van dentro de `<Suspense>`.
- Path alias: `@/*` → `src/*`.

## Documentación

- `AUDIT.md` — auditoría del prototipo existente (Etapa A)
- `odd/tasks/auditoria-y-diseno.md` — seguimiento de etapas y decisiones
