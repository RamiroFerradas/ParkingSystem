-- 012_user_permissions.sql — Excepciones de permisos por usuario
-- El rol sigue dando la base; esta tabla permite habilitar o negar un permiso
-- a un usuario concreto. Sin fila = hereda del rol (comportamiento anterior).

BEGIN;

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  permission text NOT NULL,          -- misma clave 'modulo.accion' que role_permissions
  allowed    boolean NOT NULL,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

CREATE INDEX IF NOT EXISTS user_permissions_permission_idx
  ON user_permissions (permission);

-- Ingreso y egreso pasan a permiso explícito para que el configurador cubra
-- todo el menú. Se conceden a los tres roles: sin cambio de comportamiento.
INSERT INTO role_permissions (role, permission, allowed) VALUES
  ('admin', 'session.open', true),
  ('admin', 'session.close', true),
  ('supervisor', 'session.open', true),
  ('supervisor', 'session.close', true),
  ('employee', 'session.open', true),
  ('employee', 'session.close', true)
ON CONFLICT DO NOTHING;

COMMIT;
