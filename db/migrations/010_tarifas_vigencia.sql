-- 010_tarifas_vigencia.sql — Tarifas por bloque con vigencia.
--
-- Corrige calc_fee_breakdown:
--   * respeta valid_from (antes una tarifa futura se aplicaba de inmediato);
--   * da precedencia a la tarifa temporal (valid_to definido) sobre la fija
--     para el mismo bloque;
--   * a igual duración y vigencia, gana la más reciente.
--
-- La tarifa temporal solo pisa el bloque con la misma duración. El resto de
-- la escalera (bloque mayor que cubra la estadía y hora extra al bloque
-- mínimo) se resuelve con la misma precedencia.

CREATE OR REPLACE FUNCTION calc_fee_breakdown(
  p_vehicle_type_id uuid,
  p_elapsed_minutes integer
) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_block       record;
  v_hourly      bigint;
  v_extra_hours integer;
  v_total       bigint;
  v_now         timestamptz := now();
BEGIN
  -- Bloque que cubre la estadía: el mayor con duración <= elapsed.
  SELECT id, code, name, duration_minutes, amount_cents INTO v_block
  FROM parking_tariffs
  WHERE vehicle_type_id = p_vehicle_type_id
    AND is_active
    AND duration_mode = 'flat'
    AND valid_from <= v_now
    AND (valid_to IS NULL OR valid_to > v_now)
    AND duration_minutes <= p_elapsed_minutes
  ORDER BY duration_minutes DESC,
           (valid_to IS NOT NULL) DESC,
           valid_from DESC,
           updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Mínimo cobrado: primer bloque completo, sin tolerancia (BR-OPEN-04).
    SELECT id, code, name, duration_minutes, amount_cents INTO v_block
    FROM parking_tariffs
    WHERE vehicle_type_id = p_vehicle_type_id
      AND is_active
      AND duration_mode = 'flat'
      AND valid_from <= v_now
      AND (valid_to IS NULL OR valid_to > v_now)
    ORDER BY duration_minutes ASC,
             (valid_to IS NOT NULL) DESC,
             valid_from DESC,
             updated_at DESC
    LIMIT 1;
    v_extra_hours := 0;
  ELSE
    v_extra_hours := ceil((p_elapsed_minutes - v_block.duration_minutes)::numeric / 60)::integer;
  END IF;

  IF v_block.id IS NULL THEN
    RAISE EXCEPTION 'Sin tarifa activa para el tipo de vehículo';
  END IF;

  -- Hora extra al bloque mínimo vigente (misma precedencia temporal > fija).
  SELECT amount_cents INTO v_hourly
  FROM parking_tariffs
  WHERE vehicle_type_id = p_vehicle_type_id
    AND is_active
    AND duration_mode = 'flat'
    AND valid_from <= v_now
    AND (valid_to IS NULL OR valid_to > v_now)
  ORDER BY duration_minutes ASC,
           (valid_to IS NOT NULL) DESC,
           valid_from DESC,
           updated_at DESC
  LIMIT 1;

  v_total := v_block.amount_cents + v_extra_hours * v_hourly;

  RETURN jsonb_build_object(
    'block', jsonb_build_object(
      'tariff_id', v_block.id,
      'code', v_block.code,
      'name', v_block.name,
      'duration_minutes', v_block.duration_minutes,
      'amount_cents', v_block.amount_cents
    ),
    'extra_hours', v_extra_hours,
    'hourly_amount_cents', v_hourly,
    'total_cents', v_total
  );
END $$;
