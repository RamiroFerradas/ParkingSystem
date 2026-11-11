-- 002_seed.sql — Datos iniciales (valores de referencia del borrador;
-- el administrador carga los reales desde la UI — BR-007 / §5 BUSINESS_RULES)

INSERT INTO vehicle_types (code, name, sort_order) VALUES
  ('AUTO',        'Auto',        1),
  ('UTILITARIO',  'Utilitario',  2),
  ('CAMION',      'Camión',      3),
  ('MOTO',        'Moto',        4),
  ('BICICLETA',   'Bicicleta',   5)
ON CONFLICT DO NOTHING;

INSERT INTO payment_methods (code, name, sort_order) VALUES
  ('EFECTIVO',      'Efectivo',      1),
  ('DEBITO',        'Débito',        2),
  ('CREDITO',       'Crédito',       3),
  ('TRANSFERENCIA', 'Transferencia', 4),
  ('OTROS',         'Otros',         5)
ON CONFLICT DO NOTHING;

INSERT INTO ticket_sequences (establishment_id, next_value)
VALUES ('default', 1)
ON CONFLICT DO NOTHING;

INSERT INTO parking_settings (key, value) VALUES
  ('establishment', '{"name": "SMARTDRIVE PARKING SA", "address": "Av. Humberto Primo 790", "tax_id": "33-71933019-9", "header": "PLAYA 24 HORAS"}'),
  ('fractioning',   '{"mode": "largest_block_plus_1h", "started_hour_charged_full": true}'),
  ('ticket_template', '{"show_plate": true, "show_vehicle_type": true, "show_box": true, "footer_note": ""}')
ON CONFLICT (key) DO NOTHING;

-- Matriz de permisos inicial (BUSINESS_RULES §6)
INSERT INTO role_permissions (role, permission, allowed) VALUES
  ('admin',    '*', true),
  ('supervisor', 'session.open', true),
  ('supervisor', 'session.close', true),
  ('supervisor', 'session.read_all', true),
  ('supervisor', 'vehicle.create', true),
  ('supervisor', 'box.read', true),
  ('supervisor', 'ticket.print', true),
  ('supervisor', 'ticket.reprint', true),
  ('supervisor', 'reports.read', true),
  ('employee', 'session.open', true),
  ('employee', 'session.close', true),
  ('employee', 'vehicle.create', true),
  ('employee', 'box.read', true),
  ('employee', 'ticket.print', true),
  ('employee', 'session.read_own', true)
ON CONFLICT DO NOTHING;

-- Tarifario de referencia del borrador (fotos) — DRAFT, el admin los ajusta
-- Los códigos viejos (35/40/...) quedan como referencia en `code` opcional.
INSERT INTO parking_tariffs (code, name, vehicle_type_id, duration_minutes, duration_mode, amount_cents, is_active)
SELECT t.code, t.name, vt.id, t.duration_minutes, 'flat', t.amount_cents, false
FROM (VALUES
  ('35', 'Auto 1 hora',      'AUTO',      60,   480000),
  ('40', 'Utilitario 1 hora','UTILITARIO',60,   500000),
  ('45', 'Camión 1 hora',    'CAMION',    60,   600000),
  ('50', 'Moto 1 hora',      'MOTO',      60,   220000),
  ('55', 'Bicicleta 1 hora', 'BICICLETA', 60,    50000),
  ('36', 'Auto 4 horas',     'AUTO',      240, 1100000),
  ('41', 'Utilitario 4 horas','UTILITARIO',240,1400000),
  ('46', 'Camión 4 horas',   'CAMION',    240, 1800000),
  ('51', 'Moto 4 horas',     'MOTO',      240,  650000),
  ('37', 'Auto 8 horas',     'AUTO',      480, 1800000),
  ('42', 'Utilitario 8 horas','UTILITARIO',480,3000000),
  ('47', 'Camión 8 horas',   'CAMION',    480, 3600000),
  ('52', 'Moto 8 horas',     'MOTO',      480, 1200000),
  ('38', 'Auto 12 horas',    'AUTO',      720, 2800000),
  ('43', 'Utilitario 12 horas','UTILITARIO',720,4400000),
  ('48', 'Camión 12 horas',  'CAMION',    720, 5200000),
  ('53', 'Moto 12 horas',    'MOTO',      720, 1800000),
  ('39', 'Auto 24 horas',    'AUTO',      1440,4800000),
  ('44', 'Utilitario 24 horas','UTILITARIO',1440,6600000),
  ('49', 'Camión 24 horas',  'CAMION',    1440,7500000),
  ('54', 'Moto 24 horas',    'MOTO',      1440,2800000)
) AS t(code, name, vehicle_type_code, duration_minutes, amount_cents)
JOIN vehicle_types vt ON vt.code = t.vehicle_type_code
ON CONFLICT DO NOTHING;
