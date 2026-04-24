# Visual direction — flat vector top-down, warm-pastel palette

## TL;DR — the call

**Ship a flat top-down vector style, procedurally drawn in Canvas 2D,
with a warm-pastel palette.** Specifically:

- **Not pixel art.** Looks retro-quirky; our current aesthetic is
  cozy-calm and crispness at any zoom matters.
- **Not illustrated / painterly.** Can't be produced procedurally,
  needs an asset pipeline, breaks single-file deploy.
- **Flat vector (aka "Mini Motorways / Mini Metro" style).** Clean
  shapes, flat fills, thin strokes, subtle drop shadows. Already
  where our code is heading. Matches the orderly-design thesis:
  calm, precise, legible.

This is the style the current `drawBlocks` and `drawEntries` functions
are already aiming for. We're codifying and extending.

## Why flat vector (defended)

### vs pixel art
- Pixel art shows its resolution. At our zoom range (pinch-to-zoom
  enabled), the player *will* zoom in and out. Pixel art that looks
  crisp at 1× is either blurry at 2× (bilinear scale) or jagged at
  0.5× (integer-only scale). Neither works for a touch-zoom game.
- Pixel art signals "retro game / arcade". Our thesis is "calm design
  study". Wrong vibe.
- Pixel art demands an *asset pipeline* (Aseprite / sprite sheets /
  tilesets). We're single-file static deploy. Violates the spec.

### vs illustrated / painterly
- Needs hand-drawn assets. Same pipeline cost as above.
- Harder to make *dynamic*. Every new building type = new artwork.
  We want to add types freely.
- Our game is spatial-logic-first, not character-first. Illustration
  is expensive per unit gameplay impact.

### Why flat vector wins
- **Procedural.** Every building type is 20 lines of `ctx.fillRect`
  and `ctx.arc`. Adding a new type is cheap.
- **Zoom-clean.** Vector shapes render crisp at any scale. Players
  can pinch-zoom freely without visual degradation.
- **Quick to polish.** Add a drop shadow, the scene immediately
  looks 10× better. The lever is short.
- **Matches reference games.** Mini Motorways, Mini Metro, *Freeways*,
  *Kids vs. Zombies*, *Islanders* all use variations of flat vector
  tops-down / axonometric. There's a reason it's dominant for this
  genre.

## Palette

Two palettes: **day** (primary) and **night** (tint variant for later
time-of-day cycle).

### Day (primary)

```
--bg        #f4ead5   Cream paper      — map ground
--bg-deep   #efe1c2   Warm sand        — areas outside the map
--grid      rgba(30, 35, 50, 0.18)  Faint slate dots

--road      #2d3242   Dark slate       — primary road surface
--road-edge #1b1f2b   Deeper slate     — road casing/shadow
--road-lane rgba(255, 239, 210, 0.7)  Warm white — centre stripe
--bridge    #4a5164   Mid slate        — raised surface
--highway   #3c5a7e   Dusty blue       — highway surface (future)

--ink       #2a2f3c   Dark text
--ink-soft  #5d6470   Muted text
--accent    #db6d51   Warm terracotta  — UI highlight, current demand thumb
--accent-soft #f0b39d                   Hover/pressed
--good      #4fa16a   Sage             — jam bar green
--warn      #e8a13a   Amber            — jam bar warning
--bad       #c24a3d   Brick            — jam bar bad, pressure full

Building palette (muted, readable in clusters):
--house     #e8d59e  Warm biscuit
--shop      #d4b68a  Sand
--mall      #c6a18f  Rose taupe
--office    #a8b0c4  Blue-grey
--industry  #b8c4a8  Sage olive
--park      #a8b890  Soft leaf
```

All existing variables in `style.css` are already on this palette.
Nothing to change at CSS level; this is codifying the canvas palette.

### Night (tint variant, applied via overlay)

- Multiply layer over whole canvas:
  `rgba(30, 50, 90, 0.35)` at midnight, fading to 0 at dawn/dusk.
- Road stripe becomes slightly brighter warm-yellow
  (`rgba(255, 220, 150, 0.9)`) — headlights catching paint.
- Tiny "star" dots at random grid points.
- Building windows switch from dark-slate to warm-yellow inside the
  frame (feels lit).

### Why this palette lands

- **Paper-warm background** makes roads pop with heavy contrast.
  Traffic flow is what the player is watching; the bg should recede.
- **Dark slate roads** are desaturated enough to not compete with
  building colours. MM uses the same principle.
- **Terracotta accent** is warm but not saccharine. Feels "cozy"
  without feeling kiddy.
- **Muted building palette** keeps the city visually calm even when
  densely placed. Saturated buildings would visually overwhelm the
  road network the player is designing.

## Asset style — procedural shape language

Every visual element below is drawn by code, no images.

### Cars (current: circle; target: oriented vehicle)

```
┌──────────────┐    <- body: rectangle 22×12, rotated to edge tangent
│   ┌──────┐   │    <- windshield: front-40% inner rect, lighter shade
│   │  ··  │   │    <- two small dots on windshield (driver/passenger)
└──┘      └──┘     <- wheels: 4 dark dots at corners
```

Draw pseudocode:
```js
ctx.save();
ctx.translate(car.x, car.y);
ctx.rotate(angle);
// body
ctx.fillStyle = car.color;
roundedRect(-11, -6, 22, 12, 3);
ctx.fill();
// windshield (lighter tint of car.color)
ctx.fillStyle = lighten(car.color, 0.25);
ctx.fillRect(1, -4, 8, 8);
// wheels
ctx.fillStyle = '#1b1f2b';
for (const [x, y] of [[-8,-6],[-8,6],[8,-6],[8,6]]) {
  ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 2*Math.PI); ctx.fill();
}
ctx.restore();
```

Rotation reference: [Spicy Yoghurt — Canvas sprite rotation tutorial](https://spicyyoghurt.com/tutorials/html5-javascript-game-development/images-and-sprite-animations).

### Houses

```
       ╱╲        <- roof triangle (dark slate)
      ╱  ╲
     ╱    ╲
    ┌──────┐    <- body square (biscuit yellow)
    │ □  □ │    <- two window squares (warm white)
    │ □  □ │
    └──────┘
         │ □      <- small chimney on roof
```

Concretely: a rect body 40×40 at the grid point, a triangle on top
(roof peak = 1.4× body width, height 0.5× body width), 2×2 window
grid, optional chimney rectangle offset.

### Shop (current Block, upgraded)

```
    ┌────────┐    <- body rect 60×50
    │ ▓▓▓▓▓▓ │    <- awning stripes (accent colour)
    │ ▭  ▭   │    <- storefront glass (wide windows)
    └────────┘
```

Keep the current rounded-rect drop-shadow treatment. Add an awning
band across the top (solid accent colour) and a wider window row.

### Mall

```
    ┌──────────────┐
    │              │
    │   ┏━━━━┓     │    <- 2-grid-wide rounded rect
    │   ┃ M  ┃     │    <- big glass entrance
    │   ┗━━━━┛     │
    └──────────────┘
```

120×120 world units, no roof peak. Big rectangular glass panel on
the front half. Simple "M" glyph or generic door icon in slate.

### Office

```
      ┌──────┐        <- taller rectangle, ~50×80
      │ □ □ □│        <- dense window grid (4 rows × 3 cols)
      │ □ □ □│
      │ □ □ □│        Palette: cool blue-grey
      │ □ □ □│
      └──────┘
```

### Entry gate

Already good. Minor tweaks:
- Replace filled yellow disc with a "gateway" rendering — two short
  posts + a horizontal bar (like a town-entry sign), still circular
  footprint. Keep the directional arrow.

### Roads

- Keep current: dark slate casing + lighter inner + warm-cream dashed
  centre-line.
- Add **small white chevrons** (▶) at junction entries only, for
  junctions with ≥3 connections. Indicates "this node is a junction".
- For **one-way roads** (feature #4): replace dashed centre-line with
  a continuous line + arrows every 80u in the direction of travel.
- For **highways**: double-thickness casing, lighter body, bolder
  centre-line (double solid stripe).

### Ambient decoration

These add "city life" without gameplay impact:
- **Grass tufts** at random grid points far from any road. Tiny green
  dots with 3-5 radial spikes. Fade out when that grid cell gets built
  over.
- **Tree** (optional): small round canopy + shadow. Place near some
  buildings, not others. Procedural.
- **Lamp posts** along roads at intervals. At night they glow.
- **Benches** near park polygons.

Do *not* overdo. Reference density: MM has maybe 5 tufts of grass per
screen. Anything denser competes with the gameplay.

## Rendering order (top → bottom of stack)

```
1. Background fill                 (--bg)
2. Terrain polygons                (water, parks — future)
3. Grid dots                       (--grid, fade with zoom)
4. Ambient decoration              (grass, trees — bottom layer)
5. Road casings                    (--road-edge, slightly wider)
6. Road bodies                     (--road)
7. Road centre stripes             (--road-lane, dashed/solid)
8. Junction chevrons               (white, small)
9. Building drop shadows           (rgba 0,0,0,0.18 ellipse)
10. Building bodies + details
11. Entry gates
12. Cars (sorted by y for fake-depth)
13. Delivery burst effects         (expanding rings on visit)
14. Pressure rings (overlay)       (around buildings when full)
15. Drag preview                   (dashed line, green/red)
16. Day/night multiply tint        (optional, if Stage B)
17. HUD elements                   (DOM, not canvas)
```

The current `render()` already does most of 1–11 in roughly this
order. Insert 4, 8, 13, 14 incrementally.

## Animation budget — what actually animates

Keep motion minimal; our game is not *animated*, it's *simulated*.

- **Cars move** — already.
- **Pressure ring pulsing** when full — 2Hz sine on alpha.
- **Delivery burst** — 400ms expand-and-fade ring on visit.
- **Gate slide-in** for newly-unlocked entries — 600ms ease-out from
  off-screen.
- **Week-card transition** — 250ms fade-in on the modal.
- **Day/night tint** — continuous, slow (90s cycle).
- **Grass tuft sway** — *do not animate*. Static decoration.
- **Trees** — *do not animate*.

Every animation should be 1-2 CSS transitions or a ctx.globalAlpha
interpolation. Nothing demands a motion library.

## Typography

Already good in `style.css`:
- Primary: `-apple-system / SF Pro Rounded / Segoe UI Rounded / Avenir Next`.
- Weights: 600–800 for HUD, 500 for body.
- Tracking: `-0.02em` on big numbers, `0.1em` uppercase on labels.

Keep as-is. The slightly-rounded sans-serif matches the cozy-vector
aesthetic perfectly.

## Explicitly don't

- Don't add sprite images or image-based textures. Static-only deploy.
- Don't add gradients to buildings — flat fills keep the calm feel.
- Don't use more than one display font.
- Don't add emojis to the HUD (icons can be Unicode glyphs but keep
  them monochromatic).
- Don't try to make this look like a 3D game. Flat top-down wins.

## Sources / references

- [Mini Motorways on Steam — art style reference](https://store.steampowered.com/app/1127500/Mini_Motorways/)
- [Mini Metro on Steam — art style reference](https://store.steampowered.com/app/287980/Mini_Metro/)
- [Coolors — Cozy palettes](https://coolors.co/palettes/popular/cozy)
- [Coolors — Warm palettes](https://coolors.co/palettes/trending/warm)
- [Lospec — Cozy palette tag](https://lospec.com/palette-list/tag/cozy)
- [Spicy Yoghurt — Canvas sprite rotation](https://spicyyoghurt.com/tutorials/html5-javascript-game-development/images-and-sprite-animations)
- [Dave Taylor — HTML5 canvas racing game](https://davetayls.me/blog/2012-11-27-making-a-simple-html5-racing-game/)
