# BUSINESS_RULES.md — Reglas de negocio

Documento vivo. Las reglas confirmadas se marcan **[CONFIRMADA]**; las que aún
necesitan confirmación del establecimiento van en §5 con una propuesta default
**[PENDIENTE]**. Nada se implementa asumiendo una regla pendiente: el motor se
construye parametrizable y las decisiones se registran acá.

## 1. Convenciones regionales

| Aspecto | Valor |
|---|---|
| Idioma de UI | Español |
| Moneda | ARS, montos internos en centavos (enteros) |
| Zona horaria | America/Argentina/Cordoba |
| Fecha | DD/MM/YYYY · Hora: 24 h |
| Todos los timestamps | `timestamptz` en UTC en la base; formato regional solo en UI |

## 2. Reglas operativas confirmadas

- **BR-001 [CONFIRMADA]** Los tipos de vehículo son administrables. Iniciales: Auto, Utilitario, Camión, Moto, Bicicleta.
- **BR-002 [CONFIRMADA]** Un vehículo no puede tener dos estadías abiertas simultáneas, salvo que una regla explícita lo permita.
- **BR-003 [CONFIRMADA]** Un box no puede asignarse a dos estadías activas (protección por constraint + transacción, no solo UI).
- **BR-004 [CONFIRMADA]** Cada ingreso genera un número de ticket único y se imprime al confirmar.
- **BR-005 [CONFIRMADA]** El egreso calcula tiempo, identifica tarifa, calcula importe, muestra el desglose, registra el medio de pago, confirma el cobro y libera el box. No se permite cerrar una estadía dos veces.
- **BR-006 [CONFIRMADA]** Estadías cerradas conservan un snapshot inmutable de las condiciones tarifarias. Modificar tarifas posteriormente no altera operaciones pasadas.
- **BR-007 [CONFIRMADA]** Los valores de tarifa son configuración editable (BD), nunca constantes de código.
- **BR-008 [CONFIRMADA]** Tarifas especiales: período con inicio/fin, tipos de vehículo afectados, % o importe fijo, prioridad de aplicación, estados `programada/activa/vencida/cancelada`. Activación y desactivación automáticas por vigencia. No modifican la tarifa base.
- **BR-009 [CONFIRMADA]** No se acumulan especiales superpuestas: política de prioridad explícita y auditable (ver BR-OPEN-03).
- **BR-010 [CONFIRMADA]** La tarifa aplicable queda registrada como snapshot en cada estadía (tarifa base + especial aplicada + desglose del cálculo).
- **BR-011 [CONFIRMADA]** Operaciones económicas cerradas no se eliminan físicamente: solo anulación o corrección auditada.
- **BR-012 [CONFIRMADA]** Roles: Administrador / Supervisor / Empleado. Permisos en backend (RLS + RPC), no solo ocultando botones.
- **BR-013 [CONFIRMADA]** Auditoría de toda acción relevante con usuario, fecha/hora, acción, entidad, valores anteriores y nuevos.
- **BR-014 [CONFIRMADA]** Protección anti-duplicados ante doble clic, reintentos o corte de conexión (idempotencia por operación).
- **BR-015 [CONFIRMADA]** Operación esencial 100% offline: ingresos, egresos, boxes, tarifas sincronizadas, tickets, pagos, turnos. Ninguna operación esencial depende de Supabase Cloud. IndexedDB es solo caché/PWA; la fuente de verdad offline es el servidor local.
- **BR-016 [CONFIRMADA]** Sincronización: primero transacción local confirmada, luego envío. Estados `pendiente / en proceso / sincronizado / error / requiere resolución`. Backoff exponencial. No se marca sincronizado sin confirmación. Sobrevive reinicios y cortes de energía.
- **BR-017 [CONFIRMADA]** Conflictos: no se usa last-write-wins para lo económico. Operaciones críticas inmutables + eventos de corrección auditables. Tarifas modificadas remotamente se aplican localmente solo tras confirmación de recepción. Los snapshots de estadías no se modifican retroactivamente.
- **BR-018 [CONFIRMADA]** Reimpresiones permitidas desde el historial y registradas en auditoría.
- **BR-019 [CONFIRMADA]** Estados de box: Disponible (verde) / Ocupado (rojo) / Fuera de servicio (gris). El estado se deriva transaccionalmente de las estadías abiertas, nunca se edita a mano.
- **BR-020 [CONFIRMADA]** Tablero de boxes con actualización en tiempo real (Realtime en la nube, SSE local en LAN).
- **BR-021 [CONFIRMADA]** Medios de pago configurables: Efectivo, Débito, Crédito, Transferencia, Otros. Se registra importe cobrado, importe calculado y descuentos/ajustes.

## 3. Tarifario de referencia (datos de fotos — semilla editable)

Valores iniciales en ARS. Se cargan como configuración editable vía migración/seed, no como constantes.

### Tarifas generales por duración

| Duración | Auto | Utilitario | Camión | Moto |
|---|---:|---:|---:|---:|
| 1 hora | 4800 | 5800 | 6000 | 2200 |
| 4 horas | 11000 | 14000 | 18000 | 6500 |
| 8 horas | 18000 | 30000 | 36000 | 12000 |
| 12 horas | 28000 | 44000 | 52000 | 18000 |
| 24 horas | 48000 | 66000 | 75000 | 28000 |

### Bicicleta

$500 por hora (fraccionamiento por confirmar, BR-OPEN-08).

### Estadías / eventos con tarifas diferenciadas (códigos de las fotos)

| Código | Tipo de vehículo | Importe | Duración |
|---|---|---:|---|
| 60 | Auto | 10000 | **[PENDIENTE BR-OPEN-02]** |
| 61 | Utilitario | 14000 | **[PENDIENTE BR-OPEN-02]** |
| 66 | Auto | 12000 | **[PENDIENTE BR-OPEN-02]** |
| 67 | Utilitario | 20000 | **[PENDIENTE BR-OPEN-02]** |

Estos códigos se modelan como una modalidad tarifaria especial parametrizable
(código, importe, condición, vigencia). La duración queda configurada como campo
editable hasta confirmarla.

### Ejemplo de aumento especial confirmado

Tarifa habitual $4.800 + especial 10% → $5.280. El valor base nunca cambia.

## 4. Reglas del motor de cálculo (framework confirmado, parámetros pendientes)

El motor soporta: tarifa por hora, por bloques, multi-bloque, 24 h, especiales,
promocionales, recargos, descuentos, importes mínimos y minutos de gracia.
**Qué combina de qué manera es lo pendiente** (§5).

Toda resolución produce un **snapshot**:
`{ tarifa_base_id, código, duración_regla, importe_base, especial_aplicada_id, tipo_ajuste, valor_ajuste, importe_final, desglose }`.

## 5. Reglas por confirmar con el establecimiento

> Estas respuestas condicionan el Etapa E (motor tarifario). El resto del
> sistema (C, D, F, G) puede avanzar sin ellas.

- **BR-OPEN-01 — Fraccionamiento general.** ¿Una estadía de 5 h se cobra como bloque de 4 h + 1 h, como dos bloques, u otra fórmula? ¿Qué pasa con 9 h, 13 h, 25 h? *Propuesta default: mayor bloque que cubra + resto por hora.*
- **BR-OPEN-02 — Duración de códigos 60/61/66/67.** ¿Qué representa cada código? *Propuesta default: configurables como tarifa plana por evento.*
- **BR-OPEN-03 — Superposición de especiales.** ¿La prioridad es por campo explícito (menor número gana) o se elige la más favorable para el cliente? ¿Se permite alguna combinación? *Propuesta default: un solo ajuste, el de mayor prioridad explícita; empate → se registra el conflicto para auditoría.*
- **BR-OPEN-04 — Gracia y mínimos.** ¿Minutos de gracia? ¿Importe mínimo? *Propuesta default: 10 min de gracia configurable, mínimo = 1 hora.*
- **BR-OPEN-08 — Bicicleta.** ¿$500 por hora empezada o exacta? *Propuesta default: hora empezada.*
- **BR-OPEN-09 — Recargos/descuentos.** ¿Quién autoriza (Supervisor?) y con qué topes?
- **BR-OPEN-10 — Turnos de caja.** ¿Apertura/cierre con arqueo por medio de pago? ¿Qué se exige para cerrar?
- **BR-OPEN-11 — Anulaciones/ajustes.** ¿Qué rol autoriza? ¿Motivo obligatorio?
- **BR-OPEN-12 — Configuración física.** Numeración real de boxes, sectores y tipos de vehículo permitidos por box/sector.
- **BR-OPEN-13 — Vehículos sin patente.** ¿Se permite patente temporal/placeholder (bicicletas, motos sin placa)? *Propuesta default: sí, con marcador interno.*

## 6. Matriz de permisos inicial

| Acción | Admin | Supervisor | Empleado |
|---|---|---|---|
| Registrar ingreso/egreso | ✔ | ✔ | ✔ |
| Crear vehículos / consultar boxes | ✔ | ✔ | ✔ |
| Imprimir ticket | ✔ | ✔ | ✔ |
| Reimprimir ticket | ✔ | configurable | configurable |
| Ver operaciones propias | ✔ | ✔ | ✔ |
| Ver operaciones de todos | ✔ | ✔ | — |
| Reportes y estadísticas | ✔ | ✔ | — |
| Anular estadía / ajustar importe | ✔ | configurable | — |
| Admin boxes / tarifas / medios de pago | ✔ | — | — |
| Usuarios y roles | ✔ | — | — |
| Configuración del sistema / auditoría / sincronización | ✔ | — | — |

Los permisos son configurables por rol+acción en base de datos (RLS + guardas en RPC).
