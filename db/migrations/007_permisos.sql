-- 007_permisos.sql — Permisos para las nuevas pantallas (D1 vehículos)
-- El admin cubre todo por wildcard '*'; supervisor accede al listado de
-- vehículos (info de operación, no gestión). vehicle.manage queda solo admin.

BEGIN;

INSERT INTO role_permissions (role, permission, allowed) VALUES
  ('supervisor', 'vehicle.read_all', true)
ON CONFLICT DO NOTHING;

COMMIT;
