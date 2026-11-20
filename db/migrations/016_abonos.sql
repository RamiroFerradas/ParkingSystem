-- 016_abonos.sql — Abono mensual (entra y sale cuando quiere)
--
-- 1) parking_tariffs.kind: 'hourly' (bloques por hora) | 'monthly' (abono).
--    Las tarifas mensuales no tienen duración y el cálculo por hora las ignora.
-- 2) subscriptions: abono vigente por patente y sucursal.
-- 3) parking_sessions.subscription_id: la estadía queda marcada como abonada.
-- 4) payments: branch_id + concept + session_id opcional, para poder cobrar un
--    abono en el turno sin una estadía asociada.
-- 5) Funciones: calc_fee_breakdown recupera la vigencia (010) y suma sucursal;
--    close_session y quote_exit cobran 0 para una estadía abonada.

BEGIN;

-- ============ 1. Tipo de producto tarifario ============
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE t.typname = 'tariff_kind' AND n.nspname = current_schema()
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.tariff_kind AS ENUM (''hourly'', ''monthly'')',
      current_schema()
    );
  END IF;
END $$;

ALTER TABLE parking_tariffs
  ADD COLUMN IF NOT EXISTS kind tariff_kind NOT NULL DEFAULT 'hourly';

ALTER TABLE parking_tariffs
  ALTER COLUMN duration_minutes DROP NOT NULL;

ALTER TABLE parking_tariffs
  DROP CONSTRAINT IF EXISTS tariffs_kind_duration;
ALTER TABLE parking_tariffs
  ADD CONSTRAINT tariffs_kind_duration CHECK (
    (kind = 'hourly' AND duration_minutes IS NOT NULL AND duration_minutes > 0)
    OR (kind = 'monthly' AND duration_minutes IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_tariffs_branch_kind
  ON parking_tariffs (branch_id, vehicle_type_id, kind, is_active);

-- ============ 2. Abonos ============
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE t.typname = 'subscription_status' AND n.nspname = current_schema()
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.subscription_status AS ENUM (''active'', ''cancelled'')',
      current_schema()
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    uuid NOT NULL REFERENCES branches(id),
  vehicle_id   uuid NOT NULL REFERENCES vehicles(id),
  tariff_id    uuid NOT NULL REFERENCES parking_tariffs(id),
  starts_on    date NOT NULL,
  ends_on      date NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  status       subscription_status NOT NULL DEFAULT 'active',
  payment_id   uuid REFERENCES payments(id),
  notes        text,
  created_by   uuid NOT NULL REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CONSTRAINT subscriptions_period CHECK (ends_on >= starts_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_subscription
  ON subscriptions (branch_id, vehicle_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_subscriptions_period
  ON subscriptions (branch_id, status, ends_on);

ALTER TABLE parking_sessions
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES subscriptions(id);

CREATE INDEX IF NOT EXISTS idx_sessions_subscription
  ON parking_sessions (subscription_id);

-- ============ 3. Pagos sin estadía (abono) ============
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS concept text NOT NULL DEFAULT 'session';

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_concept_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_concept_check CHECK (concept IN ('session', 'subscription'));

ALTER TABLE payments
  ALTER COLUMN session_id DROP NOT NULL;

UPDATE payments p
   SET branch_id = s.branch_id
  FROM parking_sessions s
 WHERE s.id = p.session_id AND p.branch_id IS NULL;

DELETE FROM payments WHERE branch_id IS NULL;

ALTER TABLE payments
  ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_branch_paid
  ON payments (branch_id, paid_at);

-- ============ 4. Cálculo por hora: vigencia + sucursal ============
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
  v_now         timestamptz := now();
BEGIN
  -- Bloque que cubre la estadía: el mayor con duración <= elapsed.
  SELECT id, code, name, duration_minutes, amount_cents INTO v_block
  FROM parking_tariffs
  WHERE branch_id = p_branch_id
    AND vehicle_type_id = p_vehicle_type_id
    AND is_active
    AND kind = 'hourly'
    AND duration_mode = 'flat'
    AND valid_from <= v_now
    AND (valid_to IS NULL OR valid_to > v_now)
    AND duration_minutes <= p_elapsed_minutes
  ORDER BY duration_minutes DESC,
           (valid_to IS NOT NULL) DESC,
           valid_from DESC,
           updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Mínimo cobrado: primer bloque completo, sin tolerancia (BR-OPEN-04).
    SELECT id, code, name, duration_minutes, amount_cents INTO v_block
    FROM parking_tariffs
    WHERE branch_id = p_branch_id
      AND vehicle_type_id = p_vehicle_type_id
      AND is_active
      AND kind = 'hourly'
      AND duration_mode = 'flat'
      AND valid_from <= v_now
      AND (valid_to IS NULL OR valid_to > v_now)
    ORDER BY duration_minutes ASC,
             (valid_to IS NOT NULL) DESC,
             valid_from DESC,
             updated_at DESC
    LIMIT 1;
    v_extra_hours := 0;
  ELSE
    v_extra_hours := ceil((p_elapsed_minutes - v_block.duration_minutes)::numeric / 60)::integer;
  END IF;

  IF v_block.id IS NULL THEN
    RAISE EXCEPTION 'Sin tarifa activa para el tipo de vehículo en esta sucursal';
  END IF;

  -- Hora extra al bloque mínimo vigente (misma precedencia temporal > fija).
  SELECT amount_cents INTO v_hourly
  FROM parking_tariffs
  WHERE branch_id = p_branch_id
    AND vehicle_type_id = p_vehicle_type_id
    AND is_active
    AND kind = 'hourly'
    AND duration_mode = 'flat'
    AND valid_from <= v_now
    AND (valid_to IS NULL OR valid_to > v_now)
  ORDER BY duration_minutes ASC,
           (valid_to IS NOT NULL) DESC,
           valid_from DESC,
           updated_at DESC
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

-- ============ 5. Ingreso: detecta el abono vigente ============
CREATE OR REPLACE FUNCTION open_session(
  p_session_id       uuid,
  p_plate            text,
  p_vehicle_type_id  uuid,
  p_box_id           uuid,
  p_actor_id         uuid,
  p_entry_notes      text DEFAULT NULL,
  p_device_id        uuid DEFAULT NULL,
  p_key_left         boolean DEFAULT false,
  p_damage_notes     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_vehicle      uuid;
  v_ticket       bigint;
  v_shift        uuid;
  v_subscription uuid;
  v_plate_norm   text := upper(regexp_replace(p_plate, '\s', '', 'g'));
  v_today        date := (now() AT TIME ZONE 'America/Argentina/Cordoba')::date;
  v_box          record;
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
      SELECT id FROM vehicles WHERE plate = v_plate_norm INTO v_vehicle;
    END IF;
  END IF;

  -- Abono vigente de esta patente en esta sucursal (entra y sale libre).
  SELECT s.id INTO v_subscription
    FROM subscriptions s
   WHERE s.branch_id = v_box.branch_id
     AND s.vehicle_id = v_vehicle
     AND s.status = 'active'
     AND s.starts_on <= v_today
     AND s.ends_on >= v_today
   LIMIT 1;

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
       opened_by, entry_notes, key_left, damage_notes, device_id, shift_id,
       subscription_id)
    VALUES
      (p_session_id, v_ticket, v_vehicle, p_vehicle_type_id, p_box_id, v_box.branch_id,
       p_actor_id, p_entry_notes, coalesce(p_key_left, false),
       nullif(btrim(p_damage_notes), ''), p_device_id, v_shift,
       v_subscription);
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
            'key_left', coalesce(p_key_left, false),
            'damage_notes', nullif(btrim(p_damage_notes), ''),
            'subscription_id', v_subscription,
            'shift_id', v_shift),
          p_device_id);

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'ticket_number', v_ticket,
    'vehicle_id', v_vehicle,
    'box_id', p_box_id,
    'branch_id', v_box.branch_id,
    'shift_id', v_shift,
    'subscriber', v_subscription IS NOT NULL,
    'subscription_id', v_subscription
  );
END $$;

-- ============ 6. Egreso: abonado = 0 ============
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

  IF v_session.subscription_id IS NOT NULL THEN
    v_fee   := jsonb_build_object(
      'abono', true,
      'subscription_id', v_session.subscription_id,
      'block', NULL,
      'extra_hours', 0,
      'hourly_amount_cents', 0,
      'total_cents', 0
    );
    v_total := 0;
    v_final := 0;
  ELSE
    v_fee   := calc_fee_breakdown(v_session.branch_id, v_session.vehicle_type_id, v_elapsed);
    v_total := (v_fee->>'total_cents')::bigint;
    v_final := v_total - p_discount_cents + p_surcharge_cents;
  END IF;

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
    (id, session_id, branch_id, concept, method_id, amount_charged_cents,
     amount_calculated_cents, discount_cents, surcharge_cents, registered_by,
     device_id, shift_id)
  VALUES
    (gen_random_uuid(), p_session_id, v_session.branch_id, 'session', p_method_id,
     v_final, v_total, p_discount_cents, p_surcharge_cents, p_actor_id,
     p_device_id, v_shift);

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
    'abono', v_session.subscription_id IS NOT NULL,
    'breakdown', v_fee
  );
END $$;

-- ============ 7. Cotización de egreso: abonado = 0 ============
CREATE OR REPLACE FUNCTION quote_exit(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_session record;
BEGIN
  SELECT vehicle_type_id, entry_at, status, branch_id, subscription_id INTO v_session
  FROM parking_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estadía no encontrada';
  END IF;
  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'La estadía ya está cerrada';
  END IF;

  IF v_session.subscription_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'elapsed_minutes', GREATEST(0, ceil(EXTRACT(EPOCH FROM (now() - v_session.entry_at)) / 60)::integer),
      'abono', true,
      'fee', jsonb_build_object(
        'abono', true,
        'subscription_id', v_session.subscription_id,
        'block', NULL,
        'extra_hours', 0,
        'hourly_amount_cents', 0,
        'total_cents', 0
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'elapsed_minutes', GREATEST(0, ceil(EXTRACT(EPOCH FROM (now() - v_session.entry_at)) / 60)::integer),
    'abono', false,
    'fee', calc_fee_breakdown(v_session.branch_id, v_session.vehicle_type_id,
           GREATEST(0, ceil(EXTRACT(EPOCH FROM (now() - v_session.entry_at)) / 60)::integer))
  );
END $$;

COMMIT;
