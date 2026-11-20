# Mauricio's Parking — visual identity

The interface borrows its vocabulary from the garage: asphalt, painted floor markings, Mercosur plates and 58 mm thermal paper. It is not a SaaS dashboard with a logo on top; the surfaces and the type are the brand.

Everything below is already wired. Change a token in `src/app/globals.css` and the whole app follows; do not restyle page by page.

## Where it lives

| Piece | File |
|---|---|
| Color, radius and font tokens | `src/app/globals.css` (`@theme`) |
| Typefaces | `src/app/layout.tsx` (`next/font`) |
| Paint stripe and wordmark | `src/components/shell/sidebar.tsx` |
| Plate motif (the one graphic gesture) | `src/app/login/page.tsx` |
| Box numbers and plates in mono | `src/app/(app)/boxes/mapa/BoxTile.tsx` |

## Color

The three functional ramps are retuned in place, so existing utilities keep their meaning (`neutral-900` is still a surface, `neutral-800` still a border, `amber-500` still attention).

| Token | Hex | Use |
|---|---|---|
| `neutral-950` | `#15130f` | page background (asphalt) |
| `neutral-900` | `#221f1a` | surface (concrete) |
| `neutral-800` | `#35302a` | border |
| `neutral-100` | `#f3f0e9` | primary text, paper-white action |
| `neutral-500` | `#887f71` | secondary text |
| `amber-400` | `#f5c518` | painted yellow: attention, occupied, the sidebar stripe |
| `emerald-400` | `#4fbf85` | available / online |
| `sky-600` | `#1d4ed8` | plate blue: informational, confirmation |
| `red-400` | `#f87171` | out of service, errors |
| `plate` / `plate-ink` | `#f4f4f1` / `#101114` | plate motif only |

Yellow is a signal, not decoration: if everything is yellow, nothing is. Keep it to one element per screen.

## Type

| Role | Face | Rule |
|---|---|---|
| Interface and headings | Archivo | 400–800. Designed for signage legibility. |
| Numbers and codes | IBM Plex Mono | Plates, ticket numbers, box numbers, ids, action names. |

Plates, box numbers and ticketing data are always mono. Never set a plate or an id in Archivo.

## Shape

Corner radii are compressed to signage values (2–7 px). No soft shadows, no glass, no gradients: depth comes from the concrete ramp, not from blur.

## Interaction

Clickable controls get `cursor: pointer`; disabled ones get `not-allowed` plus reduced opacity. Keyboard focus is a 2 px painted-yellow outline. Both live in the `@layer base` block of `globals.css`, so no component has to opt in.

## The one gesture

The plate motif appears only where a real plate exists: the brand on login, the plate input on entry, and the vehicle header on exit. Blue band, white plate, black ink. Never as decoration for something that is not a plate or an identifier.

## Checklist for new UI

- [ ] My colors come from `neutral`, `amber`, `emerald`, `sky` or `red` tokens, none introduced ad hoc.
- [ ] Any number a person could read aloud as data (plate, box, ticket, code) uses `font-mono`.
- [ ] I did not add a shadow, gradient, glass panel or a new radius.
- [ ] Yellow marks exactly one thing on the screen.
- [ ] New clickable elements use a real `button`/`link`, so the cursor and focus rules apply.
- [ ] The screen still reads at 1280×800 and on a 10" tablet.
