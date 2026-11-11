-- 004_operacion.sql — Etapa D: operación diaria.
-- RPCs transaccionales de ingreso/egreso + cálculo tarifario (R-01).

-- ============ Datos provisionales para desarrollo ============
-- ATENCIÓN: numeración de boxes provisional hasta resolver BR-OPEN-12
-- (numeración real y sectores los define el establecimiento).
INSERT INTO parking_boxes (number, sector)
SELECT lpad(g::text, 2, '0'), NULL
FROM generate_series(1, 30) g
ON CONFLICT (number) DO NOTHING;

-- ATENCIÓN: se activan las tarifas del borrador (fotos) como provisionales
-- para poder operar en desarrollo. El admin las ajusta con los valores reales.
UPDATE parking_tariffs SET is_active = true WHERE NOT is_active;

-- ============ Cálculo tarifario (R-01 + BR-OPEN-04) ============
-- Mayor bloque completo que cubra la estadía + horas extra al precio del
-- producto de menor duración (1HS). Hora empezada se cobra entera.
-- Sin bloque que cubra la estadía → mínimo = primer bloque completo.
CREATE OR REPLACE FUNCTION calc_fee_breakdown(
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
  WHERE vehicle_type_id = p_vehicle_type_id
    AND is_active
    AND duration_mode = 'flat'
    AND duration_minutes <= p_elapsed_minutes
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY duration_minutes DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Mínimo cobrado: primer bloque completo, sin tolerancia (BR-OPEN-04)
    SELECT id, code, name, duration_minutes, amount_cents INTO v_block
    FROM parking_tariffs
    WHERE vehicle_type_id = p_vehicle_type_id
      AND is_active AND duration_mode = 'flat'
      AND (valid_to IS NULL OR valid_to > now())
    ORDER BY duration_minutes ASC
    LIMIT 1;
    v_extra_hours := 0;
  ELSE
    v_extra_hours := ceil((p_elapsed_minutes - v_block.duration_minutes)::numeric / 60)::integer;
  END IF;

  IF v_block.id IS NULL THEN
    RAISE EXCEPTION 'Sin tarifa activa para el tipo de vehículo';
  END IF;

  SELECT amount_cents INTO v_hourly
  FROM parking_tariffs
  WHERE vehicle_type_id = p_vehicle_type_id
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

-- ============ D3: apertura de estadía (transaccional) ============
-- El cliente genera el session_id (idempotencia BR-014). Los índices únicos
-- parciales garantizan: un box = una estadía abierta; un vehículo = una estadía.
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

  SELECT is_service_enabled, number INTO v_box FROM parking_boxes WHERE id = p_box_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Box inexistente';
  END IF;
  IF NOT v_box.is_service_enabled THEN
    RAISE EXCEPTION 'El box % está fuera de servicio', v_box.number;
  END IF;

  -- D1: reutiliza el vehículo por patente o lo crea (alta rápida)
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

  -- Ticket único: consumo atómico de la secuencia (sin gaps)
  UPDATE ticket_sequences
     SET next_value = next_value + 1
   WHERE establishment_id = 'default'
   RETURNING next_value - 1 INTO v_ticket;

  -- Turno abierto actual, si lo hay (BR-022)
  SELECT id INTO v_shift FROM cash_shifts WHERE status = 'open' LIMIT 1;

  BEGIN
    INSERT INTO parking_sessions
      (id, ticket_number, vehicle_id, vehicle_type_id, box_id,
       opened_by, entry_notes, device_id, shift_id)
    VALUES
      (p_session_id, v_ticket, v_vehicle, p_vehicle_type_id, p_box_id,
       p_actor_id, p_entry_notes, p_device_id, v_shift);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'El box ya está ocupado o el vehículo ya tiene una estadía abierta';
  END;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'ticket_number', v_ticket,
    'vehicle_id', v_vehicle,
    'box_id', p_box_id,
    'shift_id', v_shift
  );
END $$;

-- ============ D4: cierre + cobro (transaccional, atómico) ============
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
  v_fee     := calc_fee_breakdown(v_session.vehicle_type_id, v_elapsed);
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

  SELECT id INTO v_shift FROM cash_shifts WHERE status = 'open' LIMIT 1;

  INSERT INTO payments
    (id, session_id, method_id, amount_charged_cents, amount_calculated_cents,
     discount_cents, surcharge_cents, registered_by, device_id, shift_id)
  VALUES
    (gen_random_uuid(), p_session_id, p_method_id, v_final, v_total,
     p_discount_cents, p_surcharge_cents, p_actor_id, p_device_id, v_shift);

  -- Snapshot tarifario inmutable (BR-010)
  INSERT INTO tariff_applications (id, session_id, snapshot)
  VALUES (gen_random_uuid(), p_session_id, v_fee);

  INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, after)
  VALUES (gen_random_uuid(), p_actor_id, 'session.close', 'parking_session', p_session_id::text, v_fee);

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'duration_minutes', v_elapsed,
    'total_cents', v_total,
    'final_cents', v_final,
    'breakdown', v_fee
  );
END $$;

-- ============ Presupuesto de egreso (lectura, sin mutar) ============
CREATE OR REPLACE FUNCTION quote_exit(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_session record;
BEGIN
  SELECT vehicle_type_id, entry_at, status INTO v_session
  FROM parking_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estadía no encontrada';
  END IF;
  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'La estadía ya está cerrada';
  END IF;
  RETURN jsonb_build_object(
    'elapsed_minutes', GREATEST(0, ceil(EXTRACT(EPOCH FROM (now() - v_session.entry_at)) / 60)::integer),
    'fee', calc_fee_breakdown(v_session.vehicle_type_id,
           GREATEST(0, ceil(EXTRACT(EPOCH FROM (now() - v_session.entry_at)) / 60)::integer))
  );
END $$;
