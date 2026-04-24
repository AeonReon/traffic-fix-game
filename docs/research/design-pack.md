# Design pack — prototype → shipped game

This doc is the *execution spec* for the visual polish pass. It's
prescriptive: exact sizes, colours, strokes, shadows, timings. The
build session should be able to walk top-to-bottom and implement.

Companion to `visual-direction.md` (which explains *why*). This one
says *what* and *how much*.

Target: match Mini Motorways' surface polish, keep our
designer-driven gameplay, stay within Canvas 2D procedural rendering
(no sprite pipeline).

---

## The 10 moves that separate prototype from shipped

Applied together, these are the difference between our current look
and "proper game". Each is individually small. The *combination* is
the whole ball game.

1. **Defined map frame** — not an infinite field. A soft-edged
   rectangle.
2. **Oriented cars, not circles** — rectangular body, windshield,
   wheels.
3. **Per-type building silhouettes** — house has a pitched roof,
   mall has glass front, etc. Shape conveys type *before* colour does.
4. **Consistent drop shadows** — every raised element (car, building,
   gate) casts the same-angle shadow. Feels like one lit world.
5. **Consistent corner radii** — all rectangles round to the same
   per-type radius. Our palette becomes a design system.
6. **One stroke width** — 1.5px at scale 1.0 for every edge line
   (except road casings). Calms the whole scene.
7. **Delivery burst effect** — on every visit, a micro-animation
   rewards the eye. Without this, the game is silent visually.
8. **Pressure rings** — per-building arc that fills visibly. The
   game starts *communicating* with the player.
9. **Day/night tint** — slow, continuous. The world feels alive even
   when nothing is happening.
10. **Ambient life** — tiny grass tufts, a scatter of trees. Not
    clutter — restraint. 3–5 per screen.

---

## 1. Global design system

All values in **logical world units**. `state.view.scale` handles
the world-to-screen conversion. Always multiply by
`state.view.scale` when drawing to the canvas, same pattern as the
current code.

### Colour tokens (canvas layer)

Declare at the top of `game.js` as a `const COLORS = {...}` block.

```js
const COLORS = {
  // Map / background
  bg:            '#f4ead5',   // cream paper
  bgDeep:        '#e7d9b8',   // outside map-frame
  mapEdge:       'rgba(42, 47, 60, 0.08)',   // soft inner shadow of frame
  grid:          'rgba(30, 35, 50, 0.14)',   // dots, subtle

  // Roads
  roadEdge:      '#1b1f2b',   // casing
  road:          '#2d3242',   // body
  roadStripe:    'rgba(255, 239, 210, 0.72)',
  highway:       '#3c5a7e',   // future: highway body
  highwayEdge:   '#1e2e44',
  highwayStripe: 'rgba(255, 239, 210, 0.88)',
  bridge:        '#4a5164',   // lifted road

  // Buildings
  house:         '#e8d59e',   // warm biscuit
  houseRoof:     '#a8745a',   // terracotta roof
  shop:          '#d4b68a',   // sand
  shopAwning:    '#db6d51',   // accent terracotta
  mall:          '#c6a18f',   // rose taupe
  mallGlass:     '#9cc7d0',   // pale teal
  office:        '#a8b0c4',   // blue-grey
  officeWindow:  '#f8eecd',   // warm white (lit)
  industrial:    '#b8c4a8',   // sage olive

  // Details
  ink:           '#2a2f3c',   // text
  inkSoft:       '#5d6470',
  accent:        '#db6d51',   // UI highlight
  accentSoft:    '#f0b39d',
  good:          '#4fa16a',
  warn:          '#e8a13a',
  bad:           '#c24a3d',

  // Effects
  shadow:        'rgba(30, 35, 50, 0.22)',
  shadowSoft:    'rgba(30, 35, 50, 0.10)',
  windowLit:     'rgba(255, 220, 150, 0.85)',   // nighttime
  windowDay:     'rgba(255, 250, 238, 0.72)',
};
```

All the CSS variables in `style.css` already match this. Use these
named constants for every canvas draw call — no more
`ctx.fillStyle = '#d4b68a'` scattered around.

### Stroke / radii / shadow constants

```js
const STROKE = 1.5;                 // default stroke width (world units)
const STROKE_HEAVY = 2.0;           // building outlines
const RADIUS = { house: 3, shop: 4, mall: 5, office: 3, industrial: 2, car: 3 };
const SHADOW = {
  offsetX: 2,
  offsetY: 4,
  blur: 6,
  color: 'rgba(30, 35, 50, 0.22)'
};
const GRID = 60;                    // logical units
```

### Shadow pattern (universal)

Every raised element draws this before its fill. Consistent offset
direction = coherent "light" in the scene.

```js
function drawDropShadow(drawPath) {
  ctx.save();
  ctx.fillStyle = SHADOW.color;
  ctx.translate(SHADOW.offsetX * state.view.scale,
                SHADOW.offsetY * state.view.scale);
  ctx.filter = `blur(${SHADOW.blur * 0.5}px)`;
  drawPath();
  ctx.fill();
  ctx.restore();
}
```

Use for: cars, buildings, entry gates, pressure ring (when full).
Do **not** use for roads (they're *inset*, not raised).

---

## 2. Map frame

Currently the map is an infinite canvas. Define a bounded *play area*
rectangle, and the world outside it is visually different.

```
      ┌─────────────────────────────┐   <- bgDeep fills viewport
      │    soft edge shadow         │
      │  ┌───────────────────────┐  │
      │  │                       │  │
      │  │       MAP (bg)        │  │   <- bg fills inside
      │  │   1200×1560 logical   │  │
      │  │                       │  │
      │  └───────────────────────┘  │
      │                             │
      └─────────────────────────────┘
```

Render order:
1. Fill entire viewport with `bgDeep`.
2. Fill `(0, 0) → (LOGICAL_W, LOGICAL_H)` with `bg`.
3. Stroke the rectangle with 2px `mapEdge` colour (creates a tiny
   soft line).
4. Optional subtle inner shadow: a thin gradient ring 20u wide inside
   the map edges, fading to transparent toward the interior.

This single change makes the game feel like it has *a place* rather
than *any place*.

---

## 3. Roads

Already 80% there. Small refinements.

### Regular road

Three strokes in this order:

| Layer | Width | Colour | Dash |
|-------|-------|--------|------|
| Casing (shadow line) | 26u | `roadEdge` | none |
| Body | 22u | `road` | none |
| Centre stripe | 1.2u | `roadStripe` | [10u, 12u] |

Already implemented. Keep.

### One-way road

Same as regular, but:
- Centre stripe becomes **solid** (no dash).
- Add **chevron arrows** along the road at 80u intervals, centred on
  the polyline, facing the direction of travel. Arrow: small filled
  triangle, 8u wide × 5u deep, `roadStripe` colour at 0.9 alpha.

```
━━━━━►━━━━━━━►━━━━━━━►━━━━━━━►━━━━━━━
```

### Highway (Stage C)

| Layer | Width | Colour | Dash |
|-------|-------|--------|------|
| Casing | 32u | `highwayEdge` | none |
| Body | 28u | `highway` | none |
| Centre double stripe | 2 × 1.5u at ±3u offset | `highwayStripe` | none (solid) |

Slightly wider, distinctly blue-toned. Reads immediately as "main
route".

### Bridge

Same as road but draw a thin shadow cast on the ground below:
- 2 separate shadow strokes offset 6u down & 3u right, same polyline,
  colour `shadowSoft`, width equal to the road body.
- Then the road body itself, colour `bridge` (mid slate, lighter than
  regular `road`).

This fakes depth without needing 3D — the eye reads "bridge over
something".

### Junction markers

At any node with ≥3 edges, draw a small dark dot:
- Radius 4u, colour `roadEdge`, solid.
- Sits behind road rendering.

This is purely visual (no gameplay effect) but it reads as "this is
a junction" at a glance.

### Roundabout

Currently rendered as road segments in a ring. Refinement:
- Draw a solid centre disc, radius = roundabout radius − 4u, colour
  `bg` (the map cream). Makes the centre "empty" look intentional.
- Inside the centre disc: a tiny fill ring of `accentSoft`, radius
  8u. Visual anchor.

---

## 4. Cars

Currently: coloured circles. Target: recognisable vehicle.

### Dimensions (in world units)

- Body: **22 wide × 12 deep**, rounded corner radius 3.
- Windshield: 8 wide × 8 deep, positioned 1u in from the front,
  centred on the cross-axis.
- Wheels: 4 dots, 1.8u radius, at corners (±8, ±5) offset from centre.
- Headlights (night only): 2 small dots, 1.2u radius, at front
  corners (+10, ±3).

### Colour variance

```js
const CAR_BODIES = ['#3a4152', '#4a5164', '#2f3544', '#505868', '#424958', '#5a6170'];
```

Each car picks one on spawn. Windshield = that body colour lightened
by 25% (mix with white).

### Rotation

The current `sampleEdge()` returns `hx, hy` — the unit tangent along
the edge at the car's position. Use:

```js
const angle = Math.atan2(hy, hx);
ctx.save();
ctx.translate(carX, carY);
ctx.rotate(angle);
// ... draw body centred on origin
ctx.restore();
```

### Draw function sketch

```js
function drawCar(car) {
  const { x, y, hx, hy } = sampleCarPos(car);      // existing helper
  const angle = Math.atan2(hy, hx);
  const s = state.view.scale;
  const p = w2s(x, y);

  ctx.save();
  ctx.translate(p.sx, p.sy);
  ctx.rotate(angle);

  // Shadow first (pre-rotation shadow would skew — we rotate with the body)
  ctx.fillStyle = COLORS.shadow;
  roundedRect(-11 * s + 2 * s, -6 * s + 3 * s, 22 * s, 12 * s, 3 * s);
  ctx.fill();

  // Body
  ctx.fillStyle = car.body;
  ctx.strokeStyle = COLORS.roadEdge;
  ctx.lineWidth = STROKE * s;
  roundedRect(-11 * s, -6 * s, 22 * s, 12 * s, 3 * s);
  ctx.fill(); ctx.stroke();

  // Windshield (lighter shade)
  ctx.fillStyle = car.windshield;
  roundedRect(1 * s, -4 * s, 8 * s, 8 * s, 2 * s);
  ctx.fill();

  // Wheels
  ctx.fillStyle = COLORS.roadEdge;
  for (const [wx, wy] of [[-8,-5],[-8,5],[8,-5],[8,5]]) {
    ctx.beginPath();
    ctx.arc(wx * s, wy * s, 1.8 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Headlights if night
  if (state.timeOfDay === 'night') {
    ctx.fillStyle = 'rgba(255, 230, 180, 0.9)';
    for (const [hx_, hy_] of [[10,-3],[10,3]]) {
      ctx.beginPath();
      ctx.arc(hx_ * s, hy_ * s, 1.2 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}
```

### Car-sort for fake depth

Before drawing cars, sort by world-y (larger = further "down" on the
screen = drawn last = appears in front). Creates convincing 2.5D
overlap when cars pass each other on intersecting roads.

---

## 5. Buildings

Each type is ~30 lines of canvas code. Same shadow, same stroke, but
distinct silhouette.

### Shared scaffold

```js
function drawBuildingBase(b, footprintW, footprintH, bodyColor, radius) {
  const s = state.view.scale;
  const p = w2s(b.x, b.y);
  const w = footprintW * s, h = footprintH * s;

  // Drop shadow
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath();
  ctx.ellipse(p.sx + SHADOW.offsetX * s, p.sy + h * 0.55,
              w * 0.45, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = bodyColor;
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = STROKE * s;
  roundedRect(p.sx - w/2, p.sy - h/2, w, h, radius * s);
  ctx.fill(); ctx.stroke();
}
```

### House (type = 'house')

Footprint 44 × 44 world units, centred on `b.x, b.y`. Anchor to node.

```
       ▲       <- roof peak at +16u above top of body
      ╱ ╲
     ╱   ╲
    ╱     ╲
   ┌───────┐
   │ ▢   ▢ │   <- 2×2 window grid
   │ ▢   ▢ │
   │   ╏   │   <- door, centred bottom
   └───────┘
```

```js
function drawHouse(b) {
  drawBuildingBase(b, 44, 44, COLORS.house, RADIUS.house);
  const s = state.view.scale;
  const p = w2s(b.x, b.y);

  // Pitched roof (triangle)
  ctx.fillStyle = COLORS.houseRoof;
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = STROKE * s;
  ctx.beginPath();
  ctx.moveTo(p.sx - 26 * s, p.sy - 20 * s);
  ctx.lineTo(p.sx,          p.sy - 38 * s);
  ctx.lineTo(p.sx + 26 * s, p.sy - 20 * s);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Windows — 2x2 warm-white
  const windowColor = state.timeOfDay === 'night' ? COLORS.windowLit : COLORS.windowDay;
  ctx.fillStyle = windowColor;
  for (const [dx, dy] of [[-9,-6],[9,-6],[-9,6],[9,6]]) {
    roundedRect(p.sx + dx * s - 4 * s, p.sy + dy * s - 4 * s, 8 * s, 8 * s, 1.5 * s);
    ctx.fill();
  }

  // Door
  ctx.fillStyle = COLORS.houseRoof;
  ctx.fillRect(p.sx - 3 * s, p.sy + 10 * s, 6 * s, 12 * s);
}
```

### Shop (type = 'shop')

Footprint 52 × 44 (slightly wider than house).

```
   ┌─────────┐
   │▓▓▓▓▓▓▓▓▓│   <- awning stripe (accent colour)
   │         │
   │ ▭▭▭ ▭▭▭ │   <- wide storefront windows
   │         │
   └─────────┘
```

```js
function drawShop(b) {
  drawBuildingBase(b, 52, 44, COLORS.shop, RADIUS.shop);
  const s = state.view.scale;
  const p = w2s(b.x, b.y);
  const w = 52 * s, h = 44 * s;

  // Awning band (top 25% of body)
  ctx.fillStyle = COLORS.shopAwning;
  ctx.fillRect(p.sx - w/2 + STROKE * s,
               p.sy - h/2 + STROKE * s,
               w - 2 * STROKE * s,
               h * 0.25);

  // Storefront glass (bottom 50%)
  ctx.fillStyle = COLORS.windowDay;
  ctx.fillRect(p.sx - w/2 + 6 * s, p.sy + 2 * s, w - 12 * s, 12 * s);

  // Glass dividers (2 vertical lines)
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 1 * s;
  ctx.beginPath();
  ctx.moveTo(p.sx - 8 * s, p.sy + 2 * s);
  ctx.lineTo(p.sx - 8 * s, p.sy + 14 * s);
  ctx.moveTo(p.sx + 8 * s, p.sy + 2 * s);
  ctx.lineTo(p.sx + 8 * s, p.sy + 14 * s);
  ctx.stroke();
}
```

### Mall (type = 'mall', size=2 — occupies 2×2 grid cells)

Footprint 104 × 80 (2 grid cells wide, slightly less tall).

```
   ┌────────────────┐
   │                │
   │  ┌──────────┐  │    <- big front glass panel with "M" glyph
   │  │    M     │  │
   │  └──────────┘  │
   │                │
   └────────────────┘
```

```js
function drawMall(b) {
  drawBuildingBase(b, 104, 80, COLORS.mall, RADIUS.mall);
  const s = state.view.scale;
  const p = w2s(b.x, b.y);

  // Large glass front (centre lower 70%)
  ctx.fillStyle = COLORS.mallGlass;
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = STROKE * s;
  roundedRect(p.sx - 38 * s, p.sy - 18 * s, 76 * s, 30 * s, 4 * s);
  ctx.fill(); ctx.stroke();

  // 'M' glyph in ink
  ctx.fillStyle = COLORS.ink;
  ctx.font = `700 ${20 * s}px -apple-system, "SF Pro Rounded", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('M', p.sx, p.sy - 3 * s);
}
```

### Office (type = 'office')

Footprint 40 × 68 (taller than wide — reads as multi-storey).

```
   ┌──────┐
   │▫ ▫ ▫│    <- dense window grid, 3 cols × 5 rows
   │▫ ▫ ▫│
   │▫ ▫ ▫│
   │▫ ▫ ▫│
   │▫ ▫ ▫│
   └──────┘
```

Window grid: each window 5×6u, spacing 4u. Cool-grey body with lit
or unlit windows depending on `state.timeOfDay`.

### Industrial (type = 'industrial', size=2)

Footprint 100 × 60. Boxy with **2 short chimneys** poking out of the
top.

```
      │ │  │ │
   ┌──┴─┴──┴─┴──┐
   │ ▭▭▭  ▭▭▭ │    <- 2 wide metal-panel windows
   │           │
   └───────────┘
```

Muted olive body, dark-slate chimneys, no pitched roof.

### Building placement ground-tile (the "base")

One more polish move: when a building is placed, draw a slightly
lighter cream-coloured rounded square *underneath* it, 110% of the
building's footprint. This creates a subtle "pad" that grounds it
to the map. Colour: `bg` mixed toward white by 20%.

This is the single most effective MM-style polish move you can add
to buildings — it makes them feel *seated* in the world.

---

## 6. Entry gates

Currently: filled yellow disc with arrow. Upgrade:

```
    ┏━━━━┓      <- two posts (roadEdge) 3u wide, 14u tall
    │  ↓ │      <- arrow indicating car-enter direction
    ┗━━━━┛      <- base plate (darker slate)
```

Replace the disc with a **gateway** rendering:
- Base plate: rounded rect 28×10, colour `roadEdge`.
- Two short posts rising 10u from the base, at ±10 offset, colour
  `ink`.
- Optional roof bar 2u tall connecting the post tops, colour
  `accent`.
- Directional arrow *centered in the gate opening*, colour
  `accentSoft`.
- Drop shadow per shared pattern.

Gates rotated 90° for N/S vs E/W. When new edge entries appear
(Stage D), animate them fading in over 600ms with an ease-out curve.

---

## 7. Grid dots

Already subtle. Tune:
- Radius: 1.2u (current) → keep.
- Alpha: fade from 0.08 (zoomed out) to 0.22 (zoomed in) — steeper
  than current.
- Colour: `grid`.
- Render only at grid intersections visible in viewport.

When the Building tool is selected, grid dots brighten to 0.4 alpha
— signals "placement is snap-to-grid" without a tutorial.

---

## 8. Pressure rings (requires Stage A.2 data — `building.pressure`)

An arc around each building fills clockwise from 12-o'clock as
`building.waiting / building.capacity` grows.

```
       ⌒ ⌒ ⌒        <- arc fills clockwise as pressure rises
      ╱       ╲
     ⌒  ┌──┐   ⌒
        │🏠│
     ⌒  └──┘   ⌒
      ╲       ╱
       ⌒ ⌒ ⌒
```

Render:
- Position: centred on building centre.
- Radius: building footprint diagonal / 2 + 6u.
- Stroke: 3u wide.
- Colour: interpolated from `good` → `warn` → `bad` as
  `pressure` goes 0 → 0.7 → 1.0.
- When `pressure >= 1.0`: pulse alpha 0.5 ↔ 1.0 at 2 Hz.
- Only draws when `pressure > 0.15` (so empty buildings aren't
  cluttered with a faint ring).

---

## 9. Delivery burst effect

Triggered on every `building.visits++` or edge-exit delivery.

- Expanding ring: starts at building centre, radius 8u → 28u over
  400ms, ease-out.
- Ring colour: `good` → fades to transparent over lifetime.
- Stroke width: 3u → 0u over lifetime.
- Floating `+1` text: starts at building centre, rises 24u over
  600ms, ease-out, fades from opaque to transparent. Colour: `good`
  on visit, `accent` on edge-exit. Font: `700 14u`.

Store active bursts in `state.bursts = []`, step them each frame,
remove when `lifetime >= 1`.

```js
function emitBurst(x, y, kind) {  // kind: 'visit' | 'exit'
  state.bursts.push({
    x, y, kind,
    t: 0,
    lifetime: kind === 'visit' ? 0.4 : 0.6
  });
}
function stepBursts(dt) {
  for (const b of state.bursts) b.t += dt;
  state.bursts = state.bursts.filter(b => b.t < b.lifetime);
}
function drawBursts() { /* per spec above */ }
```

Small, subtle, constant. Adds the "heartbeat" feel the game is
currently missing.

---

## 10. Day/night tint

A single overlay pass at the very end of `render()`. Time of day
drives opacity and colour:

```js
const CYCLE = 90;   // one full day in seconds
const t = (state.time % CYCLE) / CYCLE;    // 0..1

// Phases: 0 = dawn, 0.25 = midday, 0.5 = dusk, 0.75 = midnight
function tintForTime(t) {
  if (t < 0.2)        return { color: 'rgba(90, 120, 180, 0.18)', phase: 'dawn' };
  if (t < 0.45)       return { color: 'rgba(0, 0, 0, 0)',         phase: 'day' };
  if (t < 0.6)        return { color: 'rgba(200, 120, 70, 0.22)', phase: 'dusk' };
  return                     { color: 'rgba(30, 40, 80, 0.38)',   phase: 'night' };
}

function drawTint() {
  const tint = tintForTime(t);
  if (tint.color === 'rgba(0, 0, 0, 0)') return;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = tint.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}
```

Also stash `state.timeOfDay = tint.phase` so building/car renderers
can conditionally light windows or headlights.

Speed: 90 seconds is short enough to see a cycle in one session but
long enough to feel atmospheric. Can be made configurable later.

When night, sprinkle **tiny star dots** at random (but stable —
deterministic by grid coord) grid intersections, only in empty
cells. Radius 0.6u, colour `rgba(255,255,255,0.7)`.

---

## 11. Ambient decoration

Restraint matters. Target density: **3–5 decorations per viewport
at default zoom**.

### Grass tufts
- Placed once at game start at a deterministic pseudo-random scatter
  of grid intersections far from any starter road/building.
- Drawn as 3 small overlapping green circles, colour `#87a870` with
  10% darker outline.
- Fade out when a building or road enters that grid cell (check in
  the render loop; skip tufts within 30u of any edge or building).

### Trees
- Similar density, only in "empty district" cells (where no road has
  been drawn within 60u for 10+ seconds of gameplay).
- Single canopy circle, radius 8u, colour `#7a9a6a`. 40% darker oval
  shadow below.

### Lamp posts
- Along roads at 120u intervals once roads are built. Rendered as
  small dark vertical rects with a tiny bulb on top.
- At night, the bulb glows — warm yellow circle, radius 4u, slight
  blur. This is what sells the night mode.

**Do not add**: pedestrians, animals, animated flags, moving
anything. The only thing that moves in our game is cars.

---

## 12. Motion & juice (micro-animations)

Short timings. Every ease is `easeOutCubic` (`1 - Math.pow(1-t, 3)`)
unless noted.

| Event | Duration | Animation |
|-------|----------|-----------|
| Road drag committed | 200ms | Road appears with alpha 0→1 + stroke-width 0→full |
| Building placed | 300ms | Scale 0.7 → 1.0 + alpha 0 → 1 (pop in) |
| Building upgraded | 400ms | Scale pulse 1.0 → 1.08 → 1.0 |
| New edge entry opens | 600ms | Slide in from off-screen + 2-note chime |
| Delivery | 400ms | Burst ring (see §9) |
| Pressure full | continuous | Ring alpha 0.5 ↔ 1.0 @ 2Hz |
| Week-end card | 250ms | Modal fade-in, sim dims to 70% alpha |
| Tool switched | 100ms | Active button scale 1.0 → 1.05 → 1.0 |
| Demand slider drag | live | Value text pulses scale 1.0 → 1.1 → 1.0 each step |

None of these require a motion library. `t = Math.min(1, elapsed / duration)`,
`eased = 1 - Math.pow(1-t, 3)`, apply. Every anim lives in
`state.animations[]` stepped each frame.

---

## 13. UI chrome polish

`style.css` is already 90% there. Small refinements:

### HUD bar
- Add **tiny stat icons** next to each HUD label (Delivered, Visits,
  Flow). Use Unicode:
  - Delivered: `⬢`
  - Visits: `✓`
  - Flow: `≈`
- Slightly reduce label font size (10→9px), increase value size
  (20→22px). More emphasis on the *value*, less on the label.

### Demand slider
- Thumb: currently 18×18 disc. Change to **rounded-square** 22×14
  with a vertical accent line in centre, like a real audio fader.
  Reads as "precise tool" instead of "generic slider".
- Track: thicker at 6px (up from 4px).
- Value display: sits **inside** the thumb (small ×1.0 text, white).

### Jam meter
- Add **segment ticks** at 0.25, 0.5, 0.75 positions as thin dark
  lines across the fill. Gives the bar measurement, not just vibes.
- Change "Jam" label to "Pressure" — matches the per-building
  terminology we're introducing.

### Toolbar
- Currently good. Add a **very subtle active-tool breathing**
  animation: active button's background alpha pulses 0.95 ↔ 1.0 at
  0.5 Hz. Communicates "this is on" without shouting.
- **Icon improvements**:
  - Road: keep `━`.
  - Bridge: change `⌒` to `〜` (wavy — reads as "cross under/over").
  - Roundabout: keep `◯`.
  - Building palette: change single `▢` to a tiny triple-stack icon
    `🏠 🏪 🏬` (three small building silhouettes).
  - Erase: change `✕` to `⊘` (prohibition-style — softer).

### Splash card
- Current splash is fine. Add a subtle **animated demo** in the
  background: a single car looping a square road circuit behind the
  card at 50% opacity. Sells the game's core loop in one glance.
- Tagline under "Traffic Flow": currently "Keep the cars moving".
  Change to "**Design a city. Watch it work.**" — states the
  proposition more precisely.

### Toast notifications
- Already exist. Add slight slide-up on appear (200ms, ease-out,
  translateY from +10px to 0).

---

## 14. Typography pass

Stick with system-rounded: `-apple-system, BlinkMacSystemFont, 'SF Pro
Rounded', 'Segoe UI Rounded', 'Avenir Next', sans-serif`. Already set.

Use exactly **three** weights:
- **800** — big numbers (HUD values, game-over score, week number)
- **700** — labels, buttons, building glyphs
- **500** — body copy, hint text

No italics. No 400. No serifs. Calm design system.

Tracking:
- `-0.02em` on display sizes (24px+).
- `0` on body.
- `0.1em` uppercase on `.k` labels (already set).

---

## 15. Render stack (the authoritative order)

Every frame, in this order. Skipping or reordering breaks the look.

```
1.  Clear canvas → bgDeep fill
2.  Map frame → bg fill inside play area + soft inner shadow edge
3.  Grid dots
4.  Ambient decoration layer 1 (grass tufts — behind roads)
5.  Terrain polygons (rivers, parks — when Stage F ships)
6.  Road shadows (bridges cast shadows below)
7.  Road casings (all non-bridge)
8.  Road bodies
9.  Road stripes
10. One-way arrows
11. Highway double stripe
12. Junction marker dots
13. Roundabout centre discs
14. Ambient decoration layer 2 (trees, lamp posts — in front of roads)
15. Building ground-tiles (the lighter cream "pads")
16. Building shadows
17. Building bodies + details (per type)
18. Entry gates
19. Pressure rings (above buildings, below cars)
20. Cars (y-sorted)
21. Burst effects (delivery rings, floating +1s)
22. Drag preview (current-tool ghost)
23. Lamp-post bulbs glow (night only, above everything)
24. Day/night multiply tint (full-viewport)
25. HUD (DOM — not canvas)
```

Currently the code renders ~1, 3, 7–9, 14, 17, 20, 22. Everything
else is an addition.

---

## 16. Implementation order (the walkthrough)

Ship in this order. Each step alone is visible; together they
compound.

### Pass A — **silhouette** (biggest single win)
**What:** Implement §4 (oriented cars) and §5 per-type building
renders (House/Shop/Mall at minimum — Office/Industrial later).
**Why first:** The game currently looks abstract. This pass alone
makes it read as a city with cars. Maximum perceived-quality jump
for a single pass.
**Estimate:** ~1 afternoon.

### Pass B — **ground** (cohesion)
**What:** Map frame (§2), building ground-tiles (end of §5), junction
marker dots (§3), y-sorted car rendering (§4).
**Why:** Everything starts feeling *seated in a scene* instead of
floating.
**Estimate:** ~2–3 hours.

### Pass C — **life** (the heartbeat)
**What:** Delivery burst effect (§9), pressure rings (§8 — requires
`building.pressure` from Stage A.2 first, but the render can be built
against a stub).
**Why:** The game starts *reacting*. Every delivery becomes a tiny
reward. Every congestion becomes a visible warning.
**Estimate:** ~3–4 hours including tuning.

### Pass D — **atmosphere** (the alive world)
**What:** Day/night tint (§10), lamp posts + night-glow (§11), lit
windows at night (§5).
**Why:** The world feels like it has time passing, not a frozen
scene.
**Estimate:** ~4 hours.

### Pass E — **decoration** (the sparing touch)
**What:** Ambient grass + trees (§11), restrained, deterministic
placement. Only as much as reads as "world" not "clutter".
**Estimate:** ~2 hours.

### Pass F — **chrome** (UI refinement)
**What:** §13 full list — demand slider, jam bar, toolbar, HUD stat
icons, splash demo car, new tagline.
**Why:** Out-of-canvas polish. Players touch this every frame.
**Estimate:** ~3–4 hours.

### Pass G — **juice** (micro-anims)
**What:** §12 table in full. Road drag-in, building pop-in, tool
switch pulse, week-card fade.
**Why:** The last 5% that makes everything feel *responsive* rather
than *static*.
**Estimate:** ~2–3 hours.

**Total polish budget:** roughly 2–3 focused days of build-session
work for all 7 passes. Can be split across many sessions; each pass
is independently shippable.

---

## 17. What NOT to do (same anti-patterns as visual-direction.md)

- No sprite sheets or image assets. Everything procedural. Single-
  file static deploy stays sacred.
- No gradients on buildings. Flat fills only.
- No parallax, no fake-3D perspective. Top-down is top-down.
- No camera shake. Not that kind of game.
- No particle effects beyond the delivery burst. Dust, smoke,
  explosions — wrong vibe.
- No animated flags, swaying trees, blowing leaves. Stillness is
  a feature.
- No colour-coded buildings where colour *is* the gameplay. One car
  colour; building type is communicated by shape (silhouette comes
  first, colour second).
- No HUD number over 3 characters visible at once. Dense readouts
  kill the calm.

---

## 18. Acceptance — "does it look shipped?"

The build session can do a self-check after each pass. If you can
honestly answer *yes* to all of these after Pass G, we're shipped:

- [ ] At default zoom, cars are clearly recognisable as cars.
- [ ] Without reading any text, you can tell a house from a shop
      from a mall from 2m away.
- [ ] Every raised object casts a drop shadow in the same direction.
- [ ] Every delivery triggers a tiny visual reward.
- [ ] Every overloaded building signals it visually.
- [ ] The map has a visible boundary.
- [ ] The world has a perceptible time of day.
- [ ] The grid is visible when the Building tool is active,
      recessive otherwise.
- [ ] The demand slider looks more precise than a generic slider.
- [ ] A screenshot of the game could plausibly appear in a
      "cozy games" roundup.

The last one is the bar. Everything in this doc serves it.

---

## Sources / references

- [Dinosaur Polo Club — Behind the scenes: concepting Mini Motorways](https://dinopoloclub.com/2023/07/23/behind-the-scenes-concepting-mini-motorways/)
- [Twinfinite — Dinosaur Polo Club interview on aesthetics](https://twinfinite.net/features/mini-motorways-interview-dinosaur-polo-club-talks-aesthetics-traffic-their-name/)
- [Blake Wood's Mini Motorways portfolio](https://blakemwood.com/projects/4bxqw2)
- [Fonts In Use — Mini Motorways logo and interfaces](https://fontsinuse.com/uses/51247/mini-motorways-logo-and-interfaces)
- [Dinosaur Polo Club — Homepage](https://dinopoloclub.com/)
- [Vlambeer / Jan Willem Nijman — The Art of Screenshake](https://www.youtube.com/watch?v=AJdEqssNZ-U) (the general principle: polish is the game)
- [GameDev Academy — Game Feel tutorial](https://gamedevacademy.org/game-feel-tutorial/)
- [RPG Playground — Making a juicy game](https://rpgplayground.com/research-making-a-juicy-game/)
- [Spicy Yoghurt — Canvas rotation pattern](https://spicyyoghurt.com/tutorials/html5-javascript-game-development/images-and-sprite-animations) (for oriented car code)
