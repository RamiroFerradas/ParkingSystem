# AUDIT.md — Auditoría del proyecto existente (Etapa A)

Fecha: 2026-11-11 · Auditoría de solo lectura: no se modificó ninguna funcionalidad existente.

## 1. Estado actual del proyecto

El repositorio **no contiene el sistema integral pedido**. Contiene un **prototipo de una sola pantalla** (estilo kiosco) que calcula un precio por tiempo estacionado e imprime un ticket térmico. No hay base de datos, autenticación, boxes, estadías, historial, dashboard, estadísticas ni sincronización. El repo además **no está inicializado con Git**.

Escala real: ~10 archivos fuente, 1 ruta (`/`), sin API routes, sin tests, sin `.env` de ejemplo, sin `.gitignore`.

## 2. Arquitectura existente

| Componente | Tecnología | Estado |
|---|---|---|
| Framework | Next.js 14.1.0 (App Router), React 18, TypeScript 5 (strict) | Base utilizable pero versión desactualizada (Next 14.1 predates parches de seguridad) |
| Estilos | Tailwind CSS 3 | OK, configuración estándar |
| Estado | `useState` local; `ParkingContext` + `useParking` existen pero **no se usan** (código muerto) | Malo |
| Precios | `app/services/prices.ts`: fetch de un CSV remoto vía `process.env.DB_URL`, parseado con papaparse, ISR 100s | Hack de prototipo: sin validación, sin check de `response.ok`, cast ciego a `Price[]` |
| Impresión | `react-thermal-printer` 0.18 + Web Serial API (USB, ESC/POS, Epson, 58mm/42 cols) | Dirección correcta para la impresora térmica, **implementación defectuosa** |
| Persistencia | **Ninguna** (ni localStorage ni DB) | No existe |

## 3. Funcionalidades encontradas

1. **Calculadora de precio**: select de tipo de vehículo, hora inicio/fin, dominio, cobrador → total en vivo (`app/components/PriceCalculator.tsx`).
2. **Ticket térmico**: envío por Web Serial (`navigator.serial.requestPort()`, 9600 baud) de la salida de `react-thermal-printer`.
3. **Carga de precios desde CSV remoto** con ISR.

No hay nada más: sin ingreso/egreso real, sin boxes, sin tickets numerados, sin medios de pago, sin historial, sin roles.

## 4. Problemas técnicos

Con evidencia `archivo:línea`:

- **P1 — Cálculo incorrecto**: la fórmula multiplica horas fraccionales por precio sin redondeo a hora, sin mínimo y sin tolerancia (`PriceCalculator.tsx:56-65`); además ancla ambas horas a `2000-01-01T`, por lo que **un cruce de medianoche produce horas negativas y total negativo**.
- **P2 — Lógica de tarifa duplicada**: la misma fórmula está copiada en `Ticket.tsx:34-45`; el ticket **ignora** el total recibido como prop (`Ticket.tsx:12`) y recalcula → riesgo de divergencia entre pantalla e impresión.
- **P3 — Impresión mal implementada**: se serializa el ticket a HTML con `ReactDOMServer.renderToString` y se escribe ese string directamente al stream serie (`PriceCalculator.tsx:71-87`); `react-thermal-printer` convierte a ESC/POS dentro de su propio render, así que esto imprime basura o nada.
- **P4 — Estado muerto/duplicado**: `ParkingContext` (`app/context/ParkingContext.tsx`) y el hook `app/hooks/useParking.tsx` (que ni siquiera es un hook: devuelve un `<div>useParking</div>`) no se consumen por nadie.
- **P5 — Sin validación de entrada**: no valida horas negativas, faltantes, ni tipos del CSV; cast ciego `results.data as Price[]` (`prices.ts:18`); no chequea `response.ok` (`prices.ts:8-11`).
- **P6 — SSR/hydration**: `currentHour` se calcula en render (`PriceCalculator.tsx:12-15`) → mismatch de hidratación.
- **P7 — Datos simulados en el ticket**: filas placeholder `left/right` y línea falsa de WiFi `Wifi: some-wifi / PW: 123123` (`Ticket.tsx:77-86`); el campo cobrador se recibe y descarta.
- **P8 — Cero persistencia**: no registra ningún ticket emitido; imposible reconstruir operación.
- **P9 — Seguridad/antigüedad**: Next 14.1.0 sin parches recientes; `(navigator as any).serial`; sin ESLint config propia; repo sin Git (sin historial ni rollback).
- **P10 — Nada del requerimiento offline-first** (secciones A–J del pedido) está abordado: no hay PWA, ni service worker, ni servidor local, ni sincronización.

## 5. Componentes reutilizables

| Elemento | Valor para el sistema nuevo |
|---|---|
| `app/models/Price.ts` | Único tipo de dominio limpio; patrón de modelos bajo `app/models` |
| `app/services/prices.ts` | Esqueleto del patrón service + ISR (requiere validación con Zod) |
| Enfoque de impresión | La elección de `react-thermal-printer` + Web Serial/58mm/ESC/POS es la correcta para las RP-T001/POS-5890C; se rehará bien (render nativo de la lib, no HTML serializado) y con fallback al servicio local de impresión |
| Base del proyecto | pnpm + Next App Router + TS strict + Tailwind + alias `@/*` |

## 6. Componentes que conviene reemplazar

- Toda la lógica de tarifa (se implementa como **motor tarifario** configurable + snapshots por estadía).
- Todo el estado (se reemplaza por PostgreSQL local + contexto de servidor, no contexto React).
- El path de impresión (render correcto de la lib + cola de `print_jobs`).
- La fuente de precios por CSV remoto (se reemplaza por tablas `parking_tariffs` editables).
- Contexto/hook muertos.

## 7. Veredicto: ¿seguimos sobre este proyecto o algo nuevo?

**Recomendación: reconstruir en este repositorio.**

El prototipo aporta conceptos y dos dependencias acertadas (react-thermal-printer, Tailwind), pero **ninguna línea de negocio es conservable**: la única lógica real (cálculo) está mal y duplicada, y no hay persistencia, auth ni módulos. Evolucionarlo "in place" implicaría borrar casi todo igual, con el riesgo extra de arrastrar P1–P10.

Plan propuesto: inicializar Git sobre el estado actual (commit de preservación del prototipo como referencia histórica), y construir el sistema en una estructura nueva (`src/`) dejando el prototipo intacto hasta el corte. Esto cumple S2 (no eliminar nada) y responde S3.

## 8. Arquitectura propuesta (resumen; detalle en Fase 2)

- **Híbrida offline-first**: servidor local en el estacionamiento (Docker Compose: PostgreSQL local + app Next.js en la red LAN) como fuente de verdad operativa; Supabase Cloud como plataforma centralizada y canal del administrador remoto.
- **Motor de sincronización** bidireccional con patrón **Outbox/Inbox**: cada operación se confirma primero localmente (transacción local) y luego se sincroniza con idempotencia (UUIDs, versión, estados pendiente/en proceso/sincronizado/error), reintentos con backoff y resolución de conflictos explícita (nada de last-write-wins para lo económico; estadías inmutables + eventos de corrección auditables; boxes protegidos por constraints transaccionales).
- **Stack**: Next.js (App Router, actualizado), TS estricto, Supabase (Auth, Realtime, Storage), PostgreSQL con RPC para operaciones críticas, RLS por rol, migraciones versionadas, Tailwind + shadcn/ui, RHF + Zod, TanStack Table, Recharts, date-fns, PDF para reportes.
- **PWA + Service Worker** para instalación y caché en terminales; IndexedDB solo como caché/soporte, nunca como fuente de verdad (requisito explícito del pedido).
- **Operación diaria primero** (ingreso/egreso, boxes, tarifas, tickets, turnos), luego analítica (dashboard, estadísticas, heatmaps) — según las etapas C–H del pedido.

## 9. Reglas de negocio que necesitan confirmación (no inventar)

1. Fórmula de fraccionamiento (¿5 h = bloque 4h + 1h, dos bloques, u otra?), redondeos, mínimos y minutos de gracia.
2. Duración que representan los códigos 60/66 (auto) y 61/67 (utilitario) de estadías/eventos.
3. Política de superposición de tarifas especiales (prioridad explícita ya pedida; falta la regla concreta).
4. Turnos de caja: apertura/cierre, arqueo, qué se exige.
5. Anulaciones y ajustes: quién autoriza (supervisor), límites.
6. Números de boxes reales, sectores y tipos permitidos por box.

## 10. Próximo paso

Decisión del propietario: confirmar "reconstruir en este repo" (o indicar alternativa) → recién entonces Fase 2 (ARCHITECTURE.md, DATABASE.md, BUSINESS_RULES.md, IMPLEMENTATION_PLAN.md).
