# Traffic Flow — dev notes

Running notes so we don't lose direction between sessions.

> **What's next:** see `RESEARCH.md` (the other session's roadmap).
> **Coordination rules:** see `docs/COORDINATION.md`.

## Current features (what the player can do today — v26)

Single source of truth for "what this game actually is right now."
Update this list whenever a user-visible feature ships or is cut.

**Modes**
- **Free Play** — open sandbox, no money, no fail state. Score is the
  hero stat. Original v25 experience preserved.
- **Game Mode** — start with $200; pay to build, earn from visits, push
  the city until it overloads. Money is the hero stat (Score hidden).
  Soft-fail: 30 sustained seconds at jam ≥ 0.95 → City Collapsed screen
  with full stats and Best earned / Longest run persisted. Per-mode save
  slots so a sandbox city and a game-mode run live side-by-side.

**Economy (Game Mode only)**
- Costs: Road $5 + $1/grid, Bridge $30 + $1/grid, Roundabout $40,
  House $20, Shop $40, Mall $100. One-way toggle and Erase free.
- Income per visit: House +$1, Shop +$3, Mall +$8, edge-delivery +$1.
- Live road-cost preview while dragging; tool buttons show their cost
  and grey out when unaffordable. `+$N` / `-$N` floating popups make
  every income/spend event visible.
- ☰ menu button in the HUD returns to the mode picker.

**Building**
- Drag roads between any two points (orthogonal / 45° snap to grid)
- Build **Bridges** over existing roads (crossings are rejected for
  regular Roads — Bridge is the explicit tool)
- Convert a 3+ way junction to a **Roundabout** (one-way ring)
- Toggle a road to **One-way** (chevrons along the road show direction)
- **Erase** any road
- **Undo** last road / block placement (one level)

**Placeable buildings**
- **House** — residential origin (spawns cars every ~5.5s scaled by
  demand). 2 "people" per house on HUD. Dwell 2.6s, +1 score per
  visit.
- **Shop** — destination. Dwell 2.0s, +2 score per visit.
- **Mall** — size-2 destination. Dwell 4.0s, +3 score per visit.

**Traffic**
- 4 edge gates (N / S / E / W, each their own pastel colour) spawn
  through-traffic. Cars pick destination category (Mall 40 / Shop 30 /
  House 5 / Exit 25) and route via Dijkstra at spawn time.
- Houses also generate traffic to Mall 40 / Shop 30 / Exit 30.
- Cars visit a building, park the dwell time, then reroute to a
  random exit gate. Never loop back to their source.

**Feedback**
- Big **Score** stat (HUD, orange); **Best score** persisted under it.
- **People** count (houses × 2, sage).
- **Flow** per-minute (dusty blue) + 60-second sparkline showing the
  last minute's deliveries/min (green fill when above running avg,
  red when below). Beating your peak flow pops a "New peak!" toast.
- **Jam** meter (green → amber → red).
- Per-building **pressure rings** (green → amber → red based on
  incoming-car count vs capacity).
- Green **visit** burst + orange **delivery** burst + floating **+N**
  points popup on every scoring event.
- **Explicit Pause** (space / pause button) — sim fully frozen with a
  subtle cream overlay and centered "Paused" pill. Edits still work.

**Manual control**
- **Demand slider** 0× to 3× (turn off to plan, crank to stress-test).
- **Start fresh** button clears saved city.

**Persistence**
- Whole network, buildings, settings and scores auto-save on edit
  (debounced 600ms). Splash shows Continue / Start fresh on return.

**Map & decor**
- Portrait 1200×1560 logical world; pastel radial-gradient paper
  background.
- Subtle 60-unit grid dots.
- Seeded ambient decor: tree canopies, grass tufts, flower patches
  with small yellow centres — rendered below roads so built-up areas
  stay clean.
- **Day / night cycle** — 90-second loop shades the whole scene
  through dawn cyan → clear midday → warm dusk → deep-blue night
  with sparse twinkling stars fading in.

**Mobile-friendly**
- 1-finger drag = build.
- 2-finger drag = pan; pinch = zoom.
- Touch-scaled snap radii.

**Audio**
- Ambient synth pad (two detuned saws, lowpass w/ LFO, very quiet).
- Delivery chimes in a consonant pentatonic scale — House A4, Shop
  C5, Mall E5, edge-exit delivery F4 (one octave lower).
- Soft click when a road is successfully built.
- Mute button in HUD (persists across reloads, `m` shortcut).

## Shipped log

Newest at the top. One line per deploy.

- **2026-04-26 — v31 (city-driven traffic + road-required placement + bigger gardens)** —
  Three big changes that make the economic loop click. **Edge-gate
  spawn rate is now driven by destinations** — with no shops or malls,
  gates spawn nothing at all (cars from gates have no reason to come).
  Each shop counts 1, each mall counts 2. Sqrt scaling so growth is
  graceful: 1 destination → 16s/gate, 4 → 8s, 16 → 4s. Houses still
  generate their own internal traffic separately, so the *very* early
  game (1 house, 0 shops) has a few cars wandering to exits. The loop
  is finally honest: more houses → more residents → more traffic; more
  shops → more visitors come to spend; balance both → bigger income.
  **Buildings must be placed on or near a road** — non-park placements
  reject if there's no road within one grid step of the tap. Park
  remains decorative-anywhere. Tap handler now searches for a road
  within GRID range first, then grid-snaps the road point so buildings
  end up on clean intersections. **House gardens are now ~70 world
  units wide** (was 56) — soft hedge border, bright lawn, multi-tone
  grass texture patches, 5 colourful flower clusters with little
  green stems, and a stone path leading from the south edge of the
  plot to the door. Adjacent grid-step placements blend their lawns
  into a continuous green so a row of houses reads as a *neighbourhood*
  with shared greenery, not a wall.
- **2026-04-26 — v30 (axis-aligned snaps + 8-way roundabouts + proper bridges)** —
  Three v29 follow-ups. **Axis-aligned end snapping** — when you drag from
  one row to a parallel row, the end-snap candidate search now happens
  at the *axis-aligned target* first (cursor projected onto the start's
  row or column), so the line goes perfectly perpendicular instead of
  bending to wherever the cursor landed on the second road. Falls back
  to the raw cursor position only if nothing's at the aligned target,
  which is exactly when diagonal connections (like to a roundabout
  ring node) make sense. **Roundabouts always have 8 ring nodes** now
  — N / NE / E / SE / S / SW / W / NW — so you can drag a fifth
  approach in at a diagonal to one of the four "spare" corners. Cardinal
  approaches still align perfectly because their bearing maps exactly
  to a ring node. **Bridges look like bridges** — warm cream stone surface
  (#e0c79a) with a darker wood frame (#a47a44/#7a5a32) and short
  perpendicular plank stripes every 14 units along their length. A drop
  shadow underneath sells the "elevated" read. Drawn in a separate pass
  AFTER all regular roads so they always layer on top, no matter the
  edge id order.
- **2026-04-26 — v29 (grid pass + Parks/civic credits + toolbar hide)** —
  Big aesthetic / playability pass. **Roads are strictly axis-aligned**
  now — the 45° diagonal escape hatch is gone, every drag commits to
  horizontal or vertical. Combined with **roundabout radius 50 → 60** and
  **building placement always grid-snapped first**, junctions /
  roundabouts / building rows finally tile cleanly. **Park** is a new
  building type — green plot with three trees, a winding cream path, a
  bench. Costs $150 normally OR free with a civic credit. Acts as a
  passive bonus: any building (or exit gate) within 100px of a park
  earns +25% income on visits, stacking up to +75% from multiple parks.
  Visualised as a soft dashed circle around the park so you can plan
  placements.  **Civic credits (M5 v1)** — every $500 of cumulative
  earnings issues one credit, surfaced in a toast and a green badge on
  the Park tool. Spend the credit by placing a park — that's the closed
  reward loop the design doc has been asking for. **Toolbar hide /
  show** — chevron at the right of the bar collapses it to a small
  "Build" pill that re-opens it; great for phone where the bar took the
  whole bottom strip. Also: **mobile toolbar now scrolls horizontally**
  instead of cramping all 11 tools into 360px. Persisted: collapse
  state, civic credits, toolbar-hidden flag, all per-mode.
- **2026-04-26 — v28 (tiered goals + house gardens + collapsible goals panel)** —
  Goals now **tier up** — when you hit one, the bar resets and the
  next-tier goal slides in. Earn $500 → $2,000 → $10,000 → $50,000 →
  $250,000. House 30 → 100 → 300 → 1k → 5k people. Sustain $30/min →
  $100 → $300 → $1k → $5k. Each tier hit pays an escalating bonus
  ($100 → $25k) and a celebratory chime + sparkle burst. T1 / T2…
  badge in the corner; ★ when fully maxed (gold tier). **Houses now
  have garden plots** — soft sage rounded square ~56px wide with
  scattered greenery sprigs, so the visual footprint matches the
  placement footprint. Shops get a sandstone plaza of the same size.
  Two new placement rules: tapping near an existing building no longer
  snaps to its node (so a tap next door drops a new house instead of
  rejecting), and a 56-unit minimum spacing keeps plots from
  overlapping. **Goals panel is now collapsible** — tap the header to
  toggle; collapsed state persists in the save. Header shows live
  "X hit · Y maxed" summary so you know progress at a glance even
  collapsed. Dropped the unused INCOME_SUSTAIN_THRESHOLD constant in
  favour of per-tier thresholds.
- **2026-04-26 — v27 (slow-ramp + gate-reachability + targets + version pill)** —
  Three fixes for the v26 "starts too hot" feedback. **(1) Slow demand
  ramp** — universal across modes; spawn intervals start at 0.25× of full
  for 90 seconds and ease in to 1×, so the player has actual time to read
  the city before things get hot. **(2) Gate-reachability gate** —
  disconnected entries (N / S in the default starter map) no longer queue
  cars at all until the player builds a road that reaches them. Stops the
  "city collapses before you place anything" failure mode dead. **(3)
  Three targets in the HUD (game mode only)** — "Earn $500", "House 30
  people", "Sustain $30/min for 60s". Pills with progress fill on the
  right side under the HUD; hit one and you get +$100 bonus, a chime, six
  green sparkle bursts, and a permanent ✓. Targets persist in the save
  file. This is M2 from `make-it-a-game.md`. Plus: **build-version pill**
  bottom-right (`v27`) so we can verify a deploy reached the device
  without guessing.
- **2026-04-26 — v26 (Game Mode + app icon)** — The single biggest pivot
  since v3: this is now actually a game. Splash now opens with a mode
  picker — **Free Play** (the existing sandbox, unchanged) and **Game
  Mode** (new). Game Mode mechanics: start with **$200**; every road,
  bridge, building and roundabout costs money. Income comes from car
  visits — House +$1, Shop +$3, Mall +$8, edge-delivery +$1. The closed
  loop is exactly what `make-it-a-game.md` asked for: more buildings →
  more cars → more visits → more money → more buildings, until the city
  is overwhelmed. Crash condition: **Jam meter ≥ 0.95 for 30 continuous
  seconds** triggers City Collapsed gameover with full stats card
  (survived, peak people, deliveries, visits, best earned, longest run).
  Bests persist across runs. Save state is per-mode (separate localStorage
  keys) so a saved sandbox city and a saved game-mode run live side-by-
  side. Each tool now shows a green cost pill in the toolbar (game mode
  only); roads and bridges show a live `$N` next to the drag preview that
  turns red if you can't afford it. Spend events show a `-$N` floating
  popup at the placement spot; income events show a green `+$N`. New ☰
  menu icon in the HUD takes you back to the mode picker. App icon
  (`images/icon.png`, 512×512, the red sports car art) replaces the
  generated favicon SVG and serves as the apple-touch-icon for home-
  screen PWA use.
- **2026-04-24 — v25 (pastel-green map, coloured button borders, Flow fix)** —
  Canvas background shifted from warm cream to pastel sage-green
  radial gradient (`#ebefd4` centre → `#c7d3a4` edges). The map now
  reads as parkland, not a blank page. Each toolbar button gets a
  **coloured border** matching its icon tint (House gold, Shop red,
  Mall blue, Road slate, Bridge lavender, One-way blue, Roundabout
  green, Erase red) so the toolbar has colour at rest. Active state
  still swaps to full orange to be unmissable. Labels got
  `text-overflow: ellipsis` so "ROUNDABOUT" on a narrow iPhone no
  longer bleeds into neighbouring buttons. **Flow HUD bug fix:** the
  per-minute number was computed as `delivered / time * 60`
  cumulative since load, which spiked to thousands immediately after
  restoring a saved city. Now uses the average of the last 10
  sparkline samples — shows what's actually happening *right now*.
- **2026-04-24 — v24 (A5: day/night tint + stars)** — 90-second
  cycle loops the whole scene through dawn (cool cyan, α 0.15) →
  clear midday (α 0) → warm dusk (orange, α 0.22) → deep-blue
  midnight (α 0.42) → back to dawn. Six-keyframe linear interpolation.
  Overlay drawn after all gameplay layers in screen coords so it
  tints buildings and cars too. 70 seeded stars scatter across the
  upper 60% of the sky; each fades in once night alpha crosses 0.22
  and slow-twinkles on its own phase offset. Pause freezes the cycle
  too since `state.time` stops advancing.
- **2026-04-24 — v23 (A3: sound pass 1)** — Shipped Pass 1 of
  `docs/research/sound.md`. Web Audio API, lazy-init on Start button
  (required for iOS Safari). No audio files — everything synthesised.
  Content: (1) an ambient synth pad — two detuned sawtooth oscillators
  through a lowpass filter at 800 Hz with a 0.2 Hz LFO modulating the
  cutoff, master gain 0.05; (2) per-building delivery chimes on a
  pentatonic scale — House A4, Shop C5, Mall E5, edge-exit F4
  (lower octave), 180ms sine bursts with exponential envelopes; (3)
  a soft square-wave click with pitch decay on every successful road
  build. Mute button (🔊 / 🔇) in HUD with `m` keyboard shortcut.
  Mute state persists in localStorage. Skipped jam-tone and gate-open
  (research said Pass 1 only).
- **2026-04-24 — v22 (A2: flow sparkline + peak callout)** — The
  Flow HUD stat now carries a 120×24 canvas sparkline showing the
  last 60 seconds of delivery rate (sampled once per simulated
  second). Fill / line colour is green when the current second is
  at or above the rolling 60s average, red when below. A faint
  terracotta dashed line at the top marks "peak this session".
  The whole samples array and peak persist in the save file so a
  tomorrow-session's sparkline keeps its history. Beating your
  session peak pops a short "New peak flow: N/min" toast — small
  dopamine for pushing the city harder. This is the missing
  feedback signal of 'did my last change help?'.
- **2026-04-24 — v21 (A1: explicit Pause)** — Proper pause. Tapping
  the pause icon or pressing Space freezes the sim entirely — cars
  stop, spawning stops, pressure rings stop changing, timers stop.
  A subtle cream-wash overlay fades in across the whole map and a
  terracotta "Paused" pill slow-breathes at top-centre to make the
  state unmissable. The overlay doesn't block interactions so you
  can still edit roads and place buildings while paused — Pause
  becomes the primary planning mode.
  Also added: `## Current features` section at the top of NOTES.md
  per B4, a single source of truth for "what this game is right
  now."
- **2026-04-24 — v20 (interface colour pass + point popups)** —
  HUD, toolbar and splash panels got a warm peach-gradient background
  and a four-gate accent stripe across the top (sage / blue / peach /
  lavender — the gate colours). Toolbar icons now each carry their
  own resting colour tied to what they make in the world: House gold,
  Shop terracotta, Mall blue-grey, Bridge lavender, One-way blue,
  Roundabout green, Erase red, Road slate. Active tool still turns
  full orange so the selected state is obvious. Canvas bg replaced
  with a subtle radial gradient (lighter centre, richer paper tone
  at the edges). Decor gains flower patches alongside trees and grass
  — five bright flower colours on soft green bases. Plus a gameplay-
  juice addition: every scoring event now spawns a floating "+N"
  popup (terracotta text with a cream shadow) that rises and fades —
  makes every car's arrival feel rewarding.
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
