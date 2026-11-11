-- 003_shifts.sql — Turnos de caja manuales (BR-022: uno abre, otro cierra;
-- cierre manual, costumbre del establecimiento ~19:00)

CREATE TYPE cash_shift_status AS ENUM ('open', 'closed');

CREATE TABLE cash_shifts (
  id             uuid PRIMARY KEY,
  status         cash_shift_status NOT NULL DEFAULT 'open',
  opened_by      uuid NOT NULL REFERENCES profiles(id),
  opened_at      timestamptz NOT NULL DEFAULT now(),
  closed_by      uuid REFERENCES profiles(id),
  closed_at      timestamptz,
  opening_notes  text,
  closing_notes  text,
  device_id      uuid REFERENCES device_registry(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Un solo turno abierto a la vez
CREATE UNIQUE INDEX uq_open_cash_shift ON cash_shifts (status) WHERE status = 'open';
CREATE INDEX idx_cash_shifts_opened ON cash_shifts (opened_at);

-- Atribución de operaciones al turno
ALTER TABLE payments ADD COLUMN shift_id uuid REFERENCES cash_shifts(id);
ALTER TABLE parking_sessions ADD COLUMN shift_id uuid REFERENCES cash_shifts(id);
CREATE INDEX idx_payments_shift ON payments (shift_id);
CREATE INDEX idx_sessions_shift ON parking_sessions (shift_id);

-- Login por email (paridad con Supabase Auth)
ALTER TABLE profiles ADD COLUMN email text UNIQUE;
