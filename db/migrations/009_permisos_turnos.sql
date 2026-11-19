-- 009_permisos_turnos.sql — Turnos de caja como permiso explícito
-- El admin cubre todo por wildcard '*'. El supervisor pasa a poder abrir y
-- cerrar caja; el empleado deja de verlo (antes cualquier sesión podía).

BEGIN;

INSERT INTO role_permissions (role, permission, allowed) VALUES
  ('supervisor', 'shift.manage', true),
  ('admin', 'shift.manage', true)
ON CONFLICT DO NOTHING;

COMMIT;
