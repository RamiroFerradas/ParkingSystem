-- 015_branding.sql — Rebrand the establishment and its branch to Mauricio's Parking.
--
-- Only the display name changes. Address, tax id and ticket header stay exactly
-- as they are: those are legal/fiscal facts, not branding.
--
-- Both statements are guarded by the old name, so a branch an operator renamed
-- by hand is never overwritten, and a re-run is a no-op.

BEGIN;

UPDATE parking_settings
SET value = jsonb_set(value, '{name}', to_jsonb('Mauricio''s Parking'::text))
WHERE key = 'establishment'
  AND value->>'name' = 'SMARTDRIVE PARKING SA';

UPDATE branches
SET name = 'Mauricio''s Parking',
    updated_at = now()
WHERE btrim(name) = 'SMARTDRIVE PARKING SA';

COMMIT;
