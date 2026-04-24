# Next features — prioritised roadmap

Ordered by expected impact on the 10-minute loop (see `fun.md`).
Each feature has: what it is, why it matters, rough complexity, and a
call on *when* in the sequence to ship.

The ranking is opinionated. Build session should feel free to
reorder with reason — drop a note in COORDINATION.md if you do.

---

## #1 — Persistence (localStorage save/load)

**What:** The current city (road graph + blocks + demand setting) is
saved to `localStorage` on every meaningful edit (debounced 1s). On
page load, if a saved city exists, restore it instead of the default
starter. Include a "Start fresh" option on the splash.

**Why it matters:** This is the single feature that turns the game
from a toy into a *project*. The player's city survives. Tomorrow
they come back and keep building. Without this, every session starts
from scratch and the investment the player made evaporates. See
`fun.md` "The hook". Almost certainly the highest-value feature
on this list even though it's unglamorous.

**Complexity:** Low. Serialize `state.nodes / edges / blocks / 
entries / jamMeter / delivered / visits / demandMult` to JSON, store,
reload. Version the schema (`v: 1`) so future changes don't break old
saves — write a migration stub that silently wipes v≠1 and starts
fresh.

**Ship next.**

---

## #2 — Pressure indicators on buildings

**What:** A subtle fill-ring around each block that fills as cars
queue up "heading to" or "parking at" this block. Full ring = pulse
red but still accept cars. Empties as the queue drains.

**Why it matters:** Right now the player has no granular signal about
*where* traffic is struggling. The top-bar Jam meter says "something
is wrong" but not where. The pressure ring answers "there — look at
that mall". This is the #1 lesson from Mini Metro and Mini Motorways
both. Triggers Aha #1 and #3 in `fun.md`.

**Complexity:** Low. Already tracking `block.visits`. Add
`block.waiting` (cars en route to it) and `block.recentVisits` (moving
average of last 10s). Ring fill = `waiting / capacity`. Render as
an arc behind the block rect.

**Ship after #1.**

---

## #3 — Building type variety (House + Shop + Mall)

**What:** Replace the uniform "Block" with three distinct types:
- **House** — origin. Spawns cars at a low periodic rate that drive
  to a random destination block.
- **Shop** — small sink. Short dwell time (2s). Visits already work.
- **Mall** — large sink. Grid-snap 2×2 footprint. Longer dwell (4s).
  Worth 2x score.

Add a palette submenu under the Block tool. Current blocks become
Shops (migration: any existing block on load = Shop).

**Why it matters:** Changes the gameplay from "pass-through traffic"
to "designed urban flow". Without types, the player's city is
homogeneous — every block is the same. With types, they decide *which
block types cluster where*, which generates emergent traffic
patterns. This is the single biggest gameplay depth multiplier on
this list. Also sets the stage for #5 (demand curve) and #8
(building upgrades).

**Complexity:** Medium. Data model change (`block.type`), dispatch
weighting change (weighted pick by type), Mall footprint (handle
2×2 occupancy — check collisions on placement), visual differentiation
(different shape/colour per type). Rename `blocks` → `buildings`
throughout for sanity.

**Ship after #2.**

---

## #4 — One-way road tool

**What:** A new tool (or modifier on the Road tool) that creates a
single-direction edge instead of the default two-way pair. Existing
roads can be toggled to one-way by tapping with the tool.

Visually: arrows on the road surface showing direction. Routing
already respects edge direction, so sim-wise this is free.

**Why it matters:** The single biggest "oh wow" moment from real-world
traffic engineering and Cities Skylines lessons both. Trigger Aha
#4. Lets the player solve complex junctions by segregating flows.
Particularly powerful for the perimeter of a district.

**Complexity:** Low-to-medium. `makeEdge` currently auto-mirrors —
add an `oneWay: true` option that skips the reverse. Toggle-existing
means finding and deleting the reverse edge of an edge — tricky only
because of in-flight cars on the reverse (same migration code as
`splitEdgeAtPoint`). Rendering: add arrow decorations along the edge
polyline.

**Ship after #3.**

---

## #5 — Weekly upgrade draft (end-of-week card)

**What:** In-game week clock (~3 real minutes per week). At week's
end, sim pauses, a card shows this week's stats (delivered, peak flow,
longest road) and offers 2 upgrade picks. Player picks one, sim
resumes.

Initial upgrade pool:
- "Traffic light tool unlocked" (needs #6 to ship first)
- "Highway tool unlocked"
- "One-way tool unlocked" (if #4 not already available)
- "New N-E edge entry will open in 30s"
- "Unlock Office building type"
- "+1 roundabout placement"
- "+2 bridges"

**Why it matters:** Adds a rhythm, a reward cadence, a reason to care
about *this* session beyond idle tweaking. Gives us escalation
without random spawns — new entries/tools arriving on-schedule is
our replacement for MM's random houses. See `mini-motorways.md`.

**Complexity:** Medium. Week-clock state, pause flow, modal card UI
(style.css already has `.splash-card`), upgrade pool enum + "is
unlocked" flag per tool, unlock-toast on each pick.

**Ship after #4** — ideally with at least two of #6, #7 already
available so the upgrade pool has substance.

---

## #6 — Traffic lights at junctions

**What:** A new Traffic Light tool. Tapping a junction node with it
adds a signal state. Cars approaching on a red-phase edge stop at
the node. Cycle: ~6s green per axis, no turn arrows (we only model
straight-through for now).

**Why it matters:** Real infrastructure choice to make, paired with
#9 (intersection speed penalty). Without intersection slowdowns, a
light has no purpose — it's just a worse roundabout. With slowdowns,
lights let straight-through traffic sail at full speed while turners
queue.

**Complexity:** Medium. Node needs `signal` state + cycle timer.
Sim loop needs an "about to cross node X, is signal red for my
incoming edge?" check. Render needs a small tri-colour puck on the
node.

**Ship after #5** — it's an unlockable upgrade pick, so it needs
the draft system in place.

---

## #7 — Visual upgrade pass: cars look like cars, buildings look like buildings

**What:** Replace the circle-car with a procedurally-drawn rectangular
car body (with windshield, wheels, subtle colour variance). Replace
generic block with type-specific drawings: house (sloped roof, chimney,
windows), shop (awning), mall (big flat footprint, glass entrance),
office (tall, window grid).

No sprite assets — all canvas draw calls to stay single-file deploy.

**Why it matters:** Triggers Aha #5 ("I built a nice-looking city").
This is the moment the game stops looking like an engineering demo
and starts looking like a cozy game. Big perceived-quality jump.
The aesthetic is the product.

**Complexity:** Medium. Cars use existing edge tangent (`hx, hy`
from `sampleEdge`) for rotation. Buildings need per-type draw
functions in `drawBlocks`. See `visual-direction.md` for exact spec
and palette.

**Ship after #3** — needs the type variety to have anything to
draw differently. Could slot in alongside #4 / #5 / #6.

---

## #8 — Building upgrade levels

**What:** Each building has a level (1 → 2 → 3). After N deliveries,
the player is offered a "Upgrade this Shop to a Mall?" prompt via a
small icon that appears on the building. Upgrading:
- Doubles the visit frequency.
- Grows the footprint (Shop 1→1 grid, Mall 2→2×2 grid, etc.).
- Increases delivery score multiplier.

**Why it matters:** Gives the player a *scoring lever* they control —
reward for serving a building well is the option to make it more
demanding (more traffic, more points). Without this, there's no
reason to care whether a specific mall delivers 100 or 1000 cars. See
`mini-motorways.md` adaptation #3.

**Complexity:** Low-medium. Add `level` to building. Upgrade UI is
a hover/tap button. Recomputing visit frequency and footprint is
straightforward. Handle grid collisions on upgrade if footprint
grows.

**Ship after #5** — it's a natural upgrade pool entry.

---

## #9 — Intersection speed penalty + roundabout benefit

**What:** Cars slow on approach to any unsignalised junction (0.7×
speed for 40 world units before + after the node). Roundabouts
reduce the penalty to 0.9×. Traffic lights: full speed straight-
through, 0.5× + stop-at-red for queued.

Plus a "compound" factor: penalty drops further with each additional
car in the approach zone (down to 0.3× floor).

**Why it matters:** The mechanic that makes Mini Motorways' decisions
*mean* something. Without this, our roundabout/light tools are
aesthetic only. With it, every layout decision has a measurable flow
consequence. Triggers Aha #3.

**Complexity:** Medium-high. Precompute per-node "approach zones"
(which 40u of each incoming edge). Each sim step: for each car in
an approach zone, apply the slowdown. Care needed for when the zone
crosses a small edge (<40u) into the previous edge — two options:
(a) clamp to edge start, accept slight under-penalty, simple;
(b) walk back through edges, more correct but more code. Recommend (a).

**Ship after #6** — lights/roundabouts need to be placeable first so
the penalty has a counterweight.

---

## #10 — Day/night tint + gentle time-of-day cycle

**What:** In-game time of day ticks on a ~90s cycle. The canvas
background and roads overlay a subtle multiply-blend tint that follows:
cool-blue morning → neutral midday → warm-orange evening → deep-blue
night with tiny "star" glints on grid points.

No demand changes yet (just visual). Day/demand coupling comes later.

**Why it matters:** Massively lifts the "cozy game" feel without
touching gameplay. Ships on its own — pure additive polish. Works
even better with car headlights at night (triggers Aha #5 nicely).
Sets the groundwork for a later rush-hour demand mechanic.

**Complexity:** Low. One extra canvas fill pass per frame with an
alpha-varying colour. Headlights are two small yellow ellipses in
front of each car when `timeOfDay === 'night'`.

**Ship alongside #7** — they reinforce each other.

---

## #11 — Scenarios (hand-authored alternative starts)

**What:** A splash-screen picker offering 3 starting scenarios besides
"Sandbox":
- **Plains** — the current default.
- **Coastal** — no E entry, a river runs N-S splitting the map,
  single bridge to start.
- **Two Districts** — two road clusters to start, no connection
  between them.

Stored as JSON in `data/scenarios.json`. Terrain (river, park) is
just a polygon — drag previews turn red crossing it (except Bridge
over rivers).

**Why it matters:** A second reason to open the app — "let me try the
coastal map". Without needing procedural generation, just authorship.
Also gives us the eventual real-OSM merge direction a hook:
"Real: Fuengirola" becomes one more scenario entry.

**Complexity:** Medium. Scenario schema, loader, terrain polygon
rendering, river/park drag-validation rules. The tricky bit is
terrain — keep it to *one* river + *one* park per scenario to stay
simple.

**Ship after #1–#7** — polish-tier feature that assumes everything
else works.

---

## #12 — Sound pass (ambient + key SFX)

**What:** Minimal Web Audio setup:
- Ambient low-volume loop, 8-bar synth pad.
- Delivery chime (short pleasant tone, pitch varies by building type).
- Road-complete click.
- Jam warning low tone when `jamMeter > 0.7`.
- Mute button in HUD.

**Why it matters:** Sound is the single biggest "this is a real game"
signal. The game feels noticeably more alive the moment a chime
plays on delivery. See `sound.md`.

**Complexity:** Low-medium. No audio files — synthesise with
oscillators to keep static-site deploy. `sound.md` has a concrete
sketch.

**Ship after #7** — polish pass, or alongside it.

---

## Later-tier (post-12)

These are below the 8–12 cut but worth flagging so we don't forget:

- **Performance pass** — edge-render caching on offscreen canvas;
  Dijkstra path-cache invalidated on road edits. Only do this when a
  player's cities start stuttering.
- **Two-lane roads / highway** — bigger infrastructure piece, needs
  parallel-car sim.
- **Tutorial overlays** — one coach-mark on first drag. Nothing more.
- **Shareable city URL** (state encoded in query string).
- **Leaderboard / daily challenge** (Option B in `fun.md` — only if
  persistence isn't enough of a hook).
- **Real-OSM scenario import** — merges this project with shelved v1
  (`traffic-fix/`). Requires scenarios infrastructure (#11) first.

## Sequencing summary

Roughly:

```
#1  Persistence            ──▶ hook secured
#2  Pressure indicators    ──▶ diagnosis upgrade
#3  Building types         ──▶ gameplay depth x2
#4  One-way roads          ──▶ first "wow" moment
#5  Weekly draft           ──▶ rhythm + progression
#6  Traffic lights         ──▶ unlockable infra
#7  Visual polish          ──▶ product feel
#9  Intersection penalty   ──▶ makes #6, roundabouts real
#8  Building upgrades      ──▶ late-game depth
#10 Day/night tint         ──▶ cozy atmosphere
#11 Scenarios              ──▶ replayability
#12 Sound                  ──▶ alive feel
```

If the build session can only ship **one** of these next: **#1**.
If they can ship **three**: #1, #2, #3.
If they can ship **five**: add #4, #7.

Nothing on this list requires a backend. Everything is
single-file-deploy-compatible.
