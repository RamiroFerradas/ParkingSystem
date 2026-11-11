# Legacy prototype (preservado)

Prototipo original del sistema (calculadora de precios + ticket térmico, una
pantalla). Fue auditado en `AUDIT.md` y se preserva intacto como referencia
histórica. No compila ni forma parte del build nuevo: está excluido del
`tsconfig` y del ESLint.

Referencias útiles que se retomarán en la reconstrucción:
- `app/services/prices.ts` — patrón service + ISR (con validación Zod en la versión nueva)
- `app/components/Ticket.tsx` — plantilla térmica 58 mm con react-thermal-printer
  (la implementación correcta usa el render nativo de la lib, no HTML serializado)
