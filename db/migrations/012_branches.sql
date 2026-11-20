-- 012_branches.sql — Multi-branch (sucursales).
--
-- Additive first, backfill second, tighten last. The cloud runner tracks applied
-- migrations in schema_migrations, and every statement here is also individually
-- guarded so a manual re-run is a no-op.
--
-- Design: docs at openspec/changes/multi-branch/design.md
-- All existing data is attached to a single "Principal" branch built from the
-- current parking_settings establishment row.

BEGIN;

-- ============ 1. Branch registry ============
CREATE TABLE IF NOT EXISTS branches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  code          text,
  address       text,
  tax_id        text,
  ticket_header text,
  timezone      text NOT NULL DEFAULT 'America/Argentina/Cordoba',
  is_active     boolean NOT NULL DEFAULT true,
  version       integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_name ON branches (lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_code ON branches (code) WHERE code IS NOT NULL;

-- ============ 2. Seed "Principal" from the current establishment row ============
INSERT INTO branches (name, code, address, tax_id, ticket_header)
SELECT
  coalesce(nullif(btrim(s.value->>'name'), ''), 'Principal'),
  'PRINCIPAL',
  s.value->>'address',
  s.value->>'tax_id',
  s.value->>'header'
FROM parking_settings s
WHERE s.key = 'establishment'
  AND NOT EXISTS (SELECT 1 FROM branches);

INSERT INTO branches (name, code)
SELECT 'Principal', 'PRINCIPAL'
WHERE NOT EXISTS (SELECT 1 FROM branches);

-- ============ 3. Membership + global master ============
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_master boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS user_branches (
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  branch_id  uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  role       user_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, branch_id)
);
CREATE INDEX IF NOT EXISTS idx_user_branches_branch ON user_branches (branch_id, role);

-- Every existing user keeps their current role in the Principal branch.
INSERT INTO user_branches (user_id, branch_id, role)
SELECT p.id, (SELECT id FROM branches ORDER BY created_at LIMIT 1), p.role
FROM profiles p
ON CONFLICT DO NOTHING;

-- ============ 4. Branch-scoped permission overrides ============
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS branch_id uuid;
UPDATE user_permissions
   SET branch_id = (SELECT id FROM branches ORDER BY created_at LIMIT 1)
 WHERE branch_id IS NULL;
ALTER TABLE user_permissions ALTER COLUMN branch_id SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'user_permissions'::regclass
       AND contype = 'p'
       AND pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id, permission)'
  ) THEN
    EXECUTE 'ALTER TABLE user_permissions DROP CONSTRAINT user_permissions_pkey';
    EXECUTE 'ALTER TABLE user_permissions ADD PRIMARY KEY (user_id, branch_id, permission)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_permissions_branch_fk') THEN
    EXECUTE 'ALTER TABLE user_permissions
               ADD CONSTRAINT user_permissions_branch_fk
               FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE';
  END IF;
END $$;

-- ============ 5. Branch partition of operational tables ============
DO $$
DECLARE
  v_branch uuid;
  t        text;
BEGIN
  SELECT id INTO v_branch FROM branches ORDER BY created_at LIMIT 1;

  FOREACH t IN ARRAY ARRAY[
    'parking_floors',
    'parking_boxes',
    'parking_sessions',
    'cash_shifts',
    'parking_tariffs',
    'special_tariff_periods',
    'device_registry'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS branch_id uuid', t);
    EXECUTE format('UPDATE %I SET branch_id = $1 WHERE branch_id IS NULL', t) USING v_branch;
    EXECUTE format('ALTER TABLE %I ALTER COLUMN branch_id SET NOT NULL', t);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_branch_fk') THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (branch_id) REFERENCES branches(id)',
        t, t || '_branch_fk'
      );
    END IF;
  END LOOP;
END $$;

-- audit_logs: NULL means a global master action; never an operational write.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS branch_id uuid;
UPDATE audit_logs
   SET branch_id = (SELECT id FROM branches ORDER BY created_at LIMIT 1)
 WHERE branch_id IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_branch_fk') THEN
    EXECUTE 'ALTER TABLE audit_logs
               ADD CONSTRAINT audit_logs_branch_fk
               FOREIGN KEY (branch_id) REFERENCES branches(id)';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_audit_branch ON audit_logs (branch_id, occurred_at);

-- ============ 6. Branch-scoped uniqueness ============
ALTER TABLE parking_floors DROP CONSTRAINT IF EXISTS parking_floors_name_key;
ALTER TABLE parking_boxes  DROP CONSTRAINT IF EXISTS parking_boxes_number_key;
ALTER TABLE parking_boxes  DROP CONSTRAINT IF EXISTS uq_parking_boxes_number;
DROP INDEX IF EXISTS uq_open_cash_shift;
DROP INDEX IF EXISTS uq_tariffs_code_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_floors_branch_name
  ON parking_floors (branch_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_boxes_branch_number
  ON parking_boxes (branch_id, number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_cash_shift_per_branch
  ON cash_shifts (branch_id) WHERE status = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS uq_tariffs_branch_code_active
  ON parking_tariffs (branch_id, code) WHERE code IS NOT NULL AND is_active;

CREATE INDEX IF NOT EXISTS idx_sessions_branch_entry ON parking_sessions (branch_id, entry_at);
CREATE INDEX IF NOT EXISTS idx_boxes_branch          ON parking_boxes (branch_id, number);
CREATE INDEX IF NOT EXISTS idx_tariffs_branch        ON parking_tariffs (branch_id, vehicle_type_id, is_active);

-- ============ 7. Ticket sequence per branch ============
DO $$
DECLARE
  v_next   bigint;
  v_branch uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'ticket_sequences'
       AND column_name = 'establishment_id'
  ) THEN
    SELECT next_value INTO v_next FROM ticket_sequences WHERE establishment_id = 'default';
    SELECT id INTO v_branch FROM branches ORDER BY created_at LIMIT 1;

    EXECUTE 'CREATE TABLE ticket_sequences_new (
      branch_id  uuid PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
      next_value bigint NOT NULL DEFAULT 1
    )';
    EXECUTE format(
      'INSERT INTO ticket_sequences_new (branch_id, next_value)
       SELECT b.id, CASE WHEN b.id = %L THEN %s ELSE 1 END FROM branches b',
      v_branch, coalesce(v_next, 1)
    );

    EXECUTE 'DROP TABLE ticket_sequences';
    EXECUTE 'ALTER TABLE ticket_sequences_new RENAME TO ticket_sequences';
  END IF;
END $$;

-- ============ 8. box_status carries the branch ============
DROP VIEW IF EXISTS box_status;
CREATE VIEW box_status AS
SELECT
  b.id,
  b.branch_id,
  b.number,
  b.sector,
  b.is_service_enabled,
  f.id         AS floor_id,
  f.name       AS floor_name,
  f.sort_order AS floor_sort,
  CASE
    WHEN NOT b.is_service_enabled THEN 'out_of_service'
    WHEN s.id IS NOT NULL         THEN 'occupied'
    ELSE 'available'
  END AS status,
  s.id  AS session_id,
  v.id  AS vehicle_id,
  v.plate,
  vt.name AS vehicle_type_name,
  s.entry_at
FROM parking_boxes b
JOIN parking_floors f   ON f.id = b.floor_id AND f.is_active
JOIN branches br        ON br.id = b.branch_id AND br.is_active
LEFT JOIN parking_sessions s ON s.box_id = b.id AND s.status = 'open'
LEFT JOIN vehicles v         ON v.id = s.vehicle_id
LEFT JOIN vehicle_types vt   ON vt.id = s.vehicle_type_id
WHERE b.is_active;

-- ============ 9. Shift trigger validates the branch ============
CREATE OR REPLACE FUNCTION require_open_shift() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_shift_branch uuid;
BEGIN
  IF NEW.status = 'open' THEN
    IF NEW.shift_id IS NULL THEN
      RAISE EXCEPTION 'No hay turno de caja abierto';
    END IF;
    SELECT branch_id INTO v_shift_branch FROM cash_shifts WHERE id = NEW.shift_id;
    IF v_shift_branch IS DISTINCT FROM NEW.branch_id THEN
      RAISE EXCEPTION 'El turno de caja no pertenece a la sucursal de la estadía';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ============ 10. Branch-aware fee calculation ============
DROP FUNCTION IF EXISTS calc_fee_breakdown(uuid, integer);
CREATE OR REPLACE FUNCTION calc_fee_breakdown(
  p_branch_id       uuid,
  p_vehicle_type_id uuid,
  p_elapsed_minutes integer
) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_block       record;
  v_hourly      bigint;
  v_extra_hours integer;
  v_total       bigint;
BEGIN
  SELECT id, code, name, duration_minutes, amount_cents INTO v_block
  FROM parking_tariffs
  WHERE branch_id = p_branch_id
    AND vehicle_type_id = p_vehicle_type_id
    AND is_active
    AND duration_mode = 'flat'
    AND duration_minutes <= p_elapsed_minutes
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY duration_minutes DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT id, code, name, duration_minutes, amount_cents INTO v_block
    FROM parking_tariffs
    WHERE branch_id = p_branch_id
      AND vehicle_type_id = p_vehicle_type_id
      AND is_active AND duration_mode = 'flat'
      AND (valid_to IS NULL OR valid_to > now())
    ORDER BY duration_minutes ASC
    LIMIT 1;
    v_extra_hours := 0;
  ELSE
    v_extra_hours := ceil((p_elapsed_minutes - v_block.duration_minutes)::numeric / 60)::integer;
  END IF;

  IF v_block.id IS NULL THEN
    RAISE EXCEPTION 'Sin tarifa activa para el tipo de vehículo en esta sucursal';
  END IF;

  SELECT amount_cents INTO v_hourly
  FROM parking_tariffs
  WHERE branch_id = p_branch_id
    AND vehicle_type_id = p_vehicle_type_id
    AND is_active AND duration_mode = 'flat'
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY duration_minutes ASC
  LIMIT 1;

  v_total := v_block.amount_cents + v_extra_hours * v_hourly;

  RETURN jsonb_build_object(
    'block', jsonb_build_object(
      'tariff_id', v_block.id,
      'code', v_block.code,
      'name', v_block.name,
      'duration_minutes', v_block.duration_minutes,
      'amount_cents', v_block.amount_cents
    ),
    'extra_hours', v_extra_hours,
    'hourly_amount_cents', v_hourly,
    'total_cents', v_total
  );
END $$;

-- ============ 11. open_session: branch derived from the box ============
CREATE OR REPLACE FUNCTION open_session(
  p_session_id       uuid,
  p_plate            text,
  p_vehicle_type_id  uuid,
  p_box_id           uuid,
  p_actor_id         uuid,
  p_entry_notes      text DEFAULT NULL,
  p_device_id        uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_vehicle     uuid;
  v_ticket      bigint;
  v_shift       uuid;
  v_plate_norm  text := upper(regexp_replace(p_plate, '\s', '', 'g'));
  v_box         record;
BEGIN
  IF v_plate_norm IS NULL OR length(v_plate_norm) = 0 THEN
    RAISE EXCEPTION 'Patente obligatoria';
  END IF;

  SELECT b.is_service_enabled, b.is_active, b.number, b.branch_id, br.is_active AS branch_active
    INTO v_box
    FROM parking_boxes b
    JOIN branches br ON br.id = b.branch_id
   WHERE b.id = p_box_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Box inexistente';
  END IF;
  IF NOT v_box.branch_active THEN
    RAISE EXCEPTION 'La sucursal está inactiva';
  END IF;
  IF NOT v_box.is_active THEN
    RAISE EXCEPTION 'El box % está dado de baja', v_box.number;
  END IF;
  IF NOT v_box.is_service_enabled THEN
    RAISE EXCEPTION 'El box % está fuera de servicio', v_box.number;
  END IF;

  SELECT id INTO v_vehicle FROM vehicles
   WHERE plate = v_plate_norm AND NOT plate_is_placeholder;
  IF v_vehicle IS NULL THEN
    INSERT INTO vehicles (plate, vehicle_type_id, created_by)
    VALUES (v_plate_norm, p_vehicle_type_id, p_actor_id)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_vehicle;
    IF v_vehicle IS NULL THEN
      SELECT id INTO v_vehicle FROM vehicles WHERE plate = v_plate_norm;
    END IF;
  END IF;

  -- Ticket sequence of this branch only.
  UPDATE ticket_sequences
     SET next_value = next_value + 1
   WHERE branch_id = v_box.branch_id
   RETURNING next_value - 1 INTO v_ticket;
  IF v_ticket IS NULL THEN
    INSERT INTO ticket_sequences (branch_id, next_value)
    VALUES (v_box.branch_id, 2)
    ON CONFLICT (branch_id) DO UPDATE SET next_value = ticket_sequences.next_value + 1
    RETURNING next_value - 1 INTO v_ticket;
  END IF;

  SELECT id INTO v_shift
    FROM cash_shifts
   WHERE status = 'open' AND branch_id = v_box.branch_id
   LIMIT 1;

  BEGIN
    INSERT INTO parking_sessions
      (id, ticket_number, vehicle_id, vehicle_type_id, box_id, branch_id,
       opened_by, entry_notes, device_id, shift_id)
    VALUES
      (p_session_id, v_ticket, v_vehicle, p_vehicle_type_id, p_box_id, v_box.branch_id,
       p_actor_id, p_entry_notes, p_device_id, v_shift);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'El box ya está ocupado o el vehículo ya tiene una estadía abierta';
  END;

  INSERT INTO sync_outbox (operation_id, entity_type, entity_id, op, payload, device_id)
  VALUES (gen_random_uuid(), 'parking_session', p_session_id::text, 'insert',
          jsonb_build_object(
            'id', p_session_id,
            'ticket_number', v_ticket::text,
            'vehicle_id', v_vehicle,
            'vehicle_type_id', p_vehicle_type_id,
            'box_id', p_box_id,
            'branch_id', v_box.branch_id,
            'entry_at', now(),
            'status', 'open',
            'opened_by', p_actor_id,
            'entry_notes', p_entry_notes,
            'shift_id', v_shift),
          p_device_id);

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'ticket_number', v_ticket,
    'vehicle_id', v_vehicle,
    'box_id', p_box_id,
    'branch_id', v_box.branch_id,
    'shift_id', v_shift
  );
END $$;

-- ============ 12. close_session: branch-aware tariff ============
CREATE OR REPLACE FUNCTION close_session(
  p_session_id       uuid,
  p_method_id        uuid,
  p_actor_id         uuid,
  p_discount_cents   bigint DEFAULT 0,
  p_surcharge_cents  bigint DEFAULT 0,
  p_exit_notes       text DEFAULT NULL,
  p_device_id        uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_session  parking_sessions;
  v_elapsed  integer;
  v_fee      jsonb;
  v_total    bigint;
  v_final    bigint;
  v_shift    uuid;
BEGIN
  SELECT * INTO v_session FROM parking_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estadía no encontrada';
  END IF;
  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'La estadía ya está cerrada';
  END IF;

  v_elapsed := GREATEST(0, ceil(EXTRACT(EPOCH FROM (now() - v_session.entry_at)) / 60)::integer);
  v_fee     := calc_fee_breakdown(v_session.branch_id, v_session.vehicle_type_id, v_elapsed);
  v_total   := (v_fee->>'total_cents')::bigint;
  v_final   := v_total - p_discount_cents + p_surcharge_cents;

  UPDATE parking_sessions
     SET exit_at = now(),
         status = 'closed',
         closed_by = p_actor_id,
         duration_minutes = v_elapsed,
         base_amount_cents = v_total,
         final_amount_cents = v_final,
         tariff_snapshot = v_fee,
         exit_notes = p_exit_notes
   WHERE id = p_session_id;

  SELECT id INTO v_shift
    FROM cash_shifts
   WHERE status = 'open' AND branch_id = v_session.branch_id
   LIMIT 1;

  INSERT INTO payments
    (id, session_id, method_id, amount_charged_cents, amount_calculated_cents,
     discount_cents, surcharge_cents, registered_by, device_id, shift_id)
  VALUES
    (gen_random_uuid(), p_session_id, p_method_id, v_final, v_total,
     p_discount_cents, p_surcharge_cents, p_actor_id, p_device_id, v_shift);

  INSERT INTO tariff_applications (id, session_id, snapshot)
  VALUES (gen_random_uuid(), p_session_id, v_fee);

  INSERT INTO sync_outbox (operation_id, entity_type, entity_id, op, payload, device_id)
  VALUES (gen_random_uuid(), 'parking_session', p_session_id::text, 'update',
          to_jsonb(v_session) || jsonb_build_object(
            'exit_at', now(),
            'status', 'closed',
            'closed_by', p_actor_id,
            'duration_minutes', v_elapsed,
            'base_amount_cents', v_total,
            'final_amount_cents', v_final,
            'exit_notes', p_exit_notes),
          p_device_id);

  INSERT INTO audit_logs (id, actor_id, branch_id, action, entity_type, entity_id, after)
  VALUES (gen_random_uuid(), p_actor_id, v_session.branch_id, 'session.close',
          'parking_session', p_session_id::text, v_fee);

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'duration_minutes', v_elapsed,
    'total_cents', v_total,
    'final_cents', v_final,
    'breakdown', v_fee
  );
END $$;

-- ============ 13. quote_exit: branch-aware ============
CREATE OR REPLACE FUNCTION quote_exit(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_session record;
BEGIN
  SELECT vehicle_type_id, entry_at, status, branch_id INTO v_session
  FROM parking_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estadía no encontrada';
  END IF;
  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'La estadía ya está cerrada';
  END IF;
  RETURN jsonb_build_object(
    'elapsed_minutes', GREATEST(0, ceil(EXTRACT(EPOCH FROM (now() - v_session.entry_at)) / 60)::integer),
    'fee', calc_fee_breakdown(v_session.branch_id, v_session.vehicle_type_id,
           GREATEST(0, ceil(EXTRACT(EPOCH FROM (now() - v_session.entry_at)) / 60)::integer))
  );
END $$;

-- ============ 14. Master consolidated dashboard (read-only) ============
CREATE OR REPLACE FUNCTION master_dashboard()
RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.name), '[]'::jsonb)
  FROM (
    SELECT
      b.id,
      b.name,
      b.is_active,
      coalesce(occ.occupied, 0)::int    AS occupied_boxes,
      coalesce(occ.total, 0)::int       AS total_boxes,
      sh.id                             AS open_shift_id,
      coalesce(paid.cents, 0)::bigint   AS collected_today_cents,
      coalesce(live.cents, 0)::bigint   AS in_progress_cents
    FROM branches b
    LEFT JOIN (
      SELECT branch_id,
             count(*) FILTER (WHERE status = 'occupied') AS occupied,
             count(*) AS total
      FROM box_status
      GROUP BY branch_id
    ) occ ON occ.branch_id = b.id
    LEFT JOIN cash_shifts sh
      ON sh.branch_id = b.id AND sh.status = 'open'
    LEFT JOIN (
      SELECT s.branch_id,
             sum(p.amount_charged_cents) AS cents
      FROM payments p
      JOIN parking_sessions s ON s.id = p.session_id
      WHERE p.paid_at >= (date_trunc('day', now() AT TIME ZONE 'America/Argentina/Cordoba')
                          AT TIME ZONE 'America/Argentina/Cordoba')
      GROUP BY s.branch_id
    ) paid ON paid.branch_id = b.id
    LEFT JOIN (
      SELECT s.branch_id,
             sum((calc_fee_breakdown(
                    s.branch_id, s.vehicle_type_id,
                    GREATEST(0, ceil(EXTRACT(EPOCH FROM (now() - s.entry_at)) / 60)::integer)
                  )->>'total_cents')::bigint) AS cents
      FROM parking_sessions s
      WHERE s.status = 'open'
      GROUP BY s.branch_id
    ) live ON live.branch_id = b.id
  ) t;
$$;

COMMIT;
