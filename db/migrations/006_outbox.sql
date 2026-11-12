-- 006_outbox.sql
-- D6 (sprint web-only): todo movimiento operativo queda encolado en sync_outbox
-- DENTRO de la misma transacción que lo escribe en la DB local. Si Internet
-- se corta, el sync worker lo reenvía cuando vuelve (attempts/last_error/synced_at).
-- Idempotencia: operation_id único PK; reenvío no duplica.
BEGIN;

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

  SELECT is_service_enabled, is_active, number INTO v_box FROM parking_boxes WHERE id = p_box_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Box inexistente';
  END IF;
  IF NOT v_box.is_active THEN
    RAISE EXCEPTION 'El box % está dado de baja', v_box.number;
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

  -- D6: el movimiento queda en el outbox (misma transacción, no se pierde)
  INSERT INTO sync_outbox (operation_id, entity_type, entity_id, op, payload, device_id)
  VALUES (gen_random_uuid(), 'parking_session', p_session_id::text, 'insert',
          jsonb_build_object(
            'id', p_session_id,
            'ticket_number', v_ticket::text,
            'vehicle_id', v_vehicle,
            'vehicle_type_id', p_vehicle_type_id,
            'box_id', p_box_id,
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
    'shift_id', v_shift
  );
END $$;

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

  -- D6: el cobro queda en el outbox (misma transacción, no se pierde)
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

COMMIT;
