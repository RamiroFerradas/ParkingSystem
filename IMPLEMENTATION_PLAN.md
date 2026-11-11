# IMPLEMENTATION_PLAN.md — Plan de implementación por etapas

Cada etapa termina con: compilación verde, tests correspondientes, corrección
de errores, documentación actualizada y un commit de unidad de trabajo (~400
líneas autorizadas por slice). Orden: **primero la operación diaria (C–F),
después la analítica (G), al final el endurecimiento (H).**

Prerrequisito transversal: responder BR-OPEN-01…13 ( BUSINESS_RULES §5) antes
de la Etapa E. El resto puede avanzar sin esperarlas.

## Etapa C — Autenticación, roles y configuración inicial

| Slice | Entregable | Criterio de aceptación |
|---|---|---|
| C1 | Docker Compose local: PostgreSQL 16 + app + migraciones + backup programado | `docker compose up` levanta todo; migraciones aplicadas; volumen persistente |
| C2 | Esquema base: perfiles/roles/permisos, catálogos, settings + seeds (tipos, medios de pago, tarifario de referencia) | Seeds cargados; RLS activo; consultas por psql verificadas |
| C3 | Login dual (nube Supabase Auth / local Argon2id), sesiones, middleware de rol | Login funciona con Internet y sin Internet; empleados desactivados no entran |
| C4 | Shell de la app: sidebar con menú §13, indicador de conectividad (online/offline/sincronizando/pendiente/error), PWA instalable | Navegación completa con rutas reales (nada de botones muertos) |

## Etapa D — Operación diaria (vehículos, boxes, ingreso/egreso)

| Slice | Entregable | Criterio de aceptación |
|---|---|---|
| D1 | Vehículos: alta rápida (minimizar clics), búsqueda por patente, reutilización de registro, tipos administrables | Crear vehículo en ≤3 interacciones; sin doble estadía abierta |
| D2 | Boxes: administración (número, sector, tipos, activación), vista de estado, historial por box | Estados derivados de estadías; no hay box "ocupado" sin estadía abierta |
| D3 | RPC `open_session` transaccional + pantalla de ingreso (fecha/hora automáticas, empleado, observaciones, número de ticket) | Test de concurrencia: 2 terminales pidiendo el mismo box → una gana, otra recibe error limpio |
| D4 | RPC `close_session` + pantalla de egreso (búsqueda por ticket/patente/box, desglose, medio de pago) | Cobro atómico; no se puede cerrar dos veces; box liberado |
| D5 | Estadías activas + historial con filtros (fecha, patente, tipo, box, empleado, estado, medio de pago), exportación | TanStack Table con filtros server-side; datos reales |
| D6 | Outbox emitido desde D3/D4 + pantalla de sincronización v1 (pendientes, errores, última sync) | Reinicio del servidor no pierde operaciones pendientes |

## Etapa E — Motor tarifario y tarifas especiales

| Slice | Entregable | Criterio de aceptación |
|---|---|---|
| E1 | Motor de resolución (librería pura): bloques, por hora, 24 h, mínimos, gracia, especiales por prioridad; snapshot completo | **Tests unitarios exhaustivos** con los casos del tarifario §3 + combinaciones de BR-OPEN respondidas |
| E2 | Integración en `close_session`: tarifa vigente al momento del egreso, snapshot inmutable | Cambiar una tarifa no altera estadías pasadas |
| E3 | Admin de tarifas: CRUD, vigencia, códigos (60/61/66/67 parametrizables), eventos con % o importe fijo, activación/desactivación por fecha | Ejemplo del pedido: 4800 + 10% = 5280; base nunca se modifica |
| E4 | Sincronización de tarifas (inbound): cambio remoto aplicado solo tras confirmación local | Modificación offline del admin llega y se aplica al reconectar, sin tocar snapshots |

## Etapa F — Impresión térmica

| Slice | Entregable | Criterio de aceptación |
|---|---|---|
| F1 | Plantillas 58 mm (ingreso/egreso) con datos configurables; render nativo de `react-thermal-printer` | Imprime legible en RP-T001/POS-5890C por Web Serial |
| F2 | Cola `print_jobs` + reimpresión desde historial (auditada) + manejo de errores/reintentos | Fallo de impresora → job pendiente visible, reintento manual no duplica el registro |

## Etapa G — Dashboard y estadísticas

| Slice | Entregable | Criterio de aceptación |
|---|---|---|
| G1 | Dashboard: ocupación en vivo, ingresos del día, comparativas hoy/ayer, semana/mes, por medio de pago | Datos reales, filtros por período, actualización tiempo real |
| G2 | Facturación: diaria/semanal/mensual/anual, evolución, comparativas, desgloses por vehículo/tarifa/empleado/medio | Recharts sobre queries con índices; export CSV/PDF |
| G3 | Concurrencia: ingresos/egresos por hora, heatmap día×hora, días/horarios pico | Heatmap interactivo |
| G4 | Estadísticas por vehículo y por box: participación, facturación, duración, ranking de boxes, utilización | Ranking + drill-down al historial del box |
| G5 | Estadísticas adicionales (recurrentes, permanencia, rotación, anulaciones, proyección) + acceso remoto del admin vía nube con fecha de última sync visible | Admin remoto ve datos sincronizados, nunca presentados como tiempo real si está desactualizado |

## Etapa H — Auditoría, seguridad, testing y optimización

| Slice | Entregable | Criterio de aceptación |
|---|---|---|
| H1 | Auditoría completa en todas las acciones relevantes + vista de auditoría para admin | Antes/después presentes; append-only |
| H2 | Hardening de sync: conflictos (`needs_resolution`), backoff, reanudación tras corte, historial `sync_runs` | Prueba I completa del pedido (12 pasos) ejecutada y documentada |
| H3 | Seguridad: revisión RLS, revocaciones, sesiones, backups probados (restore real) | Restore verificado; sin service keys en cliente |
| H4 | Tests de integración (ingreso/egreso), concurrencia (boxes, tickets) y permisos en CI local | Suite verde; cobertura del motor tarifario y de RPCs críticos |
| H5 | Optimización: EXPLAIN de consultas estadísticas, índices faltantes, bundle | Queries principales < 100 ms con datos de un mes |

## Escenarios de aceptación final (§J del pedido)

1. **Con Internet:** operación local + admin remoto consultando estadísticas y gestionando configuración desde otro dispositivo.
2. **Sin Internet:** operación normal desde todas las terminales de la LAN (vehículos, boxes, cobros, tickets, turnos); al volver la conexión, sincronización automática sin duplicados ni pérdida.

## Dependencias y riesgos

- **Bloqueante de E:** respuestas BR-OPEN-01…13. Mitigación: motor parametrizable desde E1 con defaults documentados.
- **Hardware a validar temprano (F):** una impresora real 58 mm para probar Web Serial desde las terminales (Chrome).
- **Infra a provisionar (C1):** PC servidor local dentro del establecimiento + cuenta Supabase.
