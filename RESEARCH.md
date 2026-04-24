# Traffic Flow — Research & Roadmap

> This doc is the **forward-looking brief** for the build session. `NOTES.md`
> is the dev log of what *has* shipped (source of truth for how the code
> currently works). Read both.
>
> Owned by the research session — it keeps this up to date with new
> references, specs, and re-prioritisation. The build session reads it,
> picks a Stage, and implements.

## How the two sessions coordinate

Two Claude sessions are working in parallel on the same folder:

- **Research session** (me) — writes and maintains this file. Produces
  specs, reference material, priority calls, and visual direction.
  Does **not** touch `js/game.js`.
- **Build session** — owns `index.html`, `style.css`, `js/game.js`.
  Reads this doc, picks the next Stage, implements, updates `NOTES.md`
  with a 1-2 line "Shipped" entry per feature.

**Protocol:**

1. Build session starts every session by skimming the **STATUS** block below
   and the `## Stage N` it's working on. If the stage is done, ticks the
   checkboxes, and moves on to the next.
2. When build session ships a feature, append a one-liner to `NOTES.md`
   under a "## Shipped log" section (e.g. `2026-04-24 — Stage A.1: Houses
   and Shops as placeable types`).
3. When the user wants a new feature, they ask the research session first —
   I'll write a spec in this file under the right stage. Avoid ad-hoc
   additions so the direction stays coherent.
4. No merge conflicts possible because the two sessions write disjoint
   files (this one only writes Markdown; the other only touches code).
5. If the build session disagrees with a spec mid-implementation, leave a
   `// RESEARCH-NOTE: …` comment in `game.js` and flag it — research
   session will read code during next pass and update the spec.

**STATUS (update when shipped):**

- [x] Stage A — Typed buildings *(A.1 v12: placement + visuals; A.2 v13: weighted dispatch + pressure rings. A.3 v16: houses-as-origins, per-building colour variation.)*
- [x] **next-features #1 — Persistence** shipped v14 *(save + Continue vs Start-fresh splash). Playtest P1 "loadState never called" is likely resolved by v14 but needs re-verification (playtest last pass was v13).*
- [x] **next-features #4 — One-way road tool** shipped v17 (keyboard `3`, chevron rendering, respects routing).
- [x] **Score system** shipped v18 — points per event (Mall +3, Shop +2, House +1, delivery +1), best-score persistence.
- [x] **Stage E — Visual polish** *walking* — v15 (oriented cars + delivery bursts), v17 (SVG toolbar icons), v18 (colour-coded gates + ambient decor + new favicon), v19 (pastel car palette + queue colour-tinting + coloured HUD).
- [ ] Stage B — Demand curve & rush hour
- [ ] Stage C — Traffic control upgrades (traffic lights, highway)
- [ ] Stage D — Weekly progression & scoring loop (upgrade draft)
- [ ] Stage E remaining passes — map frame (design-pack §2), day/night tint (§10), sound (§12), soft goals, pause button, flow sparkline — see `optimization.md` for the next-ship priorities.
- [ ] Stage F — Terrain & pre-built scenarios
- [ ] Stage G — Audio (specced in `sound.md`, not yet shipped)
- [ ] Stage H — Real-world mode (OSM import, long horizon)

## Playtest signal (from `docs/testing/`)

Playtest session last ran at v13. Build has shipped v14-v19 since —
**6-version QA backlog**. The known-issues list is stale:

- P1 **Persistence is write-only** — `loadState` exists but no caller.
  *Almost certainly resolved by v14* ("Boot detects a saved city and
  flips the splash to Continue / Start fresh" per NOTES). Needs
  re-verification; close if fixed.
- P1 **Queue dispatch is LIFO** — `entry.queue.pop()` instead of
  `.shift()`. Unknown whether fixed. Playtest needs to check.
- 6 × P2 + 4 × P3 + 2 × P4 also pending re-verification.

**Action:** next playtest session should first catch up on v14-v19
diffs and close/reopen issues accordingly, then resume forward
review. This is codified in `optimization.md` §B1 — the new
protocol is "playtest auto-runs on every ship" rather than ad-hoc.

## Deep-dive research docs

These live under `docs/research/` — opinionated, sourced references that
feed the Stages above. Read them when you need context on *why* a stage
is designed the way it is, or before committing to a visual / audio /
mechanic choice.

- **`docs/research/next-features.md`** — the ranked prioritisation. Start
  here if you're picking the next feature. Supersedes the Stage order
  where it disagrees (it orders by player-impact, not architectural
  dependency).
- **`docs/research/mini-motorways.md`** — full MM mechanics breakdown +
  what we're pulling in (ranked) and what we're deliberately rejecting.
- **`docs/research/mini-metro-and-others.md`** — lessons from Mini Metro,
  Cities Skylines, SimCity, Tropico. Each with a call on what to steal.
- **`docs/research/fun.md`** — the 10-minute core loop, five specific
  "aha moments" to design around, and the hook that brings players back
  (spoiler: persistence).
- **`docs/research/visual-direction.md`** — flat-vector aesthetic defended,
  palette codified, per-building shape sketches, rendering order.
- **`docs/research/design-pack.md`** — the *execution* spec for the visual
  polish pass. Prescriptive: exact dimensions, colours, strokes, shadows,
  motion timings. Seven implementation passes (silhouette → ground →
  life → atmosphere → decoration → chrome → juice) that together take
  the game from prototype to shipped. Start here when you're ready to
  "make it look like a proper game".
- **`docs/research/sound.md`** — Web Audio-only SFX spec, ambient pad
  recipe, triggers, mute/persistence. CC sources listed for fallback.
- **`docs/research/optimization.md`** — **enjoyment + development**
  optimisation. Nine player-side upgrades ranked by impact (top 5:
  pause button, flow sparkline, sound, soft-goal toasts, day/night
  tint) and eight dev-workflow upgrades (top: playtest auto-runs on
  every ship). Currently the most actionable research doc for the
  next few weeks.

---

## Design pillars — the user-defining choices

These are the non-negotiables derived from the user's vision and should
frame every feature decision.

1. **The player designs the city. The game does not.** Unlike Mini
   Motorways (which spawns houses and destinations randomly and makes the
   player react), *Traffic Flow* lets the player place every building.
   The game's escalation comes from **rising demand and new entries**,
   not from unwanted buildings being dropped in inconvenient places.

2. **Orderly > chaotic.** The player should feel like an urban planner,
   not a firefighter. Fun comes from watching a well-designed city work,
   and iterating on the design. Loss conditions should be generous
   (sandbox-first).

3. **Flow is the reward.** The most satisfying moment in Mini Motorways
   is when a bottleneck clears. We want that feeling constantly —
   smooth cars, subtle motion, visible queues that drain when you fix
   the layout.

4. **Demand is player-controlled.** The manual demand slider is a
   signature feature — it lets the player stress-test a layout, drop
   back to zero to re-design, then ramp back up. Keep it central.

5. **Single neutral car colour.** No colour-matched house→shop puzzles.
   "Drivers are just drivers" — see NOTES.md. Routing variety comes
   from the **mix of building types** (Stage A), not colour pairs.

6. **No game-over popup** (for now). Jam bar fills visibly; sim keeps
   running; player recovers or starts over by choice.

---

## Mini Motorways — mechanics reference (the full menu)

We're cherry-picking from Mini Motorways. Below is the complete mechanics
list so the build session can see what's on the table.

### Core loop (theirs)
- Houses and Destinations spawn in matching colours over time.
- Player draws roads connecting them.
- Each House has 2 cars; each Destination accumulates "pins" (demand).
- Car dispatch = shortest-road-tile path at time of dispatch; no
  rerouting mid-trip (we already do this — see `routeFromNode` in
  `game.js`).
- Cars slow at intersections; slowdown compounds with congestion.
- Destinations that get too many unmet pins trigger a warning timer →
  game over when full.

### Weekly upgrade draft (theirs, Sunday-tick)
- At end of each in-game week, player picks **1 of 2** offered upgrades.
- Upgrades mix new road tiles with infrastructure pieces:
  - **Motorway** — bends freely, ignores other roads, bundled with 10
    road tiles. "Most OP upgrade" per community guides.
  - **Bridge** — cross water, bundled with 20 road tiles.
  - **Tunnel** — pass through mountains.
  - **Roundabout** — ~1 tile footprint, cars don't slow. 20 tiles
    bundled.
  - **Traffic Light** — at intersections; straight-through cars sail,
    left-turners wait. 20 tiles bundled. Community consensus: *worse*
    than roundabouts.
  - **Plain road tiles** — 20 or 40 per card.

### Progression (theirs)
- Weeks 1-2 forgiving; week 9-10+ "ramps into top gear", houses
  spawning multiple-per-week.
- Map gradually expands to reveal new build zones.
- Scoring = total Trips completed.
- Modifiers: "Buy One Get One Free" (double upgrades), "Mini Mysteries"
  (blind picks), "Dense" (smaller start map), etc. — replayability
  layer.

### Strategic lessons we want to preserve (from community guides)
- Segregation reduces congestion: keep traffic streams physically
  separated until the very last joining point.
- Roundabouts > traffic lights. Traffic lights are near-useless in
  practice because of the intersection-speed penalty our sim doesn't
  even model yet.
- Diagonal routes consume equal tiles but travel ~40% longer — so
  orthogonal is better, which is why the aesthetic reads as "grid-city".
- "Longest road" is the right optimisation target, not average road.
- Pins accumulate when supply < demand. A visible, per-destination
  pressure indicator is a great signal.

### What we're **not** doing from Mini Motorways
- ❌ Random house/destination spawns. Player places everything.
- ❌ Colour-matched puzzles. One car colour.
- ❌ Tile budget economy (finite tiles). Roads are free-form polylines
  in our engine; a tile budget would feel artificial in pixel-space.
- ❌ Monthly reset / game-over on unmet pins. Sandbox stays.
- ✅ *But* we borrow: roundabouts (done), bridges (done), traffic
  lights, one-way roads, motorways, weekly upgrade draft, per-destination
  pressure, map expansion (as "new entries unlock").

### Sources
- [Mini Motorways Wiki — Upgrades](https://mini-motorways.fandom.com/wiki/Upgrades)
- [Mini Motorways Wiki — Main](https://mini-motorways.fandom.com/wiki/Mini_Motorways)
- [Wikipedia — Mini Motorways](https://en.wikipedia.org/wiki/Mini_Motorways)
- [Frostilyte — Consistently hitting 2000+ trips](https://frostilyte.ca/2025/04/04/how-to-consistently-hit-2000-or-more-trips-in-mini-motorways/)
- [Steam guide — How to Win at Mini Motorways](https://steamcommunity.com/sharedfiles/filedetails/?id=2647966505)
- [Steam guide — Quick Mini Motorways Strategy Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2553726183)
- [Chuniversiteit — Colour segregation](https://chuniversiteit.nl/well-played/mini-motorways)
- [Scientific Gamer — Design critique](https://scientificgamer.com/thoughts-mini-motorways/)
- [Gamezebo — Strategy guide](https://www.gamezebo.com/walkthroughs/mini-motorways-guide-tips-cheats-and-strategies/)

---

## Adjacent games — worth studying

- **Freeways** (Justin Smith) — intersection drawing as absurd puzzle;
  measures efficiency and concrete used. Great for inspiration on the
  *feel* of traffic flowing through a player-designed intersection.
  Already partially present in v1 (`traffic-fix/`).
- **Junxions** (Steam) — traffic engineering sandbox; more granular,
  roads + rails + pedestrians. Look at how they visualise demand.
- **A/B Street** (open source, Rust) — serious sim with pedestrians,
  cyclists, transit. Too heavy for us, but the idea of "what changes
  when I add this road?" is gold.
- **Cities: Skylines** — the "traffic routes" heatmap is the gold
  standard for showing the player where cars are flowing.
- **Mini Metro** (same studio) — stations spawn over time, lines are
  drawn by the player; same aesthetic language. Look at how they
  visualise pressure (fill-up circles around overcrowded stations).
  We can adopt this for building pressure.

Sources:
- [Freeways — Vice article](https://www.vice.com/en/article/this-game-simulates-the-absurdity-of-designing-freeway-intersections/)
- [A/B Street](https://a-b-street.github.io/docs/software/abstreet.html)
- [Junxions on Steam](https://store.steampowered.com/app/1447250/Junxions/)

---

## Stage A — Typed placeable buildings

**Goal:** Replace the uniform "Block" with distinct building types that
each generate or absorb traffic differently. This is the single highest-
leverage change — it turns the game from "watch pass-through traffic"
into "design a city".

### Building types (v1 set, keep it small)

| Type | Role | Spawns | Accepts | Visual hint |
|------|------|--------|---------|-------------|
| **House** | residential, origin | Yes (low rate) | Yes (end of trip) | Small sloped-roof rectangle, warm cream |
| **Shop** | small destination | No | Yes (medium rate) | Current block look, pastel shopfront |
| **Mall** | high-capacity destination | No | Yes (HIGH rate) | Bigger footprint, 2-grid wide |
| **Office** | weekday destination | No | Yes (medium, day only) | Cool grey, taller |
| **Industrial** | cargo origin + sink | Yes (cargo cars) | Yes | Boxy, muted olive |

For v1, start with just **House + Shop + Mall** — that's enough for
interesting gameplay. Add Office and Industrial in a later pass.

### Dispatch model (replaces the current 65% block / 35% pass-through)

Current: car spawns at an *edge entry* and either visits a random block
or passes through. Proposed:

- Cars still spawn at edge entries (external traffic coming into town).
- **Houses also spawn cars periodically** (internal residents driving
  out).
- Each car has a **destination weight table** picked at spawn:

  | Origin | Weights |
  |--------|---------|
  | Edge entry | Mall 40%, Shop 30%, Office 10%, House 5%, Exit-through 15% |
  | House | Mall 35%, Shop 25%, Office 20%, Exit-through 20% |

- If chosen destination type has zero instances, fall back to
  exit-through (current behaviour).
- Dwell time at destination scales with type: Shop 2s, Mall 4s,
  Office 6s (encourages queueing, makes Malls feel "busier" visually).

### Data model changes (for build session)

Current `state.blocks[]` is `{ id, x, y, nodeId, visits }`. Proposed:

```js
state.buildings = [
  {
    id,
    type: 'house' | 'shop' | 'mall' | 'office' | 'industrial',
    x, y,
    nodeId,           // still single anchor to the road network
    size: 1 | 2,      // grid cells occupied (Mall=2, rest=1)
    visits: 0,
    pressure: 0,      // 0..1 — how full the "waiting to be served" queue is
    waiting: 0,       // number of cars currently en route TO here
    lastDispatch: 0   // for house-as-origin spawn timer
  }
]
```

Keep `state.blocks` as an alias/compat layer if it helps migration; or
just rename through the codebase.

### Toolbar change

`Block` tool becomes a **Buildings** palette that opens a sub-menu:
House / Shop / Mall. The currently-selected building type is what gets
placed on tap.

### UI number to show on HUD

Add **Population** = houses × 2 (analogous to Mini Motorways' 2-cars-per-
house). Shows the player "size" of their city as they build it.

### Acceptance criteria
- [ ] Palette lets player place at least 3 distinct building types.
- [ ] Each type has a visually distinct render (can be rough — Stage E
      polishes).
- [ ] Houses emit cars toward other buildings on a slow periodic timer.
- [ ] Cars pick destination by weighted type, not just "random block".
- [ ] Pressure (waiting queue) is tracked per-building (even if not yet
      visualised).

---

## Stage B — Demand curve & rush hour

**Goal:** Keep the manual slider central, but add a layer on top that
simulates a day/week rhythm. This is where the ESCALATION comes from —
exactly what the user wants in place of Mini Motorways' random spawns.

### Time-of-day cycle

- One "game day" = ~90s of real time (tunable).
- Day phase: 0-30s Morning rush (cars from House → Office/Shop), 30-60s
  Midday calm, 60-80s Evening rush (reverse), 80-90s Night (low).
- Each building type has an hourly demand multiplier:

  | Type | Morning | Midday | Evening | Night |
  |------|---------|--------|---------|-------|
  | House (spawn) | 2.0 | 0.4 | 1.5 | 0.2 |
  | Shop (attract)| 0.6 | 1.5 | 1.2 | 0.3 |
  | Mall (attract)| 0.8 | 1.8 | 1.0 | 0.4 |
  | Office(attract)|2.0 | 1.2 | 0.3 | 0.1 |

- Final spawn rate = `BASE_RATE × state.demandMult × typeMultiplier`.

### Manual override

The demand slider STAYS. It multiplies on top of the day cycle. Pulling
it to 0× pauses spawning entirely regardless of clock.

Add a **pause-time** button that freezes the clock without freezing sim
(so player can study current jams).

### Day indicator in HUD

A small clock face or day bar showing the current phase, so the player
can see "ah, rush hour is coming".

### Acceptance criteria
- [ ] Spawn rate varies sinusoidally with in-game time.
- [ ] Different building types have different demand profiles.
- [ ] HUD shows current time-of-day phase.
- [ ] Demand slider still works as a global multiplier.

---

## Stage C — Traffic control upgrades

**Goal:** Bring Mini Motorways' infrastructure menu into our toolbar
(earned progressively via Stage D, or free-placed in sandbox mode).

### New tools

- **Traffic Light** — placed on a junction node. Adds a cycling
  red/green state per incoming edge. When a car reaches the junction
  on a red-phase edge, it stops at node approach. Cycle ~6s per
  direction. Light affects TWO-WAY crossings, not straight runs.
  Requires: sim-level "stop at node" logic, which doesn't exist yet.

- **Motorway / Highway** — a new edge type that has:
  - Higher `maxSpeed` (e.g. 180 instead of 110 px/s).
  - Is drawn thicker, with a distinctive blue/grey two-tone.
  - Can only connect to other highways or to a single "ramp" node on
    a regular road.
  - Bends freely (same polyline model as current roads).
  - Rename current "Bridge" to just visualise differently; Highway
    is the new upgrade.

- **One-way road** — per-direction edges. Currently every edge is
  auto-mirrored in `makeEdge`. For one-way, skip the reverse. UI:
  hold a modifier key (or tap an existing road to toggle direction).
  This is the single most important real-world traffic tool — any
  city with bad traffic uses one-ways, and it feels great to place.

- **Wide road** — edge with lane capacity > 1. Needs sim changes to
  support parallel cars; big lift. Defer until Stage D unless build
  session wants to tackle early.

### Bridges — keep but rename

Currently "Bridge" = crossing permission. When Stage F adds terrain
(rivers), Bridge becomes what it says on the tin. Until then, it's
just "allow this road to cross another" which is fine.

### Acceptance criteria
- [ ] Traffic light tool places a signal on a junction and cars actually
      stop at red.
- [ ] Highway tool exists with visibly faster, distinctly-drawn roads.
- [ ] One-way road toggle exists and cars respect direction.

---

## Stage D — Weekly progression & scoring

**Goal:** Add Mini Motorways' signature Sunday-upgrade drama without
losing player-designed city control.

### The week

- One in-game week = ~3 minutes real time (or ~2 game-days at Stage B
  pacing).
- At end of week: sim pauses briefly, a **Week Summary card** appears:
  ```
  Week 3 complete
  87 cars delivered this week (+22)
  Avg wait time: 4.1s (-0.3s)
  Choose an upgrade:
  [ Roundabout ×2 ] [ Highway ramp ×1 ]
  ```
- Player picks one, pop-up closes, sim resumes.

### Upgrades earned vs free-placed

**Decision to make:** do we run two modes — Sandbox (all tools free)
and Challenge (tools must be earned from weekly picks)? Or do we
always-earn but with generous timing?

Recommended: **Challenge is the default. Sandbox is a toggle on the
splash screen.** The drama of weekly picks is what gives the game
stakes without the Mini Motorways forced-spawn randomness.

### New-entry unlocks

Every 2-3 weeks, a new **edge entry** slides in from a side of the map
(e.g. NE corner). Visual: gate fades in from off-screen. This is how
demand scales — not more houses dropped, but another external road
opening up. Player decides whether to connect it to existing network
or build a new arm.

### Score

Keep the current `delivered` count. Add:
- **Flow** = cars/min delivered (already in HUD).
- **Peak flow** = best minute in the session.
- **Longest road** (Mini Motorways metric) — the longest path length
  any currently-active car has. Show in HUD. Player optimises to
  minimise this.

### Acceptance criteria
- [ ] Week counter runs and triggers an end-of-week summary card.
- [ ] Upgrade picks add tools/capacity to the player's toolkit.
- [ ] New entries unlock every few weeks.
- [ ] New HUD metric: Longest Road.

---

## Stage E — Visual polish (the "looks like a game" pass)

**Goal:** Make cars look like cars and buildings look like little houses,
using only Canvas 2D (no sprites, no engine change). The current
aesthetic — warm cream bg, dark slate roads, rounded blocks — is
already good; we're adding fidelity, not changing it.

### Cars

Today: cars are coloured circles of radius 11. Upgrade to:

- **Oriented rectangle body** ~22×12, painted with car colour.
- **Windshield rectangle** at the front, 40% of length, lighter shade
  (tinted version of body colour).
- **Four wheel dots** at corners, dark slate.
- **Headlight dots** at night (Stage B enables day/night).
- Rotation taken from the edge tangent (already computed via
  `sampleEdge`'s `hx, hy`).

Reference technique: standard Canvas `save() / translate() / rotate() /
rect() / restore()` pattern — see Making a Simple HTML5 Racing Game and
the drawRotatedImage pattern.

### Buildings

Today: rounded rectangle + 3 window dots. Upgrade per-type:

- **House** — pentagonal roof overlay (dark slate), square body in warm
  cream, 2×2 window grid, small chimney.
- **Shop** — current look but wider, with awning (a thin rectangle of
  accent colour across the front).
- **Mall** — 2-grid-wide, flat-topped, larger glass rectangle front,
  "M" or "+" glyph in light.
- **Office** — taller, thin; 4×6 window grid; cool grey palette
  (`#b0b8c4` family).

Keep the **drop shadow ellipse** — it's what gives the whole scene its
warm, pleasing feel.

### Roads

Add **lane markings at junctions** — small white triangle arrows on the
ground indicating direction, only drawn at nodes with >2 connections.

### Ambient decoration

Tiny **grass tufts** scattered on grid points far from any road — adds
life without clutter. Fade out when that grid point gets built over.

### Delivery moment

Currently silent. Add a **small burst effect** at building centre on
`block.visits++` — a tiny expanding ring + a `+1` floating number that
rises and fades. Same for edge exits.

### Day/night tinting

Overlay a multiply-blend layer whose alpha/colour follows the day
cycle (tight with Stage B):
- Morning: cool blue tint, alpha 0.15
- Midday: none
- Evening: warm orange tint, alpha 0.2
- Night: deep blue tint, alpha 0.35 + star dots on grid

### Acceptance criteria
- [ ] Cars are recognisably cars (body, windshield, wheels).
- [ ] Building types have distinct procedural renders.
- [ ] Delivery effect plays on trip completion.
- [ ] Day/night cycle tints the scene (if Stage B done).

### Sprite reference (for later, if we ever go pixel-art)
- [Free Simple Car Pixel Art Sprite — itch.io](https://patricio449.itch.io/free-simple-car-pixel-art-sprite)
- [Making Sprite-based Games with Canvas](https://archive.jlongster.com/Making-Sprite-based-Games-with-Canvas)
- [Canvas sprite animations tutorial — Spicy Yoghurt](https://spicyyoghurt.com/tutorials/html5-javascript-game-development/images-and-sprite-animations)

Procedural (current path) is better for now — smaller files, no asset
pipeline, looks consistent across zoom. Only move to sprites if a full
art direction demands it.

---

## Stage F — Terrain & pre-built layouts

**Goal:** The map today is a blank canvas with four edge gates. Give it
features that constrain and motivate layout decisions — without
bringing back the "random forced spawn" anti-pattern.

### Terrain features

- **River** — a polygon that roads can only cross via Bridge.
- **Park** — a polygon roads cannot cross at all (player must route
  around).
- **Elevation / hill** — roads can cross but at reduced speed; Tunnel
  upgrade bypasses. (Skip for v1; add in Stage D as optional upgrade.)
- **Coast / map edge** — dead border on one or more sides (no entry
  from that side).

### Preset layouts

Instead of one generic starter, offer **Scenarios** from splash:
- "Plains" — flat, 4 entries (today).
- "Coastal" — no E entry (sea), N-S entries, river inland.
- "Two Districts" — river splits map, only 1 starter bridge.
- "Ring" — all 4 entries feed into a central no-build park.

Each scenario is just a JSON: entries, starter roads, terrain polygons.
Scenarios file lives at `data/scenarios.json` alongside the existing
`fuengirola.json`.

### Acceptance criteria
- [ ] Splash has scenario picker (or a second screen after Start).
- [ ] At least 2 scenarios ship with Stage F.
- [ ] Roads cannot cross Park polygons; drag previews go red.
- [ ] Roads can cross River polygons only if Bridge tool is active.

---

## Stage G — Audio

Small but transformative. Keep it under 30 lines of code using Web Audio
API (no libraries).

- **Ambient loop** — soft lo-fi town bed, looped. One short clip.
- **Car pass** — occasional whoosh sfx when a car passes the camera
  centre area, low volume. Throttled.
- **Delivery ding** — small bright tone on `visits++` / delivered++.
  Pitch varies per building type.
- **Jam warning horn** — triggered when `jamMeter` crosses 0.7.
- **Build click** — on road drag complete.
- **Mute button** — in HUD, obviously.

All sfx synthesized with oscillators if possible (no audio files), to
keep the single-file static-deploy ethos.

---

## Stage H — Real-world mode (long-horizon, not next)

Per `NOTES.md`, the ultimate vision merges this project's stylised
gameplay with the v1 (`traffic-fix/`) project's OSM data layer.

When we get here:
- Scenario "Real: Fuengirola" loads the baked
  `data/fuengirola.json` as the initial road graph.
- Simplify rendering: OSM roads draw in the pixel-game style (thick
  dark slate strokes), not as satellite-overlay.
- Four edge entries become the real approaches to the mapped area.
- Buildings start pre-placed based on OSM tags (`building=*`), typed by
  OSM classification (`landuse=retail` → Shop etc.).
- Player edits the network same as sandbox mode — the Stage C tools
  (roundabouts, lights, one-ways) give them real urban-planning
  levers.

This is a Stage H *because* it becomes compelling only after A-F are
solid. Premature sequencing would turn the game back into the
engineering-tool v1.

---

## Cross-cutting notes

### Performance

We already have `byEdge` bucketing in `stepSim`. With typed buildings,
the number of cars in-flight will climb. Watch for:
- Dijkstra on every spawn → expensive once graph grows. Consider
  caching per-node routing tables, invalidated on road changes.
- `drawGrid` draws every visible dot each frame — already skips
  off-screen. Fine.
- `drawRoads` strokes each edge 3× (shadow + body + dashed stripe).
  With many roads this gets heavy. Could pre-render to an offscreen
  canvas that invalidates only on road-add/erase.

### Accessibility

- Colour-blind: we only use one car colour, so OK. Buildings should be
  distinguishable by **shape**, not just colour (important for Stage E).
- Touch targets: toolbar buttons should stay ≥44×44 px on phones.

### Mobile UX (already handled)

- Two-finger pan/zoom works.
- One-finger drag builds roads.
- Day/night tint must not interfere with touch feedback — keep
  interactive overlays above the tint layer.

---

## Non-goals (things we'll actively avoid)

1. **Random building spawns.** The whole point is player-designed city.
2. **Colour-matched puzzle.** Drivers are just drivers.
3. **Finite road-tile budget.** Roads are free in our engine; keep it.
4. **Procedurally generated maps.** Scenarios are hand-authored.
5. **Full 3D / isometric pivot.** Canvas 2D top-down is the vibe.
6. **External asset pipeline.** Everything procedural until forced
   otherwise.
7. **In-game currency / economy.** Score only. No coins.

---

## Next recommended action for the build session

**Start with Stage A.1: split the single `block` placement into typed
buildings (House + Shop + Mall).** Everything else compounds on this —
demand curves (B) depend on typed buildings, weekly upgrades (D) are
meaningful only when building types matter, visuals (E) are per-type.

If the build session wants a quick warm-up first: **add the Population
HUD stat** from Stage A (simple, visible, shows up as soon as Houses
exist). One-afternoon task.
