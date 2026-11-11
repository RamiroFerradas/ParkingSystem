-- 001_init.sql — Core schema (identidad, catálogos, tarifas, operación, auditoría, sync)
-- Aplica idénticamente a PostgreSQL local y Supabase Cloud.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============ ENUMS ============
CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'employee');
CREATE TYPE tariff_duration_mode AS ENUM ('flat', 'per_block', 'per_hour');
CREATE TYPE special_adjustment_type AS ENUM ('percent', 'fixed_amount');
CREATE TYPE special_status AS ENUM ('scheduled', 'active', 'expired', 'cancelled');
CREATE TYPE session_status AS ENUM ('open', 'closed', 'annulled');
CREATE TYPE print_job_kind AS ENUM ('entry', 'reprint');
CREATE TYPE print_job_status AS ENUM ('pending', 'printed', 'error');
CREATE TYPE sync_status AS ENUM ('pending', 'in_process', 'synced', 'error', 'needs_resolution');
CREATE TYPE sync_op AS ENUM ('insert', 'update', 'annul');

-- ============ IDENTIDAD Y ACCESO ============
CREATE TABLE profiles (
  id          uuid PRIMARY KEY,
  full_name   text NOT NULL,
  role        user_role NOT NULL DEFAULT 'employee',
  is_active   boolean NOT NULL DEFAULT true,
  hired_at    date,
  notes       text,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Hash Argon2id local (espejo sincronizado desde la nube; nunca texto plano)
CREATE TABLE auth_credentials (
  user_id             uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  password_hash       text NOT NULL,
  password_updated_at timestamptz NOT NULL DEFAULT now()
);

-- Fuente de la matriz de permisos (BUSINESS_RULES §6)
CREATE TABLE role_permissions (
  role       user_role NOT NULL,
  permission text NOT NULL,          -- clave 'modulo.accion' (ej. 'session.close')
  allowed    boolean NOT NULL DEFAULT true,
  PRIMARY KEY (role, permission)
);

CREATE TABLE device_registry (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  type         text NOT NULL DEFAULT 'terminal',
  last_seen_at timestamptz,
  last_sync_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============ CATÁLOGOS ============
CREATE TABLE vehicle_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE,
  name       text NOT NULL UNIQUE,
  is_active  boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE vehicles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate                text,
  plate_is_placeholder boolean NOT NULL DEFAULT false,
  vehicle_type_id      uuid NOT NULL REFERENCES vehicle_types(id),
  notes                text,
  created_by           uuid REFERENCES profiles(id),
  version              integer NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicles_plate_required CHECK (plate_is_placeholder OR plate IS NOT NULL)
);
-- Normalización de patente (mayúsculas, sin espacios) al insertar/actualizar
CREATE UNIQUE INDEX uq_vehicles_plate ON vehicles (plate) WHERE NOT plate_is_placeholder;
CREATE INDEX idx_vehicles_plate_trgm ON vehicles USING gin (plate gin_trgm_ops);

CREATE TABLE parking_boxes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number                  text NOT NULL UNIQUE,
  sector                  text,
  allowed_vehicle_type_ids uuid[] NOT NULL DEFAULT '{}',
  is_service_enabled      boolean NOT NULL DEFAULT true,
  version                 integer NOT NULL DEFAULT 1,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_methods (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE,
  name       text NOT NULL UNIQUE,
  is_active  boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE parking_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  version    integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ TARIFAS (productos cargables por el admin — BR-007) ============
CREATE TABLE parking_tariffs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text,             -- código interno OPCIONAL (35, 40, 60...)
  name             text NOT NULL,
  description      text,
  vehicle_type_id  uuid NOT NULL REFERENCES vehicle_types(id),
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  duration_mode    tariff_duration_mode NOT NULL DEFAULT 'flat',
  amount_cents     bigint NOT NULL CHECK (amount_cents >= 0),
  valid_from       timestamptz NOT NULL DEFAULT now(),
  valid_to         timestamptz,
  is_active        boolean NOT NULL DEFAULT true,
  version          integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tariffs_resolve
  ON parking_tariffs (vehicle_type_id, duration_minutes, is_active, valid_from);
CREATE UNIQUE INDEX uq_tariffs_code_active ON parking_tariffs (code)
  WHERE code IS NOT NULL AND is_active;

CREATE TABLE special_tariff_periods (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  description      text,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL CHECK (ends_at > starts_at),
  vehicle_type_ids uuid[] NOT NULL DEFAULT '{}',   -- vacío = todos
  tariff_ids       uuid[] NOT NULL DEFAULT '{}',   -- vacío = todas
  adjustment_type  special_adjustment_type NOT NULL,
  adjustment_value bigint NOT NULL CHECK (adjustment_value > 0),
  priority         integer NOT NULL DEFAULT 100,   -- menor número = mayor prioridad
  status           special_status NOT NULL DEFAULT 'scheduled',
  version          integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_special_periods_window ON special_tariff_periods (starts_at, ends_at, status);

-- ============ OPERACIÓN ============
CREATE TABLE parking_sessions (
  id                 uuid PRIMARY KEY,          -- UUIDv7 generado por la app (idempotencia)
  ticket_number      bigint NOT NULL UNIQUE,
  vehicle_id         uuid NOT NULL REFERENCES vehicles(id),
  vehicle_type_id    uuid NOT NULL REFERENCES vehicle_types(id),
  box_id             uuid NOT NULL REFERENCES parking_boxes(id),
  entry_at           timestamptz NOT NULL DEFAULT now(),
  exit_at            timestamptz,
  status             session_status NOT NULL DEFAULT 'open',
  opened_by          uuid NOT NULL REFERENCES profiles(id),
  closed_by          uuid REFERENCES profiles(id),
  entry_notes        text,
  exit_notes         text,
  duration_minutes   integer,
  base_amount_cents  bigint,
  final_amount_cents bigint,
  tariff_snapshot    jsonb,                     -- desglose completo e inmutable (BR-010)
  annulled_reason    text,
  device_id          uuid REFERENCES device_registry(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  synced_at          timestamptz
);
-- BR-003: un box no puede tener dos estadías abiertas; BR-002: un vehículo tampoco.
CREATE UNIQUE INDEX uq_open_session_per_box     ON parking_sessions (box_id)     WHERE status = 'open';
CREATE UNIQUE INDEX uq_open_session_per_vehicle ON parking_sessions (vehicle_id) WHERE status = 'open';
CREATE INDEX idx_sessions_entry      ON parking_sessions (entry_at);
CREATE INDEX idx_sessions_exit       ON parking_sessions (exit_at);
CREATE INDEX idx_sessions_status     ON parking_sessions (status);
CREATE INDEX idx_sessions_box_entry  ON parking_sessions (box_id, entry_at);
CREATE INDEX idx_sessions_operator   ON parking_sessions (opened_by, entry_at);
CREATE INDEX idx_sessions_vehicle    ON parking_sessions (vehicle_id, entry_at);

CREATE TABLE payments (
  id                    uuid PRIMARY KEY,
  session_id            uuid NOT NULL UNIQUE REFERENCES parking_sessions(id),
  method_id             uuid NOT NULL REFERENCES payment_methods(id),
  amount_charged_cents  bigint NOT NULL CHECK (amount_charged_cents >= 0),
  amount_calculated_cents bigint NOT NULL,
  discount_cents        bigint NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  surcharge_cents       bigint NOT NULL DEFAULT 0 CHECK (surcharge_cents >= 0),
  paid_at               timestamptz NOT NULL DEFAULT now(),
  registered_by         uuid NOT NULL REFERENCES profiles(id),
  device_id             uuid REFERENCES device_registry(id)
);

-- Snapshot tarifario por estadía (escritura única; jamás retroactivo — BR-006/BR-010)
CREATE TABLE tariff_applications (
  id                uuid PRIMARY KEY,
  session_id        uuid NOT NULL UNIQUE REFERENCES parking_sessions(id),
  tariff_id         uuid REFERENCES parking_tariffs(id),
  special_period_id uuid REFERENCES special_tariff_periods(id),
  snapshot          jsonb NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Numeración de tickets: consumo atómico por UPDATE con lock de fila (sin gaps)
CREATE TABLE ticket_sequences (
  establishment_id text NOT NULL DEFAULT 'default',
  next_value       bigint NOT NULL DEFAULT 1,
  PRIMARY KEY (establishment_id)
);

CREATE TABLE print_jobs (
  id          uuid PRIMARY KEY,
  session_id  uuid NOT NULL REFERENCES parking_sessions(id),
  kind        print_job_kind NOT NULL,
  status      print_job_status NOT NULL DEFAULT 'pending',
  attempts    integer NOT NULL DEFAULT 0,
  last_error  text,
  printed_at  timestamptz,
  terminal_id uuid REFERENCES device_registry(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_print_jobs_status ON print_jobs (status, created_at);

-- ============ AUDITORÍA (append-only — BR-013) ============
CREATE TABLE audit_logs (
  id          uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid REFERENCES profiles(id),
  action      text NOT NULL,               -- 'session.open', 'tariff.update', ...
  entity_type text NOT NULL,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  device_id   uuid REFERENCES device_registry(id),
  synced      boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id, occurred_at);
CREATE INDEX idx_audit_actor  ON audit_logs (actor_id, occurred_at);
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;

-- ============ SINCRONIZACIÓN (Outbox/Inbox — ARCHITECTURE §3) ============
CREATE TABLE sync_outbox (
  operation_id uuid PRIMARY KEY,           -- UUIDv7; idempotencia
  entity_type  text NOT NULL,
  entity_id    text NOT NULL,
  op           sync_op NOT NULL,
  payload      jsonb NOT NULL,
  version      integer,
  device_id    uuid REFERENCES device_registry(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  status       sync_status NOT NULL DEFAULT 'pending',
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  synced_at    timestamptz
);
CREATE INDEX idx_outbox_status ON sync_outbox (status, created_at);

CREATE TABLE sync_inbox (
  operation_id uuid PRIMARY KEY,           -- reenvío no duplica
  entity_type  text NOT NULL,
  payload      jsonb NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  applied_at   timestamptz
);

CREATE TABLE sync_conflicts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id   uuid NOT NULL REFERENCES sync_outbox(operation_id),
  entity_type    text NOT NULL,
  reason         text NOT NULL,
  local_payload  jsonb,
  remote_payload jsonb,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by    uuid REFERENCES profiles(id),
  resolved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sync_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction   text NOT NULL CHECK (direction IN ('push', 'pull')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ops_pushed  integer NOT NULL DEFAULT 0,
  ops_pulled  integer NOT NULL DEFAULT 0,
  errors      integer NOT NULL DEFAULT 0,
  trigger     text NOT NULL DEFAULT 'auto'
);

-- ============ VISTA DE ESTADO DE BOXES (BR-019: derivado, nunca editable) ============
CREATE VIEW box_status AS
SELECT
  b.id,
  b.number,
  b.sector,
  b.is_service_enabled,
  CASE
    WHEN NOT b.is_service_enabled THEN 'out_of_service'
    WHEN s.id IS NOT NULL THEN 'occupied'
    ELSE 'available'
  END AS status,
  s.id  AS session_id,
  v.id  AS vehicle_id,
  v.plate,
  vt.name AS vehicle_type_name,
  s.entry_at
FROM parking_boxes b
LEFT JOIN parking_sessions s ON s.box_id = b.id AND s.status = 'open'
LEFT JOIN vehicles v        ON v.id = s.vehicle_id
LEFT JOIN vehicle_types vt  ON vt.id = s.vehicle_type_id;

-- ============ updated_at automático ============
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated       BEFORE UPDATE ON profiles        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_vehicles_updated       BEFORE UPDATE ON vehicles        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_boxes_updated          BEFORE UPDATE ON parking_boxes   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_settings_updated       BEFORE UPDATE ON parking_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tariffs_updated        BEFORE UPDATE ON parking_tariffs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_special_periods_update BEFORE UPDATE ON special_tariff_periods FOR EACH ROW EXECUTE FUNCTION set_updated_at();
