# Traffic Flow — dev notes

Running notes so we don't lose direction between sessions.

> **What's next:** see `RESEARCH.md` (the other session's roadmap).
> **Coordination rules:** see `docs/COORDINATION.md`.

## Shipped log

Newest at the top. One line per deploy.

- **2026-04-24 — v19 (colour, properly)** — Cars are a cheerful
  pastel mix now (10 colours: coral / dusty blue / sage / amber /
  lavender / rose / deep blue / honey / olive / plum) instead of
  slate variations. Main visual lever — these things are what the
  player watches. Entry-queue dots now match their gate's colour
  (each gate already has its own pastel from v18) so a piling-up
  queue reads as "North gate is backed up" at a glance. Coloured the
  HUD values too: Score orange (was), People sage, Flow dusty blue.
- **2026-04-24 — v18 (score system + colour + ambient life)** —
  Score is now the hero stat. Points per event: Mall visit +3, Shop
  visit +2, House visit +1, Delivery +1. Best score persists across
  resets. HUD shows current Score in big orange, "best N" underneath
  when the current run is below peak. No game-over — it's pure
  "how high can you push it before it clogs."
  Entry gates now colour-coded by side: N sage, S dusty blue,
  E warm peach, W muted lavender. Makes each direction memorable.
  Ambient decor: a sparse procedural scatter of tree canopies and
  grass tufts across empty land (seeded, so placements are stable
  across reloads). Roads render on top so built-up areas still look
  tidy. Gives the map a place-like feel instead of a blank page.
  New favicon: little scene with a road, a pitched-roof house, an
  office building and an orange car — matches the game's palette.
- **2026-04-24 — v17 (one-way roads + SVG toolbar)** —
  New **One-way** tool (keyboard `3`): tap any road to remove its reverse
  twin and make it one-way; tap again to restore two-way. Cars respect
  the direction (routing already used adjacency which is automatically
  consistent). Direction chevrons (little `>` arrows in the road's lane
  colour) render along every one-way segment so the flow is obvious.
  Two-way roads keep their dashed centre stripe; one-way roads get
  chevrons instead.
  Toolbar: replaced every unicode glyph with inline SVG line icons
  (Road, Bridge, One-way, Roundabout, House, Shop, Mall, Erase, Undo).
  Button styling: soft white cards with 1px border and subtle shadow;
  hover lifts slightly with stronger shadow; active tool is big orange
  with inset shadow for a proper "pressed" feel. Much less prototype-y.
- **2026-04-24 — v16 (houses as origins + People HUD + building variety)** —
  Houses now generate their own traffic. Each house spawns a car every
  5.5s (scaled by the Demand slider) heading to a random Mall / Shop /
  edge-exit weighted 40 / 30 / 30. If nothing's reachable it falls
  through. This is the conceptual unlock where the city itself
  becomes the traffic source, not just pass-through from the edges.
  Added a People stat on the HUD (houses × 2) for that city-growing
  feel. Houses and Shops now draw with subtle per-instance colour
  variation (5–6 swatches each) so a neighbourhood of houses looks
  like a neighbourhood, not a clone farm.
- **2026-04-24 — v15 (orthogonal drag + Stage E visual pass #1)** —
  Fixed the "slightly-angled road" bug: road drags with free ends now
  axis-align to the start. If the drag is clearly horizontal or
  vertical (>1.4× ratio) the perpendicular axis is forced to match
  start; otherwise snaps to a 45° grid-stepped diagonal. No more
  off-axis roads when you just wanted straight ones. First Stage E
  polish: cars are now oriented rounded rectangles with a windshield
  and tiny headlight dots (was: coloured circles). Delivery burst
  effects: green expanding ring at each block visit, warm-orange one
  at each exit deliver — makes flow completions feel satisfying.
- **2026-04-24 — v14 (persistence)** — localStorage save-and-restore.
  Every meaningful edit (road, block, erase, undo, roundabout, demand
  slider) triggers a 600ms debounced save. Boot detects a saved city
  and flips the splash to "Continue" + "Start fresh" (secondary text
  button). Restored cities drop the player into the game without
  re-seeding the scene, so their cars respawn fresh but all
  infrastructure + counters (delivered / visits) stay. Schema versioned
  (v:1) — future breaking changes silently reset. Also: small CSS
  polish on toolbar active state (subtle lift + stronger shadow).
- **2026-04-24 — v13 (Stage A.1 finish + pressure rings)** — Weighted
  dispatch: cars rolling out of a gate now pick a destination *category*
  first (Mall 40 / Shop 30 / House 5 / Exit 25) and then a random
  instance of that type, falling through if there are none. Malls are
  visibly more popular than Shops, Shops more than Houses. Added
  Mini-Metro-style pressure rings behind each building that arc-fill
  with incoming car count (green→amber→red). Capacity is 3 for Shops
  and Houses, 5 for Malls. Visible signal for "the bottleneck is here."
- **2026-04-24 — v12 (Stage A.1)** — Typed buildings: House, Shop, Mall
  replace the single "Block" tool. Distinct procedural renders per type
  (pitched-roof cottage, shop with awning, glass-front mall). Different
  dwell times at each (House 2.6s, Shop 2.0s, Mall 4.0s). Mall is a
  size-2 building visually. Cars still pick destinations uniformly at
  random — weighted dispatch by type comes in a follow-up.
- **2026-04-24 — v11** — Grid system. 60-unit grid, subtle visible dots,
  road free-endpoints and block placements snap to grid when unanchored.
  Entries and starter road re-positioned onto grid multiples.
- **2026-04-24 — v10** — Block tool (placeable destinations with 2.2s
  park-and-leave), Visits HUD counter, Undo button, bigger 1200×1560
  portrait map. Hotfix: defined missing `roundedRect` helper + wrapped
  frame loop in try/catch so single-frame bugs can't permanently hang
  the sim.
- **2026-04-24 — v9** — Dropped colour pairs (drivers are drivers).
  Four N/S/E/W edge gates with pass-through traffic. Manual Demand
  slider (0×–3×). Two-finger pan on top of pinch-zoom for tablet.
- **2026-04-24 — v8** — Erase works on any road (removed custom-only
  restriction). Tap snap radii scaled with zoom. Queue cap per entry.
- **2026-04-24 — v7** — Free-end road endpoints (dead-end nodes allowed
  in empty space). Touch-friendly snap radii in screen pixels.
- **2026-04-24 — v6** — Explicit T-junctions + rejected crossings. Road
  tool refuses to cross another road; use Bridge to go over, or snap the
  endpoint directly onto an existing road for a T-junction.
- **2026-04-24 — v5** — Fixed "bounce backwards" bug in `splitEdgeAtPoint`.
  Removed game-over gridlock popup (sandbox mode).
- **2026-04-24 — v4** — Teal pair starts disconnected; Roundabout tool
  converts 3+ way junctions to counterclockwise one-way rings.
- **2026-04-24 — v3** — Stripped back to abstract pixel-space, hand-
  placed houses/shops. Abandoned Fuengirola OSM data (moved to sibling
  project). Mini-Motorways-style drag-to-build.

## Two sibling projects

1. **`APPS/traffic-fix/`** — v1, shelved. Loads real OSM data for any lat/lon via
   Overpass, overlays satellite tiles, simulates traffic with IDM, lets the
   player edit the network (signals, roundabouts, one-ways, widening, etc.).
   Visually dense and more of an *engineering* tool than a game. Live at
   https://traffic-fix.vercel.app. Keep around — the OSM+sim backbone will be
   useful for the eventual "real place" mode.

2. **`APPS/traffic-fix-game/`** — this project, the playable side. Abstract
   pixel-space level, bright palette, Mini-Motorways-feel. Live at
   https://traffic-fix-game.vercel.app.

The ultimate direction the user wants: a game in THIS project's feel, but
optionally loading a real-world intersection as the level layout. i.e. merge
the two: keep the pixel-stylised look and clean gameplay, but bake in real
road topology from OSM as the starting scene.

## Architectural decisions made (stick with these unless we have a reason)

- **Pixel-space coords.** No metres. Logical canvas is 1200×800 units; the
  renderer fits that into whatever screen we're on. Makes it much easier to
  reason about sizes and snap distances than OSM's real-world metres.
- **Car following.** Custom smooth leader-follow (not IDM). Simpler, no
  tuning nightmares. In `stepSim` — search for `CAR_FOLLOW_TRIGGER`.
- **Routing.** Dijkstra per car on spawn. In-flight cars commit to their
  path — they don't re-route mid-journey. This is the Mini Motorways model
  and avoids the "bounce backwards" class of bugs.
- **Edge splits at T-junctions.** When you drag a road whose end lands on
  an existing edge, that edge is split at the snap point and cars already
  on it are migrated correctly onto the new tail half. See
  `splitEdgeAtPoint` — it's the trickiest bit of the codebase.
- **Crossings rejected unless Bridge.** Road-through-road was surprising.
  Now a road drag that would cross an existing road fails with a red
  dashed preview. Bridge tool is the explicit way to pass over.
- **Free-end endpoints allowed.** Roads can end in open space (creates a
  dead-end node). Start of a road must anchor to a node or edge.
- **Snap radii scale with zoom.** ≈30 screen-px node / 22 screen-px edge.
- **No game-over popup** (for now). Sandbox feel — jam bar fills
  visually when queues stack up but the sim keeps running.

## Current level model (v9 pivot)

- Four **edge entries** (N / S / E / W) — cars enter one and exit another.
  Pass-through traffic, no house/shop colour pairs any more.
- **Manual demand slider** replaces the auto-ramp. Player controls how
  many cars come in. Can stop entirely to repair the layout, then crank
  it up to stress-test.
- Single grey car colour — "drivers are just drivers."
- Starter road runs W ↔ E. N and S entries start disconnected → the
  player's first move is to build a road to connect them.

## Next likely iteration (not yet built)

- **Placeable blocks / buildings.** Currently cars just pass through
  edge-to-edge. Next step: the player can drop building blocks (malls,
  urbanisations) as *destinations*. Cars then enter, go to a block, park
  (disappear), and maybe new cars spawn at the block going back out.
- **Weekly structure / escalation** — periodic new entries opening up,
  or new blocks being built by simulated growth.
- **Sound / polish** — horn on jam, ding on delivery, background loop.

## Pure static site deployment

No build step, no backend. Files served flat:

```
index.html
style.css
js/game.js
data/fuengirola.json   (legacy, still shipped but unused by v3+)
scripts/prep.js        (one-shot OSM prep for the shelved v1 direction)
```

To bake new OSM map data (for the future real-map mode):
```
node scripts/prep.js               # fetches Overpass, writes data/fuengirola.json
USE_CACHED=1 node scripts/prep.js  # reprocess from cached raw data
```

Vercel auto-deploys from `main` on push.

## File layout cheat sheet (game.js ~750 lines, single file)

Top-down:
1. Tuning constants
2. Global `state` object
3. Geometry helpers (`polyLen`, `sampleEdge`, `segIntersect`, etc.)
4. Network helpers (`makeNode`, `makeEdge`, `rebuildAdjacency`)
5. `findNearestNode` / `findNearestEdge` / `findNearestEdgePoint`
6. Road building (`addRoad`, `splitEdgeAtPoint`, `eraseEdgeById`)
7. `makeRoundabout`
8. Routing (`routeFromNode`)
9. Sim step (`stepSim`, `tryDispatchFromQueue`, `currentSpawnInterval`)
10. Render (`render`, `drawRoads`, `drawEntries`, `drawCars`, `drawDragPreview`)
11. Input (`setupInput`, `onPointerDown/Move/Up`, `zoomAt`)
12. Game state transitions (`startGame`, `restart`, `togglePause`)
13. Frame loop + boot
