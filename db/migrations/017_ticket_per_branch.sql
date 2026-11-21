-- 017_ticket_per_branch.sql — La numeración de tickets es por sucursal.
--
-- La migración 014 pasó `ticket_sequences` a una fila por sucursal, pero el
-- UNIQUE global de 001 (`ticket_number bigint NOT NULL UNIQUE`) quedó vivo.
-- Resultado: la segunda sucursal que abre una estadía choca contra el ticket 1
-- de la primera y falla con el mensaje engañoso "El box ya está ocupado o el
-- vehículo ya tiene una estadía abierta".
--
-- La unicidad real es (branch_id, ticket_number).

ALTER TABLE parking_sessions
  DROP CONSTRAINT IF EXISTS parking_sessions_ticket_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_number_per_branch
  ON parking_sessions (branch_id, ticket_number);
