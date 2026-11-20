-- 011_turnos_ingreso.sql — el ingreso exige turno abierto y el empleado gestiona el suyo
-- 1) El empleado puede abrir y cerrar su propio turno (antes solo supervisor/admin).
-- 2) Ninguna estadía puede abrirse sin turno de caja: el trigger cubre open_session
--    y cualquier inserción directa. Solo aplica a estadías abiertas (status = 'open')
--    para no romper importaciones o analítica de estadías históricas cerradas.

BEGIN;

INSERT INTO role_permissions (role, permission, allowed) VALUES
  ('employee', 'shift.manage', true)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION require_open_shift() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'open' AND NEW.shift_id IS NULL THEN
    RAISE EXCEPTION 'No hay turno de caja abierto';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS parking_sessions_require_shift ON parking_sessions;
CREATE TRIGGER parking_sessions_require_shift
  BEFORE INSERT ON parking_sessions
  FOR EACH ROW EXECUTE FUNCTION require_open_shift();

COMMIT;
