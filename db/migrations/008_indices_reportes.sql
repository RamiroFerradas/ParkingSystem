-- 008_indices_reportes.sql — Índices para reportes y dashboard (H5)
-- El dashboard filtra por día local: (col AT TIME ZONE 'America/Argentina/Cordoba')::date,
-- forma que no puede usar los índices simples sobre la columna. Se agregan
-- índices de expresión para la fecha local de ingreso/egreso/pago, más un
-- índice simple sobre payments.paid_at para los rangos de /reportes.
-- CREATE INDEX IF NOT EXISTS: idempotente (aplicable a public y dev).

BEGIN;

CREATE INDEX IF NOT EXISTS idx_payments_paid_at
  ON payments USING btree (paid_at);

CREATE INDEX IF NOT EXISTS idx_payments_paid_at_day
  ON payments USING btree (CAST(paid_at AT TIME ZONE 'America/Argentina/Cordoba' AS date));

CREATE INDEX IF NOT EXISTS idx_sessions_entry_day
  ON parking_sessions USING btree (CAST(entry_at AT TIME ZONE 'America/Argentina/Cordoba' AS date));

CREATE INDEX IF NOT EXISTS idx_sessions_exit_day
  ON parking_sessions USING btree (CAST(exit_at AT TIME ZONE 'America/Argentina/Cordoba' AS date));

COMMIT;
