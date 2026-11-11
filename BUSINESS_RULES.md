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
- **BR-007 [CONFIRMADA]** Los valores de tarifa son configuración editable (BD), nunca constantes de código. **Confirmado por el propietario (11/11/2026): toda tarifa es un "producto" cargado por el administrador** — tipo de vehículo + duración + importe, con el mismo mecanismo para bici (precio fijo), autos por X horas, y cualquier producto futuro (ej. lavado). La matriz de códigos 35/40/… son códigos internos editables de cada producto, no casos especiales de software.
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

### Matriz completa de códigos (tablero del establecimiento, foto 11/11/2026)

| Duración | Auto | Utilitario | Camión | Moto | Bici |
|---|---|---|---|---|---|
| 1HS | 35 | 40 | 45 | 50 | 55 |
| 3HS | 64 | 65 | — | — | — |
| 4HS | 36 | 41 | 46 | 51 | — |
| 8HS | 37 | 42 | 47 | 52 | — |
| 12HS | 38 | 43 | 48 | 53 | — |
| 24HS | 39 | 44 | 49 | 54 | — |

Observaciones: `3HS` (64/65) existe en códigos pero **no** en la tabla de
precios pública; `Bici` solo tiene código 55 (1HS). Anotación manuscrita
"37 LAVADERO" sugiere que el código 37 (8HS Auto) se usa también para cobrar
lavado — a confirmar (BR-OPEN-14).

### Evidencia de ticket real (sistema antiguo, 11/11/2026)

- Establecimiento: **SMARTDRIVE PARKING SA**, Av. Humberto Primo 790, AFIP CUIT **33-71933019-9**, encabezado "PLAYA 24 HORAS".
- Ticket N° 37169 (numeración global secuencial).
- Línea de tarifa: `Tarifa 35 — 4800.00` → código 35 = 1HS Auto, consistente con la matriz.
- **Estadía de 13 minutos cobrada $4800 (bloque de 1 hora completo)** → mínimo cobrado = 1 hora entera; la evidencia sugiere que no hay tolerancia que baje del mínimo (BR-OPEN-04).
- Campos `Vto` (vencimiento) y `Estad` vacíos en estadía normal → se usan para estadías/eventos pagados por adelantado (a confirmar).
- `Form.Pago: 1` → medios de pago codificados numéricamente en el sistema viejo (mapeo a confirmar).
- El ticket NO imprime box/space: el sistema viejo no asigna boxes; el módulo de boxes es una mejora nueva del sistema pedido.
- Hora de impresión (10:39:22) posterior a la hora de salida registrada (10:38:05).

### Ejemplo de aumento especial confirmado

Tarifa habitual $4.800 + especial 10% → $5.280. El valor base nunca cambia.

## 4. Reglas del motor de cálculo (framework confirmado, parámetros pendientes)

El motor soporta: tarifa por hora, por bloques, multi-bloque, 24 h, especiales,
promocionales, recargos, descuentos, importes mínimos y minutos de gracia.
**Qué combina de qué manera es lo pendiente** (§5).

Toda resolución produce un **snapshot**:
`{ tarifa_base_id, código, duración_regla, importe_base, especial_aplicada_id, tipo_ajuste, valor_ajuste, importe_final, desglose }`.

## 5. Reglas por confirmar con el establecimiento

> Actualizado 11/11/2026 con las respuestas del propietario y evidencia del ticket real.

### Resueltas (confirmadas por el propietario / evidencia)

- **BR-OPEN-01 → CONFIRMADA (R-01).** Fraccionamiento: se cobra el **mayor bloque completo** que cubra la estadía y las **horas extra al precio de 1HS** (ej. 5 h = precio 4HS + 1 × precio 1HS; 9 h = 8HS + 1HS). Hora empezada se cobra entera (coherente con el ticket real: 13 min → 1HS completo).
- **BR-OPEN-02 → RESUELTA (R-02).** Los códigos 60/61/66/67 eran la forma de carga del sistema viejo. Decisión: **se eliminan como modelo** — las estadías/eventos son productos con nombre e importe; el código pasa a campo interno opcional. Duración de cada evento: la define el admin al crear el producto.
- **BR-OPEN-04 → RESUELTA (evidencia ticket).** Mínimo = primer bloque (1HS) completo, sin tolerancia que baje del mínimo (13 min → 1HS entera). Minutos de gracia: ninguno por defecto; configurable en settings si más adelante el establecimiento quiere uno.
- **BR-OPEN-08 → RESUELTA (por R-01).** Bicicleta: hora empezada, misma regla de fraccionamiento.
- **BR-OPEN-14 → RESUELTA (R-05).** "Lavadero" también es un producto más (nombre + importe), no un caso especial.
- **Precios de referencia (fotos).** Son solo **borrador**: el administrador carga los valores reales al dar de alta cada producto. No se asume ninguno como vigente.
- **BR-OPEN-12 (parcial → R-08).** Se agrega la asignación de box en el ingreso (el sistema viejo no la registraba). Falta: numeración real de boxes y sectores para la carga inicial.

### Aún abiertas

- **BR-OPEN-03 — Superposición de especiales.** ¿Gana la de mayor prioridad explícita o la más favorable al cliente? *Propuesta default: un solo ajuste, el de mayor prioridad explícita; empate → se audita.*
- **BR-OPEN-09 — Recargos/descuentos.** ¿Quién autoriza y con qué topes? *(ligado a BR-OPEN-11)*
- **BR-OPEN-10 — Turnos de caja.** ¿Apertura/cierre con arqueo por medio de pago? (hay gaveta conectada a la impresora RP-T001).
- **BR-OPEN-11 — Anulaciones/ajustes.** ¿Qué rol autoriza? ¿Motivo obligatorio?
- **BR-OPEN-12 (resto) — Configuración física.** Numeración real de boxes y sectores.
- **BR-OPEN-13 — Vehículos sin patente.** ¿Placeholder permitido? *Propuesta default: sí, con marcador interno.*

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
