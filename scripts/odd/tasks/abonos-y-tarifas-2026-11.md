# Abonos mensuales, tarifas editables y limpieza de tipos (nov 2026)

Objetivo: permitir altas de tarifas por sucursal (bloques y abono mensual), gestionar abonados con entradas/salidas ilimitadas sin cobro por hora, y sacar el código redundante de los tipos de vehículo.
Rama: `rebuild/next-16`. Test runner: `scripts/test-e2e.mjs`, `pnpm build`, `tests/` (DB).

## Specs

- S1: "quiero que el usuario pueda agregar nuevas tarifas" → el alta de tarifas vuelve a funcionar con sucursales (`branch_id` obligatorio en la API y listado por sucursal) y sigue permitiendo bloques por hora.
- S2: "pueda haber una tarifa que sea abonado es decir una persona que quiere dejar el auto por mes" → plan mensual por tipo de vehículo (precio + vigencia) en el tarifario.
- S3 (decisión del usuario): "Entra y sale cuando quiere" → mientras el abono está vigente, la patente puede ingresar y egresar sin límite, en cualquier box libre, y el egreso no cobra horas.
- S4: "los vehiculos tienen un codigo que es el mismo nombre del vehiculo... si no tiene sentido saquemoslo" → el ABM de tipos ya no muestra ni pide código; la API lo deriva del nombre para no romper seeds/tests.
- S5: el cobro del abono se registra en el turno abierto como un pago con concepto `subscription`, y aparece en la recaudación de la sucursal.

## Tasks

- T1 · S1,S2,S3 · Migración `015_abonos.sql`: `parking_tariffs.kind`, tabla `subscriptions`, `parking_sessions.subscription_id`, `payments.branch_id/concept`, cálculo por hora con vigencia y cierre/quote en 0 para abonados · done (dev)
- T2 · S1,S2 · API de tarifas por sucursal + `kind` (hourly/monthly) · done
- T3 · S2,S3,S5 · API `/api/subscriptions` (alta con cobro en el turno, baja, listado) · done
- T4 · S2,S3 · UI del tarifario con sección "Abono mensual" por tipo · done (writer)
- T5 · S2,S3,S5 · Página `/tarifas/abonados` (alta, listado y baja) + navegación · done (writer)
- T6 · S3 · Ingreso/egreso/estadías muestran "Abonado" y cobran 0 · done
- T7 · S4 · Tipos de vehículo sin código en la UI; la API lo deriva del nombre · done
- T9 · S6 · Reportes con gráficos: facturación mensual (estadías vs abonos), autos que más acceden y movimientos por día de semana · in progress (writer)
- T10 · S6 · Reporte "Impacto de abonos" (/reportes/abonados): activos, recurrente, cobrado 12m, vencimientos · in progress (writer)
- T8 · S1..S5 · Build OK; ciclo completo verificado por API (plan 201, abono 201 con pago 1500000, lookup abonado, ingreso abonado, egreso 0, baja 200) y por UI (sección Abono mensual, alta y baja de abonado). Datos de prueba limpiados de dev.

## Log

- L1: "che quiero que el usuario pueda agregar nuevas tarifas y ademas pueda haber una tarifa que sea abonado es decir una persona que quiere dejar el auto por mes. tambine estaba viendo que los vehicuos tienen un codiogo que es el mismo nombre del vehiculo, no se que sentido tiene, pero si no tiene sentido saquemoslo"
- L2: "Entra y sale cuando quiere" (respuesta a cómo funciona el abono mensual).
- L3: "como un por en adminsitracion hay que saber como vamos a impactar los abonos en los reportes mensuales etc. ademas quiero ver algo de graficos en losreportes por ejhemplo de los meses mas movidos o los meses con mayor facturacion etc. quiero ver grafico de los autos que mas acceden, y el graidco que se te ocurra"
- L4: "comitea todo tambine"
- Estado: migración `015_abonos.sql` aplicada solo en `dev`. No aplicar en `public` hasta deployar: depende de `014_branches` y de que el código nuevo escriba `payments.branch_id`.
