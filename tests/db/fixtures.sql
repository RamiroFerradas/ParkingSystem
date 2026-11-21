-- Fixtures mínimas para que `tests/db/*` corra contra un schema recién migrado.
-- Las migraciones crean sucursal, pisos y 30 boxes, pero ningún usuario: los
-- tests necesitan un actor activo (open_session / close_session lo exigen).
-- Idempotente: se aplica en cada corrida de CI.
INSERT INTO profiles (id, full_name, role, is_active, email, is_master)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Fixture Admin',
  'admin',
  true,
  'fixture-admin@parking.test',
  false
)
ON CONFLICT DO NOTHING;
