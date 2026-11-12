-- 005_pisos.sql
-- Estructura física configurable: pisos (niveles) + boxes por piso.
-- S8/BR-OPEN-12: el admin genera pisos, agrega/saca boxes y modifica el total
-- (expansión). Solo roles con box.manage (admin vía wildcard). UI intuitiva.
BEGIN;

CREATE TABLE parking_floors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text    NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  version    integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parking_boxes
  ADD COLUMN floor_id  uuid REFERENCES parking_floors(id),
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Numeración de box única (identificador visible para el personal)
ALTER TABLE parking_boxes
  ADD CONSTRAINT uq_parking_boxes_number UNIQUE (number);

CREATE INDEX idx_parking_boxes_floor ON parking_boxes (floor_id);

-- Piso por defecto para los boxes provisionales existentes (admin lo ajusta)
INSERT INTO parking_floors (name, sort_order) VALUES ('Planta baja', 0);
UPDATE parking_boxes
   SET floor_id = (SELECT id FROM parking_floors WHERE name = 'Planta baja');

-- Vista de estado: agrega piso y oculta boxes/pisos dados de baja
-- (cambia el shape de columnas: DROP + CREATE, es derivada y nadie depende de ella)
DROP VIEW box_status;
CREATE VIEW box_status AS
SELECT
  b.id,
  b.number,
  b.sector,
  b.is_service_enabled,
  f.id   AS floor_id,
  f.name AS floor_name,
  f.sort_order AS floor_sort,
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
JOIN parking_floors f        ON f.id = b.floor_id AND f.is_active
LEFT JOIN parking_sessions s ON s.box_id = b.id AND s.status = 'open'
LEFT JOIN vehicles v         ON v.id = s.vehicle_id
LEFT JOIN vehicle_types vt   ON vt.id = s.vehicle_type_id
WHERE b.is_active;

-- open_session endurecido: rechaza boxes dados de baja
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

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'ticket_number', v_ticket,
    'vehicle_id', v_vehicle,
    'box_id', p_box_id,
    'shift_id', v_shift
  );
END $$;

COMMIT;
