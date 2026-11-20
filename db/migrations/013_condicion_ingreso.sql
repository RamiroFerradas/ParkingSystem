-- 013_condicion_ingreso.sql — Condición del vehículo al ingresar
-- Registra dos datos operativos de la estadía (no del vehículo, para no arrastrar
-- una rotura ya reparada): si el cliente deja la llave en el auto y las roturas
-- existentes declaradas al ingresar. El egreso las muestra para verificar el auto
-- antes de cobrar.

BEGIN;

ALTER TABLE parking_sessions
  ADD COLUMN IF NOT EXISTS key_left     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS damage_notes text;

-- La firma anterior (006_outbox.sql) termina en p_device_id. Se elimina porque
-- CREATE OR REPLACE con otra lista de argumentos deja una sobrecarga viva y
-- open_session(...) con 6 argumentos quedaría ambigua.
DROP FUNCTION IF EXISTS open_session(uuid, text, uuid, uuid, uuid, text, uuid);

-- p_device_id conserva su posición 7 para no romper llamadas posicionales
-- existentes; los datos nuevos van después y se pasan por nombre.
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
       opened_by, entry_notes, key_left, damage_notes, device_id, shift_id)
    VALUES
      (p_session_id, v_ticket, v_vehicle, p_vehicle_type_id, p_box_id,
       p_actor_id, p_entry_notes, coalesce(p_key_left, false),
       nullif(btrim(p_damage_notes), ''), p_device_id, v_shift);
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
            'key_left', coalesce(p_key_left, false),
            'damage_notes', nullif(btrim(p_damage_notes), ''),
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

COMMIT;
