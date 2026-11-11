# ARCHITECTURE.md — Arquitectura del sistema

Sistema híbrido **offline-first**: el estacionamiento opera contra un servidor
local dentro de su red; Supabase Cloud actúa como plataforma centralizada para
el administrador remoto y como destino de sincronización.

## 1. Vista general

```
┌────────────────── Establecimiento (LAN) ──────────────────┐
│                                                           │
│  Terminales (PC operativas, navegador)                    │
│      │  http://<ip-servidor-local>:3000                   │
│      ▼                                                    │
│  ┌───────────────────────────────────────────────┐        │
│  │  SERVIDOR LOCAL (Docker Compose)              │        │
│  │  ├─ PostgreSQL 16 (fuente de verdad offline)  │        │
│  │  ├─ App Next.js 16 (misma codebase)           │        │
│  │  ├─ Worker de sincronización                  │        │
│  │  └─ Backup automático (pg_dump programado)    │        │
│  └───────────────┬───────────────────────────────┘        │
│                  │ (solo salida, sin exposición entrante) │
└──────────────────┼────────────────────────────────────────┘
                   │ HTTPS / Supabase client (service key server-side)
                   ▼
        ┌───────────────────────────┐        ┌─────────────────────┐
        │ Supabase Cloud            │◄───────│ Admin remoto        │
        │ PostgreSQL + Auth + RLS   │  HTTP  │ (PC / tablet / cel) │
        │ Realtime + Storage        │        │ acceso por Supabase │
        └───────────────────────────┘        └─────────────────────┘
```

Principios:

1. **Una sola codebase, dos planos de datos.** La app detecta el plano con
   `DATA_PLANE=local|cloud`. El plano local es la fuente de verdad operativa.
   El plano cloud (accesible desde Vercel o hosting equivalente) es solo
   lectura/consulta + administración remota.
2. **Nada esencial depende de la nube.** Con Internet caído, todas las
   operaciones de §BR-015 funcionan contra el PostgreSQL local.
3. **IndexedDB nunca es fuente de verdad.** Solo caché de PWA y soporte offline
   del shell de la app (requisito explícito del pedido).
4. **No se expone el servidor local a Internet.** El worker local inicia toda
   comunicación saliente hacia Supabase.
5. **Operaciones críticas = transacciones PostgreSQL** (RPC), idénticas en
   local y en la nube.

## 2. Servidor local

`docker-compose.yml` con servicios:

| Servicio | Imagen / rol | Notas |
|---|---|---|
| `db` | `postgres:16` | Volumen persistente, healthcheck |
| `app` | Next.js standalone | `DATA_PLANE=local`, `DATABASE_URL` → `db` |
| `sync-worker` | mismo binario de app (entrypoint `sync`) | Outbox/Inbox, backoff |
| `backup` | `postgres:16` + cron | `pg_dump` diario + retención 30 días |

Persistencia: volumen dedicado para el data dir. Recuperación: los backups
viven fuera del volumen (carpeta montada del host) y se puede re-levantar con
`migrations up` + `pg_restore`.

## 3. Motor de sincronización (Outbox / Inbox)

Patrón de eventos persistentes, no replicación física:

```
Operación local (transacción única)
  └→ tabla operativa + fila en sync_outbox (mismo commit)
        │
Worker local (loop):
  1. toma batch de outbox en estado 'pending' (SKIP LOCKED)
  2. envía a Supabase vía RPC upsert idempotente
     (operation_id = PK en sync_inbox del lado cloud)
  3. recibe confirmación → marca 'synced' (+ synced_at)
  4. error → 'error', attempts++, backoff exponencial (2^n * 5s, tope 15 min)
  5. conflicto no resoluble → 'needs_resolution' + fila en sync_conflicts
```

Inbound (nube → local): el worker consulta cambios administrativos pendientes
(tarifas, usuarios, boxes, configuración, medios de pago) en `sync_outbox` del
lado cloud y los aplica en una transacción local + `sync_inbox` con
`operation_id` único. **Una tarifa remota se aplica localmente solo cuando su
aplicación quedó confirmada en la transacción local** (BR-017).

Cada evento de sincronización lleva: `operation_id` (UUIDv7), entidad y
`entity_id`, `device_id`, `establishment_id`, usuario responsable, timestamps
creación/sincronización, `version` (para config), estado.

Estados: `pending / in_process / synced / error / needs_resolution`.

Invariants: idempotencia por `operation_id` en ambos lados; nada se marca
`synced` sin confirmación; el outbox sobrevive reinicios (es una tabla);
reanudación automática tras corte de energía.

## 4. Resolución de conflictos (política por clase)

| Clase | Política |
|---|---|
| Operaciones económicas (estadías, pagos) | **Inmutables.** Se sincronizan como eventos append-only. Una corrección es un nuevo evento auditable que nunca sobrescribe el original. Nunca LWW. |
| Boxes | Constraint de ocupación única en ambas bases. Si dos terminales pelean el mismo box, una pierde dentro de la transacción local (nunca sale por red). Divergencias post-sync → fila de reconciliación visible. |
| Configuración (tarifas, boxes admin, settings) | Versionada. Cloud es autoridad para cambios administrativos: el local aplica versiones en orden y confirma recepción. Cambio local vs remoto sobre la misma versión → `needs_resolution` visible al admin. |
| Vehículos | Merge por campos con `version`; si hay edición concurrente no trivial → cola de resolución. |
| Anulaciones | Evento con prioridad: anula la estadía en cualquier réplica y se propaga. |

Los conflictos no resolubles automáticamente quedan visibles en la pantalla de
administración de sincronización (§G del pedido).

## 5. Autenticación offline

- **Nube:** Supabase Auth (email + contraseña) para el admin remoto y para el
  provisionamiento de empleados.
- **Local:** espejo `users` + `auth_credentials` (hash Argon2id, rol,
  permisos, estado activo) sincronizado desde la nube. El login local verifica
  contra la BD local — nunca contra Supabase — y emite un JWT local firmado con
  secreto del servidor. Sin Internet, los empleados habilitados entran igual.
- Desactivaciones y cambios de rol remotos llegan por Inbox al reconectar y
  aplican a partir de su confirmación local.
- Los accesos realizados offline se registran en `audit_logs` con
  `synced=false` y se sincronizan después.
- Hashes: Argon2id en local; en la nube bcrypt de Supabase Auth. El hash local
  se deriva en el momento de creación/reset (el admin setea la contraseña una
  vez y ambas partes la registran). No se almacenan contraseñas en texto plano.

## 6. Tiempo real

- **Nube:** Supabase Realtime (cambios en `parking_sessions`, `parking_boxes`).
- **LAN:** SSE (`/api/realtime/stream`) con `LISTEN/NOTIFY` de PostgreSQL vía
  trigger. El tablero de boxes usa el canal disponible según plano; fallback:
  polling cada 5 s.

## 7. Impresión térmica (58 mm, ESC/POS)

| Fase | Mecanismo | Alcance |
|---|---|---|
| v1 | `react-thermal-printer` + Web Serial API directa desde el navegador de la terminal | Imprime RP-T001 / POS-5890C por USB; cero infra extra |
| v2 | Servicio local de impresión (cola `print_jobs`) — worker que imprime y reporta estado | Reintentos, reimpresión desde historial, jobs pendientes al reconectar la impresora |

Todo trabajo de impresión se registra en `print_jobs` (estado, intentos, error).
Las plantillas de ticket son configurables (nombre, dirección, líneas extra).

## 8. PWA

- `manifest.json` instalable + Service Worker con precache del app shell
  (sirve la app aunque el DNS/Internet fallen, apuntando a la IP local).
- IndexedDB solo para caché de recursos y de la última pantalla; **todas las
  escrituras operativas van al servidor local por HTTP** (BR-015).

## 9. Estructura del código

```
src/
  app/                    # App Router (rutas por módulo, ver menú del pedido)
  features/               # un módulo por dominio: operación, boxes, tarifas,
    <modulo>/             # estadísticas, impresión, sync, admin
      ui/                 # componentes de presentación
      services/           # lógica de dominio (sin dependencia de React)
      schemas.ts          # validación Zod (frontend + backend)
  lib/
    db/                   # cliente local (pg), cliente Supabase, queries
    tariff-engine/        # motor de resolución de tarifas (puro + testeable)
    sync/                 # outbox/inbox/worker, mapeos de entidades
    auth/                 # sesión local + Supabase, permisos
    money/                # ARS en centavos, formateo
    dates/                # America/Argentina/Cordoba, DD/MM/YYYY, 24h
  db/
    migrations/           # SQL versionado (se aplica a local y a Supabase)
    rpc/                  # funciones transaccionales (ingreso, egreso, asignación)
```

Reglas de separación: servicios de dominio no importan React; toda mutación
crítica pasa por RPC de PostgreSQL; validación Zod en cliente y servidor.

## 10. Seguridad

- RLS habilitado en **ambas** bases con el mismo conjunto de políticas (rol vía
  JWT en nube, vía `SET LOCAL app.user_role` en local).
- Service keys de Supabase solo en server-side (nunca en el bundle).
- Local sin puertos abiertos a Internet; HTTPS en todo lo expuesto.
- Auditoría centralizada (`audit_logs`) con before/after.
- Sesiones con expiración y revocación; control de sesiones activas.
- Backups: locales diarios (30 días) + backups de Supabase.

## 11. Stack resumido

Next.js 16 (Cache Components) · React 19 · TS estricto · Supabase (Auth,
Realtime, Storage) · PostgreSQL 16 local · RPC/transacciones · RLS ·
Tailwind 4 + shadcn/ui · React Hook Form + Zod · TanStack Table · Recharts ·
date-fns (+ date-fns-tz) · react-thermal-printer · Docker Compose · PWA.
