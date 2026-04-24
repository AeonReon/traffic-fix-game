# Known issues

Rolling bug list maintained by the playtest session. See
`README.md` for the entry format.

**Sorting:** open P0/P1 at top, then P2, then P3, then P4. Fixed
issues move to the bottom under "Resolved" and can be culled every
few weeks.

## Open

### [P1] Persistence is write-only — saved city is never restored
**Status:** open
**Found:** 2026-04-24, static review at v13 commit `3777dda`
**Repro:**
1. Start the game, place a House and a Mall, drag a couple of
   custom roads.
2. Refresh the page (or close the tab and reopen).
3. Observe the map resets to the starter W↔E road with no
   buildings.
**Expected:** The city you just built is restored (RESEARCH.md
next-features #1 "localStorage persistence").
**Actual:** Everything is lost. The saved blob *is* written to
`localStorage['traffic-flow:v1']` on every change, but nothing
reads it back.
**Hypothesis:** `loadState`, `hasSavedCity` and `clearSavedCity`
are all defined in `game.js` (lines ~260–305) but `grep` shows
they are never called. The boot IIFE at the bottom calls
`buildLevel()` unconditionally. Need to wire boot to
`if (hasSavedCity()) loadState(...)` with a "Resume city /
Start fresh" choice on the splash.
**Impact:** Blocks the #1 research priority. Any session longer
than a refresh is lost.

### [P1] Queue drain order is LIFO, not FIFO
**Status:** open
**Found:** 2026-04-24, v13 `3777dda`
**Repro:** Hard to see visually — the queue dots render in order,
but internally:
1. Set demand to 3× so a queue builds at the N gate.
2. Drop demand to 0×.
3. Raise demand to 1× once the first car dispatches.
**Expected:** Cars dispatch in the order they arrived (oldest
first — FIFO).
**Actual:** `tryDispatchFromQueue` dispatches and then calls
`entry.queue.pop()` (`game.js:802`), which removes the *newest*
entry. The oldest car's `waitingSince` is never consumed.
**Hypothesis:** Should be `entry.queue.shift()`. Currently the
queue acts like a stack: the first car parked at the gate sits
there forever while later arrivals dispatch ahead of it.
`waitingSince` is tracked but never displayed, so this is
functionally invisible until someone adds a "longest wait"
metric — but it's still wrong and will surface as a bug the
moment that metric ships.
**Impact:** Correctness bug in the core dispatch. Not visually
obvious yet, but guaranteed to bite any feature that displays
wait time.

### [P2] Undoing a building leaves an orphan split-node on the road
**Status:** open
**Found:** 2026-04-24, v13 `3777dda`
**Repro:**
1. Drop a Shop tool onto the middle of the starter W↔E road.
   `placeBlock` snaps to the edge and calls `splitEdgeAtPoint`,
   creating a new node M on the road and two tail-halves of the
   split edge.
2. Press Undo.
**Expected:** The road is restored to its original single edge;
node M is gone.
**Actual:** `undoLast` removes only `state.blocks[]` entry, not
the split node M or the tail edges (`game.js:557-561`). The road
stays split. Cars continue to traverse it fine, but the
junction node M is now an orphan T-junction with no building.
**Hypothesis:** The `block` undo record needs to remember whether
`placeBlock` created a new node via `splitEdgeAtPoint` and, if
so, re-merge the edges and drop M.
**Impact:** Visible as a floating snap-point on the road; also
means "undo" is not a true inverse of "place". Compounds if the
player places → undos several times in the same spot.

### [P2] Undoing a road leaves orphan endpoint nodes
**Status:** open
**Found:** 2026-04-24, v13 `3777dda`
**Repro:**
1. With Road tool, drag from the starter road into empty space
   (creates a free-end dead-end node N).
2. Press Undo.
**Expected:** Road and its dead-end node N both disappear.
**Actual:** Road edges are filtered out of `state.edges`, but N
remains in `state.nodes`. N is invisible (no marker) but still a
snap target: a later Road drag can snap-start on it.
**Hypothesis:** `undoLast.type === 'road'` (`game.js:549-555`)
filters edges only. Roads created via `addRoad` can create 0, 1
or 2 new nodes (start-edge split, end-free-node, or end-edge
split). The undo record needs `nodeIds: [...]` so they can be
culled, with guards against removing nodes that other edges or
blocks still reference.
**Impact:** Accumulates phantom snap-points in areas where the
player has been experimenting. Makes the "clean blank slate"
impression of Undo false.

### [P2] Pressure ring saturates at capacity — can't tell "busy" from "broken"
**Status:** open
**Found:** 2026-04-24, v13 `3777dda`
**Repro:**
1. Place a single Shop far from the gates so many cars have to
   path to it.
2. Crank demand to 3× and wait 60s.
**Expected:** As more and more cars pile up heading for the Shop,
the ring keeps giving a stronger signal — e.g. pulsing, or a
second concentric ring, or exceeding the full circle somehow.
**Actual:** `pressure = Math.min(1, incoming / capacity)`
(`game.js:1102`) caps at 1.0. Once `incoming === capacity` the
arc is a full 2π circle and the colour is fully red. Any further
congestion looks identical — a shop with 3 incoming and a shop
with 30 incoming render the same ring.
**Hypothesis:** Either (a) let `pressure` exceed 1.0 and drive a
pulsing/blinking secondary effect, or (b) render a second thin
inner ring whose fill = `(incoming - capacity) / capacity`.
Either way the "THIS is the bottleneck" signal — the entire
point of the feature — needs a way to differentiate severity
past 100%.
**Impact:** Feature that shipped as the per-building "bottleneck
here" signal loses its strongest case (the *worst* bottleneck
looks identical to a mild one).

### [P2] Weighted dispatch fallback is uniform, not weighted
**Status:** open
**Found:** 2026-04-24, v13 `3777dda`
**Repro:**
1. Place a House and a Shop, **no** Mall.
2. Watch which buildings get visited over a minute at demand 3×.
**Expected:** With Mall 40 / Shop 30 / House 5 / Exit 25 weights,
rolls that land on Mall should fall back *weighted* — i.e. the
40% Mall share should distribute roughly Shop:House:Exit = 30:5:25
among the remaining categories.
**Actual:** `tryDispatchFromQueue` (`game.js:743-777`) shuffles
the non-rolled categories uniformly and picks the first routable
one. So a Mall roll becomes a *uniform* roll over {Shop, House,
Exit} when no Mall exists.
**Hypothesis:** Either re-roll using the remaining-category
weights (clean fix) or iterate in a weight-sorted order. Minor
impact while Malls are common, but when the player hasn't
unlocked/built a Mall yet, Houses get 1/3 of the traffic instead
of 5/60.
**Impact:** The stated building-weight balance (the whole point
of typed buildings) subtly breaks whenever any category is
empty. Houses in particular get over-visited in early-game
layouts.

### [P2] loadState skips `state.started`, so post-load writes won't persist
**Status:** open
**Found:** 2026-04-24, v13 `3777dda` (only relevant once Issue #1
above is fixed — but worth fixing at the same time to avoid a
second round of debugging)
**Repro:** once persistence is wired,
1. Save city, refresh, resume.
2. Place a new building.
3. Refresh again.
**Expected:** The new building is still there.
**Actual:** `loadState` (`game.js:260-284`) doesn't set
`state.started = true`. `scheduleSave` early-returns when
`!state.started` (`game.js:288`). So every placement after a
resume silently fails to persist.
**Hypothesis:** Add `state.started = true; state.paused = false;`
at the end of `loadState`, or have the "Resume" splash button
set `state.started` before/after calling `loadState`.
**Impact:** Resume looks like it works, but then the player
rebuilds more of the city thinking it's saved, and the second
refresh wipes only the new work. Worst kind of persistence bug.

### [P3] loadState persists dead schema fields (`junction`, `degree`)
**Status:** open
**Found:** 2026-04-24, v13 `3777dda`
**Repro:** Inspect `serializeState()` (`game.js:229-258`).
**Expected:** Saved node shape matches the live node shape.
**Actual:** Saved nodes include `junction: !!n.junction` and
`degree: n.degree || 0` but `makeNode` never sets those fields.
Always `false` / `0` in the save, and on load they're restored
but unused.
**Hypothesis:** Leftovers from an earlier node design. Remove
from `serializeState` and `loadState`, or wire them up if the
roundabout/t-junction code actually needs them (it currently
doesn't — it rewrites topology by creating fresh nodes).
**Impact:** Save blob is slightly larger than it needs to be.
Minor — but if a future feature decides to use `junction`, saved
cities will have stale `false` values that *look* correct.

### [P3] `startGame` warmup skews first flow-rate reading
**Status:** open
**Found:** 2026-04-24, v13 `3777dda`
**Repro:**
1. Hard-refresh, tap Start, don't touch anything.
2. Watch the `rate/min` HUD value for the first 10 seconds.
**Expected:** Starts at 0, climbs as cars complete journeys.
**Actual:** `startGame` seeds 4 cars per entry and runs
`for (let i = 0; i < 80; i++) stepSim(0.05)` (`game.js:1651`) —
instantly advances `state.time` by 4 seconds and potentially
delivers several cars. First `delivered / state.time * 60`
reading is reasonable, but the 4-second jump in `state.time`
means the 60s flow-rate average is off until ~2 min of real
play. Not a major bug, just a metric blemish.
**Hypothesis:** Either don't count warmup toward `state.time`,
or reset `state.time = 0` and `state.delivered = 0` after warmup
in `startGame`.
**Impact:** Purely a HUD metric accuracy issue.

### [P3] Seeded queue entries have `waitingSince: 0`
**Status:** open
**Found:** 2026-04-24, v13 `3777dda`
**Repro:** Read `startGame` (`game.js:1647-1650`). 16 seed cars
get `waitingSince: 0`.
**Expected:** Seed with `waitingSince: state.time`.
**Actual:** If the "longest wait" metric ever ships, it will
always read 4 seconds too high right after Start.
**Hypothesis:** Cosmetic — fix when Issue "queue LIFO" is being
fixed.
**Impact:** Invisible until a wait-time HUD lands.

### [P3] Dead `endGame()` / `#gameover` UI still wired
**Status:** open
**Found:** 2026-04-24, v13 `3777dda`
**Repro:** Inspect `game.js:1670-1676` and `index.html`.
**Expected:** With the v5 removal of the game-over state, the
splash and the `#gameover` / `#btn-retry` / `endGame()` nodes
should be gone.
**Actual:** `endGame()` is defined but never called — dead
code. The `#btn-retry` button is wired to `restart()`, not
`endGame()`. Harmless, but a dangling Retry button can surface
if the markup changes or a future feature re-enables the popup.
**Hypothesis:** Remove `endGame()`, confirm `index.html` no
longer has `#gameover`. This is cleanup, not a bug — P4 if the
user pushes back on triage.
**Impact:** None until someone re-introduces a fail state and
gets surprised by a pre-wired popup.

### [P3] Erasing a road leaves its endpoint nodes behind
**Status:** open
**Found:** 2026-04-24, v13 `3777dda`
**Repro:**
1. Drag a Road from the starter into empty space (creates dead-
   end node N).
2. Switch to Erase, tap the road.
**Expected:** Node N is gone.
**Actual:** `eraseEdgeById` (`game.js:664-678`) filters edges
and cars but not nodes. N becomes an orphan the same way undo's
orphan-node issue produces one.
**Hypothesis:** Same fix family as the undo issue — tracking
which nodes are safe to remove (no remaining incident edges, no
building nodeId, not an entry).
**Impact:** Phantom snap-points build up. Low severity —
invisible, but affects snap behaviour.

### [P4] Pressure ring ignores cars currently *at* the building
**Status:** open
**Found:** 2026-04-24, v13 `3777dda`
**Repro:** Place a Mall, crank demand. Cars will park there for
4 seconds each.
**Expected:** The ring reflects total load — cars en route +
cars currently parked — so a slow-to-drain Mall shows high
pressure even when few new cars are inbound.
**Actual:** `b.incoming` only counts cars whose `destKind ===
'block'` and `!hasVisited` (`game.js:938-943`). Once parked,
`hasVisited = true` so they stop counting. Ring drains the
moment a car arrives, even though the car blocks the bay for
the next ~4s.
**Hypothesis:** Include `hasVisited && car.pauseUntil > state.time`
cars. Or introduce a separate "docked" count and add both.
**Impact:** Visual feedback understates how busy a Mall is —
counter to the point of pressure rings.

### [P4] Two Malls placed close together visually overlap
**Status:** open
**Found:** 2026-04-24, v13 `3777dda`
**Repro:** Tap Mall tool, place two Malls on adjacent grid cells
60px apart along the starter road.
**Expected:** Placement is rejected or the second one snaps to a
different node far enough away.
**Actual:** `placeBlock` only rejects on identical `nodeId`
collision. Mall visuals are 64×42px and the shadow is 1.5× size,
so two Malls on different nodes 60px apart overlap substantially.
**Hypothesis:** Either enforce a minimum spacing between
buildings in world coords, or render Malls at scale proportional
to actual node spacing.
**Impact:** Aesthetic. Rare in practice because entries are far
apart, but the flat-vector look breaks.

## Resolved

_(empty)_
