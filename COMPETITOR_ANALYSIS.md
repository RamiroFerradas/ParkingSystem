# Análisis competitivo — SmartDrive Control (smartdrivecontrol.pages.dev)

Fecha: 2026-11-13 · Método: inspección del bundle público (PWA single-file, 1.4 MB inline)
sin sesión activa (el usuario de prueba fue dado de baja; verificación visual pendiente).

## 1. Stack detectado (mismo ecosistema que el nuestro)

| Componente | SmartDrive Control | Nuestro sistema |
|---|---|---|
| Hosting | Cloudflare Pages (`*.pages.dev`) | por definir (Vercel/VPS) |
| Backend | Supabase/PostgREST (códigos `PGRST202/PGRST205` en el bundle) | Supabase/Postgres |
| Frontend | SPA React inline en HTML (PWA offline single-file) | Next.js 16 App Router + PWA |
| Librerías | Recharts (AreaChart/PieChart), SheetJS (Excel "Office Theme"), QR (generar + escanear), lucide-react | TanStack Table, react-thermal-printer/ESC-POS propio |
| Zona horaria | `America/Argentina/Buenos_Aires` configurable | `America/Argentina/Cordoba` |

**Conclusión de stack:** mismas piezas (Supabase + React). Nada de lo suyo es
técnicamente inalcanzable; la diferencia está en el alcance funcional.

## 2. Mapa funcional completo (extraído del bundle)

### Estructura de menú (≈8 secciones planas + acciones rápidas)

- **Inicio / Dashboard**: autos en la playa, ocupación, ingresos hoy, abonos cobrados
  hoy, "en la playa ahora → ir al egreso", acciones rápidas.
- **Operar** ("El día a día del cajero"): ingreso, egreso/cobro, buscar tickets,
  mapa de plazas, checklist de daños al ingresar, forzar ingreso.
- **Analítica**: horas pico, ticket promedio, estadía promedio, ingresos por origen,
  insights automáticos por cajero ("ticket promedio bajo", "anula mucho más que el
  promedio"), comparativas mes anterior.
- **Abonados y reservas**: abonos mensuales, mora, reservas con agenda, convenios.
- **Novedades y servicios**: novedades del turno, incidentes, servicios (lavado,
  pernocte), lavador.
- **Personal y sus horas**: horas pactadas, registro de horas, ausencias, vacaciones,
  licencias, adelantos, reporte mensual exportable.
- **Administración**: la playa (config inicial, datos del ticket, plazas, pisos),
  la caja, tarifas, usuarios/roles/permisos, descuentos, nube y equipos, backups,
  auditoría.
- **PIN como mecanismo diario**: pantalla bloqueable, cambio rápido de usuario por
  PIN, PIN de supervisor para autorizar acciones, bloqueo por intentos fallidos.

### Features que NO tenemos (gap)

| # | Feature | Detalle observable |
|---|---|---|
| 1 | **Abonados + cobranza** | abono fijo mensual, vencimiento, "en mora al ingresar" (bloqueo), plaza fija opcional, máximo de patentes por abono, "abonos cobrados hoy" |
| 2 | **Reservas** | agenda por día, nueva/cancelar reserva, tolerancia de llegada (min), bloquear plaza antes de la reserva (min), próximas reservas |
| 3 | **Convenios con empresas** | cuenta corriente, tarifa del convenio, "exportar consumo del mes" para facturar a la empresa |
| 4 | **Lista negra / blanca** | patentes bloqueadas, ingreso forzado con motivo auditado, lista blanca "sin cargo" (cortesías) |
| 5 | **Checklist de daños al ingresar** | obligatorio al crear ticket, fotos, catálogo de zonas (parabrisas, paragolpes, abolladura), "daño preexistente detectado" |
| 6 | **Incidentes** | tipos: choque/roce dentro de la playa, robo o faltante, objeto olvidado, daño durante la estadía; fotos, personas involucradas, seguro, "imprimir acta", resolver/cerrar, "pasó a investigación" |
| 7 | **Novedades del turno** | entrega entre cajeros, "novedades del turno anterior" visible al abrir turno |
| 8 | **Caja avanzada** | cierre **a ciegas** (efectivo en cajón estimado vs contado), arqueo con diferencia, faltantes acumulados por cajero, alerta "diferencias de caja reiteradas", reposición de fondo, adelanto a empleado, pago a proveedor, otros gastos/ingresos, "cerrar caja e imprimir" |
| 9 | **Servicios adicionales** | lavado básico (con lavador asignado), pernocte, tarifa de evento (monto fijo), montos por servicio en el ticket |
| 10 | **Descuentos con código** | códigos de descuento creados desde administración, "descuento aplicado" |
| 11 | **Alertas automáticas** | posible abandono (configurable en días), mora de abonado, diferencias de caja reiteradas |
| 12 | **Insights de analítica** | alertas tipo "este cajero anula mucho más que el promedio" |
| 13 | **Personal y horas** | horas pactadas/día y /mes, registro de horas trabajadas (decimal), ausencias/vacaciones/licencias, adelantos, "ver y exportar el reporte de horas" |
| 14 | **UX por PIN** | bloquear pantalla → PIN, cambiar de usuario sin logout completo, PIN de supervisor para overrides, "crear PIN y entrar" primer uso |
| 15 | **Equipos y sesiones remotas** | "equipos conectados", revocar equipo, "sesión cerrada a distancia", sesiones activas |
| 16 | **Backups gestionados** | backup cifrado con contraseña, carpeta de backups automáticos, backup atado al cierre de caja, "backup OK/pendiente/nunca" |
| 17 | **Export Excel completo + CSV contable** | SheetJS; nosotros solo tenemos CSV puntual |
| 18 | **WhatsApp** | confirmación de reserva por WhatsApp, recordatorio, teléfono del cliente |
| 19 | **QR** | escáner de QR "desde cualquier pantalla" (probablemente ticket → recuperar en egreso) |
| 20 | **Recorrido guiado** | onboarding "primeros pasos" con guía re-mostrable por usuario |
| 21 | **Roles y permisos editables** | crear roles, editar permisos por rol ("cambio de permisos" auditado) — nosotros tenemos matriz en DB pero sin UI |
| 22 | **Corrección de hora de ingreso** | "nueva fecha y hora de ingreso" con motivo |

### Paridad (ya lo tenemos igual o mejor)

- Mapa de plazas/boxes con estados ✅ (además: **pisos generables**, expansión a 72+ lugares)
- Tarifas con bloque base, tolerancia (min gratis), mínimo cobrable, tramos ✅
- Historial por patente/ticket con filtros ✅
- Anulación de tickets ✅ (`annulled` con motivo)
- Turnos de caja abrir/cerrar ✅ (les falta comparar: movimientos y cierre a ciegas)
- Múltiples medios de pago: efectivo, débito, crédito, transferencia/QR, otros ✅
- Auditoría ✅ (append-only, antes/después)
- Nube Supabase ✅
- Impresión de tickets ✅ (nuestro ESC/POS térmico es más completo que su "impresora de tickets")
- Usuarios, roles fijos con matriz en DB ✅ (falta UI de edición)
- Menú en español rioplatense ("Ingresá", "Andá") ✅ mismo tono

### Donde ya nos destacamos

1. **Snapshot tarifario inmutable por estadía** (BR-010): el cobro histórico nunca cambia.
2. **Sincronización bidireccional real** (outbox/inbox, UUIDv7, idempotencia): su
   "offline" es una SPA con caché; el nuestro es arquitectura de datos.
3. **Estructura física por pisos** configurable por el admin (S8 del cliente).
4. **Suite e2e de 71 checks** y auditoría append-only en cada mutación.
5. **Impresión térmica 58mm ESC/POS** con cola de jobs y reimpresión auditada.

## 3. Evaluación del menú (pregunta del usuario)

No es tu impresión: su menú es **plano y con el trabajo diario primero** (≈8 ítems
de un nivel, "Operar" como hub). El nuestro hoy son 7 grupos × submenús. Lo
rescatable:

- Un solo nivel de navegación para todo lo operativo.
- La home responde las 3 preguntas del dueño: ¿cuántos hay?, ¿cuánto entró hoy?,
  ¿qué necesita atención? (incluye abonos cobrados y alertas).
- "Acciones rápidas" en la home (atajos a ingreso/egreso).
- "Achicar/agrandar menú" (colapsable).

## 4. Roadmap propuesto para empatar + superar

Sprint 2 (diferencia operativa, alto valor para el cliente):
1. Abonados + cobranzas + mora al ingresar (ingreso consulta mora y bloquea).
2. Reservas con agenda y tolerancia + bloqueo de plaza.
3. Novedades del turno (handoff cajero→cajero).
4. Caja avanzada: cierre a ciegas, arqueo con diferencia, faltantes acumulados, movimientos (gastos/fondo/adelantos).
5. Checklist de daños con fotos al ingresar.

Sprint 3 (protección y control):
6. Incidentes con acta imprimible.
7. Lista negra/blanca con forzado auditado.
8. PIN rápido + bloqueo de pantalla + PIN de supervisor.
9. UI de roles y permisos (ya tenemos la matriz).
10. Alertas automáticas (abandono, caja, mora).

Sprint 4 (destacarse):
11. Corrección de hora de ingreso con motivo.
12. Equipos y sesiones remotas (ya existe `device_registry`).
13. Backup exportable cifrado + Excel completo (SheetJS) + CSV contable.
14. WhatsApp para reservas (deep link `wa.me`, sin API paga).
15. QR en ticket → egreso express.
16. Insights de analítica (SQL, sin IA).
17. Recorrido guiado primera vez.
18. Convenios con cuenta corriente.

## 5. Pendiente de verificación visual

El login quedó bloqueado porque el usuario de prueba fue dado de baja. Para el
análisis visual (flujos exactos, orden de pantallas, textos de ayuda) necesitamos:
reactivar ese usuario, o credenciales de dueño, o un recorrido con capturas.
