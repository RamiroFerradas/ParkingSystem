-- 017_cierre_con_autos.sql — Cierre de turno con vehículos adentro
--
-- Un auto puede quedarse entre turnos. El turno se puede cerrar igual, pero
-- queda registrado cuántos vehículos siguieron adentro: sus egresos se cobran
-- en el turno que esté abierto al momento del cobro.

BEGIN;

ALTER TABLE cash_shifts
  ADD COLUMN IF NOT EXISTS closing_open_sessions integer NOT NULL DEFAULT 0;

COMMIT;
