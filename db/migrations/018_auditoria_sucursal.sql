-- 018_auditoria_sucursal.sql — auditoría por sucursal
--
-- 1) El ingreso de una estadía no dejaba rastro en audit_logs (solo el egreso).
--    Un trigger AFTER INSERT lo audita sin reescribir open_session.
-- 2) Backfill de eventos legacy con branch_id NULL cuando la sucursal es
--    derivable de la entidad referenciada. Los eventos de catálogo global
--    (payment_method, vehicle_type, profile) siguen NULL a propósito.

BEGIN;

CREATE OR REPLACE FUNCTION audit_session_open() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'open' THEN
    INSERT INTO audit_logs (id, actor_id, branch_id, action, entity_type, entity_id)
    VALUES (
      gen_random_uuid(),
      NEW.opened_by,
      NEW.branch_id,
      'session.open',
      'parking_session',
      NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS parking_sessions_audit_open ON parking_sessions;
CREATE TRIGGER parking_sessions_audit_open
  AFTER INSERT ON parking_sessions
  FOR EACH ROW EXECUTE FUNCTION audit_session_open();

-- ============ Backfill de sucursal en eventos legacy ============
UPDATE audit_logs a
   SET branch_id = s.branch_id
  FROM parking_sessions s
 WHERE a.branch_id IS NULL
   AND a.entity_type = 'parking_session'
   AND a.entity_id = s.id::text;

UPDATE audit_logs a
   SET branch_id = cs.branch_id
  FROM cash_shifts cs
 WHERE a.branch_id IS NULL
   AND a.entity_type = 'cash_shift'
   AND a.entity_id = cs.id::text;

UPDATE audit_logs a
   SET branch_id = t.branch_id
  FROM parking_tariffs t
 WHERE a.branch_id IS NULL
   AND a.entity_type = 'parking_tariff'
   AND a.entity_id = t.id::text;

UPDATE audit_logs a
   SET branch_id = b.branch_id
  FROM parking_boxes b
 WHERE a.branch_id IS NULL
   AND a.entity_type = 'parking_box'
   AND a.entity_id = b.id::text;

UPDATE audit_logs a
   SET branch_id = f.branch_id
  FROM parking_floors f
 WHERE a.branch_id IS NULL
   AND a.entity_type = 'parking_floor'
   AND a.entity_id = f.id::text;

UPDATE audit_logs a
   SET branch_id = sub.branch_id
  FROM subscriptions sub
 WHERE a.branch_id IS NULL
   AND a.entity_type = 'subscription'
   AND a.entity_id = sub.id::text;

UPDATE audit_logs a
   SET branch_id = sp.branch_id
  FROM special_tariff_periods sp
 WHERE a.branch_id IS NULL
   AND a.entity_type = 'special_tariff_period'
   AND a.entity_id = sp.id::text;

COMMIT;
