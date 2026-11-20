# DATABASE.md — Modelo de datos

Esquema relacional único, aplicado idénticamente a **PostgreSQL local** y a
**Supabase Cloud** (migraciones versionadas compartidas; la nube añade solo el
esquema de Supabase Auth). Dinero: **enteros en centavos ARS**. Tiempo:
`timestamptz` UTC.

Convención: PK `uuid` (UUIDv7 en generación de aplicación), FKs explícitas,
`created_at/updated_at` en tablas administrativas, soft-delete mediante estado
(no borrows físicos de datos económicos).

## 1. Identidad y acceso

### profiles
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | = `auth.users.id` en nube; en local, espejo |
| full_name | text | |
| role | enum(admin, supervisor, employee) | rol operativo por defecto |
| is_active | boolean | desactivación, no borrado |
| version | integer | control de sync |
| hired_at / notes | | datos de empleado |

### auth_credentials (solo local + espejo sincronizado)
| user_id FK | password_hash (Argon2id) | password_updated_at | |

### role_permissions
`role`, `permission` (clave `module.action`), `allowed`. Fuente de la matriz de
BUSINESS_RULES §6. Consultable por la capa de permisos y usada por RLS.

### device_registry
`id uuid PK`, `name`, `type`, `last_seen_at`, `last_sync_at` — terminales del
establecimiento (para `device_id` del outbox y la pantalla de sincronización).

## 2. Catálogos

### vehicle_types
`id`, `name` (Auto/Utilitario/Camión/Moto/Bicicleta), `code`, `is_active`,
`sort_order`. Administrable (BR-001).

### vehicles
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| plate | text | normalizada (mayúsculas, sin espacios) |
| plate_is_placeholder | boolean | para unidades sin placa (BR-OPEN-13) |
| vehicle_type_id | FK | tipo habitual |
| notes | text | |
| created_by | FK profiles | |
| version | integer | sync/conflicto |

Índice único parcial: `(plate) WHERE NOT plate_is_placeholder`.

### parking_boxes
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| number | text | numeración editable |
| sector | text | ubicación/sector |
| allowed_vehicle_type_ids | uuid[] | qué puede estacionar |
| is_service_enabled | boolean | fuera de servicio (BR-019) |
| version | integer | |

**El estado de ocupación se DERIVA** (vista `box_status`): un box está
`occupied` si existe `parking_sessions` con `status='open'` y `box_id` suyo.
Nunca se guarda "ocupado" como campo editable (BR-019).

### payment_methods
`id`, `name`, `is_active`, `sort_order`. Semilla: Efectivo, Débito, Crédito,
Transferencia, Otros.

### parking_settings
`key` PK, `value jsonb`, `version`. Configuración global: nombre/dirección del
establecimiento, minutos de gracia, mínimos, política de fraccionamiento,
plantillas de ticket, etc.

## 3. Tarifas

### parking_tariffs
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| code | text | código interno (60, 61, 66, 67…) |
| vehicle_type_id | FK | |
| duration_minutes | integer | 60, 240, 480, 720, 1440… |
| duration_mode | enum(flat, per_block, per_hour) | modalidad (parametrizable) |
| amount_cents | bigint | ARS |
| name / description | text | |
| valid_from / valid_to | timestamptz | vigencia |
| is_active | boolean | estado |
| version | integer | |

Índice de resolución: `(vehicle_type_id, duration_minutes, is_active, valid_from)`.

### special_tariff_periods
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| name | text | "Evento especial" |
| starts_at / ends_at | timestamptz | vigencia (activación automática) |
| vehicle_type_ids | uuid[] | afectados |
| tariff_ids | uuid[] | tarifas afectadas (vacío = todas) |
| adjustment_type | enum(percent, fixed_amount) | |
| adjustment_value | bigint | 10% → 1000; fijo → centavos |
| priority | integer | menor número = mayor prioridad (BR-OPEN-03) |
| status | enum(scheduled, active, expired, cancelled) | |

No acumulativas: la resolución elige una sola por prioridad; el empate se
audita. Los valores base nunca cambian (BR-008).

### tariff_applications (snapshot por estadía)
Fila por estadía con la tarifa base elegida, la especial aplicada (si hubo) y el
desglose completo. **Escritura única al crear/cerrar la estadía; jamás se
retroactiva** (BR-006/BR-010).

## 4. Operación

### parking_sessions (estadías)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | UUIDv7 = idempotencia de operación |
| ticket_number | bigint | único por establecimiento, secuencial sin gaps |
| vehicle_id | FK | |
| vehicle_type_id | FK | snapshot del tipo al ingresar |
| box_id | FK | |
| entry_at / exit_at | timestamptz | |
| status | enum(open, closed, annulled) | |
| opened_by / closed_by | FK profiles | empleado responsable |
| entry_notes / exit_notes | text | observaciones |
| key_left | boolean | la llave quedó en el vehículo al ingresar (default false) |
| damage_notes | text | roturas o daños declarados al ingresar |
| duration_minutes | integer | al cerrar |
| base_amount_cents | bigint | tarifa base al momento |
| final_amount_cents | bigint | tras especial/ajustes |
| tariff_snapshot | jsonb | desglose completo (BR-010) |
| annulled_reason | text | si corresponde |
| device_id | FK | terminal que registró |
| created_at / synced_at | | |

**Restricción crítica de boxes** (BR-003):
```sql
CREATE UNIQUE INDEX uq_open_session_per_box
  ON parking_sessions (box_id) WHERE status = 'open';

CREATE UNIQUE INDEX uq_open_session_per_vehicle
  ON parking_sessions (vehicle_id) WHERE status = 'open';
```

Índices operativos y estadísticos: `(status)`, `(entry_at)`, `(exit_at)`,
`(vehicle_id)`, `(box_id, entry_at)`, `(opened_by, entry_at)`.

### cash_shifts (turnos de caja — BR-022, cierre manual)
| id | status open/closed | opened_by FK profiles | opened_at | closed_by FK profiles | closed_at | opening_notes / closing_notes | device_id |
Índice único parcial: `(status) WHERE status='open'` → **un solo turno abierto a la vez**.

### payments
`id`, `session_id` FK (unique — una estadía se paga una vez), `method_id`,
`amount_charged_cents`, `amount_calculated_cents`, `discount_cents`,
`surcharge_cents`, `paid_at`, `registered_by`, `device_id`,
**`shift_id` FK cash_shifts** (atribución exacta al turno para el cierre de caja).
Regla: no se puede cerrar dos veces (UNIQUE + RPC transaccional).

### ticket_sequences
`establishment_id`, `next_value bigint`. Consumo atómico en RPC:
```sql
UPDATE ticket_sequences SET next_value = next_value + 1
  WHERE establishment_id = $1
RETURNING next_value - 1;
```
(Toma el lock de fila → generación segura ante concurrencia, sin gaps.)

### print_jobs
`id`, `session_id`, `kind` (entry/reprint), `status`
(pending/printed/error), `attempts`, `last_error`, `printed_at`,
`terminal_id`. Reimpresiones crean job con `kind='reprint'` + auditoría.

## 5. Auditoría

### audit_logs
| Columna | Tipo |
|---|---|
| id | uuid PK |
| occurred_at | timestamptz |
| actor_id | FK profiles |
| action | text (`session.open`, `session.close`, `session.annul`, `tariff.update`, `vehicle.create`, `box.update`, `ticket.reprint`, `config.update`, `auth.login`…) |
| entity_type / entity_id | text / text |
| before / after | jsonb |
| device_id | FK |

Append-only: sin UPDATE/DELETE (revoke). Sincronizable como eventos inmutables.

## 6. Sincronización

### sync_outbox (local) / espejo en nube
`operation_id uuid PK (v7)`, `entity_type`, `entity_id`, `op`
(insert/update/annul), `payload jsonb`, `version`, `device_id`,
`created_at`, `status` (pending/in_process/synced/error/needs_resolution),
`attempts`, `last_error`, `synced_at`.

### sync_inbox
`operation_id` PK (idempotencia: reenvío no duplica), `applied_at`,
`payload`. Registro de recepción confirmada antes de aplicar (BR-017).

### sync_conflicts
`id`, `operation_id`, `entity_type`, `reason`, `local_payload`, `remote_payload`,
`status` (open/resolved), `resolved_by`, `resolved_at`.

### sync_runs (historial)
`id`, `direction`, `started_at`, `finished_at`, `ops_pushed`, `ops_pulled`,
`errors`, `trigger` (auto/manual).

## 7. RPC transaccionales (operaciones críticas)

| RPC | Garantía |
|---|---|
| `open_session(vehicle, box, tariff…)` | valida box libre + sin estadía abierta del vehículo + tarifa vigente → inserta sesión + outbox + ticket_number en **una transacción** |
| `close_session(session, payment…)` | valida `status='open'` → calcula/consolida snapshot, inserta pago (unique), libera box implícitamente, outbox — transacción única |
| `annul_session(session, reason)` | solo roles autorizados, siempre auditada, nunca DELETE |
| `apply_inbound_changes(batch)` | aplica Inbox de forma idempotente |

## 8. RLS (matriz resumida)

Ambas bases; rol resuelto por JWT (nube) o `SET LOCAL app.role` (local).

| Tabla | admin | supervisor | employee |
|---|---|---|---|
| profiles | all | read | read self |
| role_permissions / settings | all | read | — |
| vehicle_types / vehicles | all | read | read + insert |
| parking_boxes | all | read | read |
| parking_sessions | all | read | insert + read own; close por RPC |
| payments | all | read | insert por RPC |
| parking_tariffs / special_tariff_periods | all | read | read |
| print_jobs / audit_logs | all | read | insert (print/auth) |
| sync_* | all | read | — |

Los INSERT/UPDATE críticos van por RPC con guardas de rol dentro de la función
(`SECURITY DEFINER` con checks explícitos).

## 9. Migraciones

- Archivos SQL versionados en `db/migrations/NNN_*.sql`.
- Se aplican a local (docker exec / job de migración) y a Supabase (CLI) desde
  la misma fuente: cero drift de esquema.
- Seeds: tipos de vehículo, medios de pago, tarifario de referencia §3,
  settings iniciales. Los montos son datos, no código.
