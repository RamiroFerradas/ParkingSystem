# Mobile-first para administración — parking-system

Objetivo: operar todo el sistema desde el teléfono (dashboard, mapa, reportes, CRUD) con datos en vivo.
Branch: `rebuild/next-16` · Delivery: una sola rama, commits por unidad · Runner: `npx vitest run` + `npx next build`

## Specs

- **S1** El shell debe ser usable a 360 px: sidebar permanente fuera (`hidden lg:flex`), `main` con padding `px-3` y `padding-bottom` que libre la barra inferior, raíz en `h-dvh`. Criterio: a 360 px el ancho útil de contenido supera los 320 px.
- **S2** Navegación móvil obligatoria: barra inferior fija (`nav aria-label="Navegación rápida"`) con Inicio, Mapa, Ingreso, Egreso filtrados por permiso en el servidor, más "Más"; el menú completo (20 ítems, 6 grupos) se abre desde la hamburguesa y desde "Más" en la misma hoja (`role="dialog" aria-label="Menú de secciones"`).
- **S3** El header debe partirse en dos filas en el teléfono (identidad + cuenta, luego sucursal + turno) y volver a una sola fila de 64 px en escritorio, sin duplicar instancias de BranchPill, ShiftControl ni UserMenu.
- **S4** Datos en vivo: el shell refresca los server components cada 15 s, se detiene con la pestaña oculta, sin red, con un diálogo/menú abierto o mientras el usuario escribe, y reanuda al volver a la app. El indicador "En vivo" permite refrescar a mano.
- **S5** Dashboard: la ocupación va como tarjeta ancha con porcentaje grande y barra; las tarjetas de hoy/ayer usan 2 columnas en el teléfono con la tarjeta de dinero a ancho completo.
- **S6** Mapa de boxes: buscador por patente/ticket/box, chips de piso deslizables, grilla de 2 columnas a 360 px con patente legible y objetivos táctiles ≥ 44 px; el panel de edición es bottom sheet con acciones a ancho completo.
- **S7** Reportes: accesos directos a ranking, abonados y turnos; tarjetas a 2 columnas; gráfico de 12 meses con scroll horizontal en lugar de comprimirse; horas pico con scroll; tablas con `min-w` y scroll.
- **S8** Listados de operación (estadías) en tarjetas con botón "Cobrar" a ancho completo en el teléfono y tabla desde `md`; tablas de administración nunca recortadas (`scroll-x` + `min-w`).
- **S9** Formularios de administración apilados en una columna en el teléfono (usuarios, abonados, especiales) y campos numéricos/de fecha con teclado adecuado.
- **S10** Base táctil: `viewport-fit=cover` + área segura, inputs a 16 px en móvil para evitar el zoom de iOS, `-webkit-tap-highlight-color` desactivado, toasts por encima de la barra inferior.

## Tasks

| ID | Specs | Ruta | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| T1 | S1, S2, S3 | inline | hecho | `src/app/(app)/layout.tsx`, `src/components/shell/{mobile-nav,mobile-tab-bar,app-header}.tsx` |
| T2 | S4 | inline | hecho | `src/components/shell/live-status.tsx`, tests `live-status.test.tsx` (5 casos) |
| T3 | S5 | inline | hecho | `src/app/(app)/page.tsx`, `src/components/boxes/mini-box-map.tsx` |
| T4 | S6 | inline | hecho | `src/app/(app)/boxes/mapa/{page,BoxMapBoard,BoxTile,BoxEditPanel}.tsx` |
| T5 | S7 | inline | hecho | `src/app/(app)/reportes/**`, `src/components/charts/report-charts.tsx` |
| T6 | S8 | inline | hecho | `src/app/(app)/operaciones/estadias/page.tsx`, tablas admin con `scroll-x` |
| T7 | S9 | inline | hecho | `users-manager`, `abonados-manager`, `specials-manager`, `FloorManager` |
| T8 | S10 | inline | hecho | `src/app/globals.css`, `src/app/layout.tsx`, `src/components/shell/toast.tsx` |

## Log

- **L1** "como un pro de ux ui quiero que esta app este toda first mobile y pueda ser adminsitrable y manipulabrele todo desde el cel, sobre todo dashboard, reportes, etc como un adminsitrador quiero poder ver como viene la cochera en realtime en el celular y sea lo mas intitiva posible, eso como prioridad y puedan tener se todas ls funcionalidades perfectamente"
- **L2** "al finalizar pushea todo" (2026-11-20): autoriza commit y push al cerrar la unidad.
- **L3** Diagnóstico: sidebar de 240 px + padding de 24 px dejaban 72 px útiles a 360 px; header de 64 px sin wrap; cero navegación móvil; ningún mecanismo de refresco automático (solo `router.refresh()` tras mutaciones).
- **L4** Decisión de navegación: barra inferior con las cuatro pantallas diarias + "Más"; la hoja comparte estado con la hamburguesa vía `MobileNavProvider` para no mantener dos menús distintos.
- **L5** Decisión de tiempo real: `router.refresh()` periódico sobre los server components en vez de duplicar consultas en un endpoint; el guard de refresco evita pisar formularios y paneles.
- **L6** Verificación: `tsc --noEmit` sin errores, `eslint src` sin errores (2 warnings preexistentes en `HistorialTable`), `vitest run` 798 tests verdes, `next build` completo.
