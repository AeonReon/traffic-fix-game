# Known issues

Rolling bug list maintained by the playtest session. See
`README.md` for the entry format.

**Sorting:** open P0/P1 at top, then P2, then P3, then P4. Fixed
issues move to the bottom under "Resolved" and can be culled every
few weeks.

## Open

### [P1] Queue drain order is LIFO, not FIFO
**Status:** open (still present at v20 — unchanged since v13)
**Found:** 2026-04-24, v13 `3777dda`; reconfirmed v20 `abc9670`
**Repro:** Internal-only until a wait-time HUD ships:
1. Set demand to 3× so a queue builds at the N gate.
2. Drop demand to 0×.
3. Raise demand to 1× once the first car dispatches.
**Expected:** Cars dispatch in the order they arrived (oldest
first — FIFO).
**Actual:** `tryDispatchFromQueue` dispatches and then calls
`entry.queue.pop()` (`game.js:891` at v20), which removes the
*newest* entry. The oldest car's `waitingSince` is never consumed.
**Hypothesis:** Should be `entry.queue.shift()`. Currently the
queue acts like a stack.
**Impact:** Correctness bug in the core dispatch. Invisible today
because wait-time isn't displayed; guaranteed to bite any feature
that does.

### [P2] Undoing a building leaves an orphan split-node on the road
**Status:** open (unchanged at v20)
**Found:** 2026-04-24, v13 `3777dda`
**Repro:**
1. Drop a Shop onto the middle of the starter W↔E road.
   `placeBlock` calls `splitEdgeAtPoint`, creating a new node M on
   the road plus two tail halves.
2. Press Undo.
**Expected:** Road is a single edge again; node M is gone.
**Actual:** `undoLast` (v20 `game.js:593-611`) only filters
`state.blocks`, never merges the split back or removes M. Cars
still route fine, but M is a phantom T-junction that can be
snap-targeted by later drags.
**Hypothesis:** The `block` undo record needs to remember whether
`placeBlock` created a new node and, if so, re-merge the split
edges and drop M.
**Impact:** Visible as a floating snap-point. Undo is no longer a
true inverse of Place.

### [P2] Undoing a road leaves orphan endpoint nodes
**Status:** open (unchanged at v20)
**Found:** 2026-04-24, v13 `3777dda`
**Repro:**
1. With Road tool, drag from the starter into empty space (creates
   free-end node N).
2. Press Undo.
**Expected:** Road and N both disappear.
**Actual:** Edges are removed (`game.js:596-602`) but N stays in
`state.nodes`. Invisible but snap-targetable.
**Hypothesis:** Undo record needs `nodeIds: [...]` plus a guard
that only removes nodes with no remaining edges, no building, no
entry flag.
**Impact:** Phantom snap-points accumulate where the player has
been experimenting.

### [P2] Pressure ring saturates at capacity — worst jams look like mild ones
**Status:** open (unchanged at v20)
**Found:** 2026-04-24, v13 `3777dda`
**Repro:**
1. Place one Shop far from the gates.
2. Demand 3× for 60s.
**Expected:** Ring visually differentiates "busy" from "severely
backed up."
**Actual:** `pressure = Math.min(1, incoming / capacity)` (v20
`game.js:1415`). At incoming = 3 the ring is already a full red
circle. Incoming = 30 renders identical.
**Hypothesis:** (a) allow `pressure` > 1 and pulse/blink the
arc, or (b) draw an inner second ring whose fill = overflow /
capacity.
**Impact:** Feature's strongest case — "THIS is the bottleneck"
— fails at the worst moment.

### [P2] Weighted-dispatch fallback is uniform, not weighted (edge + house)
**Status:** open, now applies to two call sites
**Found:** 2026-04-24, v13 `3777dda` (edge dispatch); v16
`2590590` introduced the same flaw in house dispatch
**Repro:**
1. Place one House and one Shop, **no Mall**.
2. Watch visit distribution for 60s at demand 3×.
**Expected:** Mall rolls fall back proportionally to the
remaining weights (Shop 30 : House 5 : Exit 25).
**Actual:** Both `tryDispatchFromQueue` (`game.js:832`) and
`tryDispatchFromHouse` (`game.js:898`) shuffle the non-rolled
categories uniformly and pick the first routable one.
**Hypothesis:** Share one helper that re-rolls against the
remaining weights; call it from both dispatch paths.
**Impact:** Houses over-receive / over-send in early-game
layouts. Stated weighting breaks whenever any category is empty.

### [P2] One-way toggle can produce double-rendered edges
**Status:** open, new in v17
**Found:** 2026-04-24, v17 `f726e8c`
**Repro:**
1. Drag any road to build it.
2. With One-way tool, tap it → becomes one-way (twin deleted).
3. Tap again → becomes two-way (new twin added).
4. Inspect the road visually, or `state.edges`.
**Expected:** The re-added twin has an even id and `drawRoads`
dedupes correctly.
**Actual:** `makeEdge` creates fwd/rev in a single increment
pair, so IDs alternate odd/even. `toggleOneWay` (`game.js:694-735`)
calls `state.nextEdgeId++` once on re-add — whatever parity the
counter is sitting on. When `nextEdgeId` is odd at that moment,
both halves of the pair end up with odd IDs.
Every render-loop pass uses `if (e.id % 2 === 0) continue;` to
dedupe — with two odd IDs, the road body, centre stripe, and
shadow are drawn **twice**. `findNearestEdge` sees two candidates
at the same position too.
**Hypothesis:** Keep the odd/even pair invariant: in `toggleOneWay`,
if `state.nextEdgeId % 2 === 1` bump it once before assigning the
twin's id, so the new twin always lands on an even id. Or switch
`drawRoads` / `findNearestEdge` to a `Set` of already-seen
(from,to) pairs rather than relying on id parity.
**Impact:** Visual doubling (slightly thicker line, darker stripe)
on any road that's been toggled one-way → two-way at least once.
Persists across save/load.

### [P3] One-way toggle is not undoable
**Status:** open, new in v17
**Found:** 2026-04-24, v17 `f726e8c`
**Repro:**
1. Tap a road with One-way → becomes one-way.
2. Press Undo.
**Expected:** Road returns to two-way.
**Actual:** `toggleOneWay` doesn't push anything to
`state.undoStack`. Undo silently steps past it to the previous
action.
**Hypothesis:** Push a `{ type: 'oneway', edgeId }` record;
`undoLast` handles it by calling `toggleOneWay` again.
**Impact:** Muscle-memory "oops, undo" doesn't work for
direction changes, unlike roads/blocks/erase.

### [P3] Cars traversing a twin vanish when it's toggled off
**Status:** open, new in v17
**Found:** 2026-04-24, v17 `f726e8c`
**Repro:**
1. With demand at 2× so there's live traffic, wait for a car
   to start crossing a road.
2. Tap that road with One-way in the direction *opposite* to the
   car's travel.
**Expected:** The car is either re-routed, or the toggle is
rejected while the twin has traffic on it.
**Actual:** `toggleOneWay` filters `state.cars` by
`path.some(e => e.id === twin.id)` and drops them (`game.js:705`).
Any car on the deleted twin just disappears.
**Hypothesis:** Either re-route affected cars (like
`splitEdgeAtPoint` does) or mark the twin as "pending deletion"
and wait until it's empty.
**Impact:** Surprise "ghost" disappearance. Surprisingly easy to
trigger at demand 2×+.

### [P3] Corrupted save never self-clears — "Continue" silently fails forever
**Status:** open, new in v14
**Found:** 2026-04-24, v14 `21e3a5a`
**Repro:**
1. Build a city (triggers a save).
2. Manually corrupt `localStorage['traffic-flow:v1']` (dev-tools)
   — or swap to a future SAVE_VERSION in code.
3. Refresh.
**Expected:** Splash either doesn't show Continue, or clicking
Continue warns and clears the bad blob.
**Actual:** `hasSavedCity()` returns `true` (blob exists), so the
splash shows Continue. Clicking it lands in the `catch` branch of
`btn-start` (`game.js:1803-1807`) which logs `'restore failed'`
and silently falls through to a fresh start — but does **not**
call `clearSavedCity()`. Next boot, same thing. The player sees
"Continue" forever, but every click drops them into a fresh
world.
**Hypothesis:** In the catch branch, call `clearSavedCity()` and
`configureSplash()` so the splash reverts to Start.
**Impact:** Low-probability in practice, but a terrible UX when
it happens (player can't get their "Continue" to work and doesn't
know why). Also triggers on any future schema version bump.

### [P3] Save debounce drops the last action on fast refresh
**Status:** open, new in v14
**Found:** 2026-04-24, v14 `21e3a5a`
**Repro:**
1. Build a road, then immediately Cmd-R (< 600ms later).
2. Refresh, click Continue.
**Expected:** The road is there.
**Actual:** `scheduleSave` uses a 600ms `setTimeout` debounce
(`game.js:296`). A refresh inside the window cancels the pending
save. The road is lost.
**Hypothesis:** Add a `beforeunload` handler that flushes any
pending `saveTimer` synchronously, or drop the debounce and just
write every change (payload is small).
**Impact:** Low but non-zero — any hasty action-then-refresh loses
up to one action. More visible on tablet where swipe-to-close is
fast.

### [P3] loadState persists dead schema fields (`junction`, `degree`)
**Status:** open (unchanged)
**Found:** 2026-04-24, v13 `3777dda`
**Actual:** `serializeState` (v20 `game.js:237-262`) still emits
`junction` / `degree` on every node. `makeNode` has never set
them. Dead fields.
**Hypothesis:** Drop from `serializeState` and `loadState`.
**Impact:** Minor — save blob is slightly larger. Future-risk:
if a feature ever decides `junction` means something, saved
cities will restore stale `false` values that look correct.

### [P3] `startGame` warmup advances state.time by 4s
**Status:** open — narrowed in v14 (warmup now skipped on Continue)
**Found:** 2026-04-24, v13 `3777dda`
**Repro:** Fresh start, watch the `rate/min` HUD for the first
10 seconds.
**Actual:** Fresh starts still run
`for (let i = 0; i < 80; i++) stepSim(0.05)` (v20 `game.js:1965`)
and so `state.time` starts at 4. Flow rate's 60s average is
off until ~2 min of real play.
**Hypothesis:** Reset `state.time = 0` after warmup, or don't
increment `state.time` during warmup steps.
**Impact:** HUD-metric blemish only.

### [P3] Seeded queue entries have `waitingSince: 0`
**Status:** open (unchanged)
**Found:** 2026-04-24, v13 `3777dda`
**Actual:** Fresh start seeds 16 queue entries with
`waitingSince: 0` (`game.js:1957-1959`). Invisible until a
wait-time HUD ships; then they read 4s inflated.
**Impact:** Invisible today.

### [P3] Dead `endGame()` / `#gameover` UI still present
**Status:** open (unchanged — `endGame` still dead, `#gameover`
still in HTML)
**Found:** 2026-04-24, v13 `3777dda`
**Actual:** `endGame()` defined at `game.js:2117-2123`, no
callers. `#gameover` + `#btn-retry` still in `index.html:139-146`.
`#btn-retry` wired to `restart()`, not `endGame()`.
**Hypothesis:** Remove both.
**Impact:** None in practice; cleanup.

### [P3] Erasing a road leaves its endpoint nodes behind
**Status:** open (unchanged — same family as the undo node-orphan bugs)
**Found:** 2026-04-24, v13 `3777dda`
**Actual:** `eraseEdgeById` (v20 `game.js:746-760`) filters edges
+ cars, not nodes.
**Impact:** Phantom snap-points build up.

### [P3] Stale "Fuengirola" title + meta description
**Status:** open, new this pass
**Found:** 2026-04-24, noticed at v20 `abc9670`
**Actual:** `index.html:9` reads `<title>Traffic Flow — Fuengirola</title>`
and line 8 meta says "redesign the real Fuengirola interchange".
The game has had no Fuengirola content since v3 (real OSM data
moved to sibling project — see `NOTES.md` § Two sibling projects).
**Hypothesis:** Retitle to `Traffic Flow` and rewrite the meta
to describe the current pixel-sandbox game.
**Impact:** Browser tab / share-preview misrepresents the game.

### [P3] Splash blurb doesn't mention that Houses generate traffic
**Status:** open, new this pass
**Found:** 2026-04-24, first noticed at v20 (feature landed v16)
**Actual:** `index.html:21` still says "Cars enter from the four
edges (N / S / E / W) and drive across the city." Since v16,
Houses *also* spawn cars — the whole point of them. Onboarding
misses this.
**Hypothesis:** Extend the blurb: "Houses you place generate
their own traffic too — build a neighbourhood and watch it flow."
**Impact:** New players won't understand why their mall queues
grow when they add houses.

### [P4] Pressure ring ignores cars currently *at* the building
**Status:** open (unchanged)
**Found:** 2026-04-24, v13 `3777dda`
**Actual:** `b.incoming` only counts `destKind === 'block' &&
!hasVisited`. Once a car is parked (`hasVisited = true`) it drops
off the ring even though it blocks the bay for the dwell time.
**Impact:** Ring understates true bay occupancy.

### [P4] Two Malls placed close together visually overlap
**Status:** open (unchanged)
**Found:** 2026-04-24, v13 `3777dda`
**Actual:** `placeBlock` only rejects on identical `nodeId`.
Mall visual is ≈64px wide — two Malls on nodes 60px apart
overlap substantially.
**Impact:** Aesthetic.

### [P4] House spawn timers synchronise on reload
**Status:** open, new in v16
**Found:** 2026-04-24, v16 `2590590`
**Repro:**
1. Place 5+ Houses, let the game run until house-spawning has
   desynced (few seconds).
2. Refresh, click Continue.
**Expected:** Houses continue spawning at their own phases.
**Actual:** `serializeState` saves blocks with
{id, type, x, y, nodeId, visits, dwell, size} — `timer` is not
included (`game.js:255-259`). After load, every house has
`b.timer = undefined` and the first tick sets `timer = dt`,
meaning all houses reach `HOUSE_SPAWN_INTERVAL` at the same
moment and fire in lockstep.
**Hypothesis:** Persist `b.timer`, or seed it to
`Math.random() * HOUSE_SPAWN_INTERVAL` on load.
**Impact:** Brief synchronised burst of traffic ~5s after
Continue. Noticeable with 10+ houses.

### [P4] `bestScore` in memory only between "Start fresh" and first save
**Status:** open, new in v18
**Found:** 2026-04-24, v18 `8b0fddc`
**Actual:** `Start fresh` calls `clearSavedCity()` (wipes
localStorage). `buildLevel()` preserves `state.bestScore` in
memory. First save action after restart writes it back. If the
player hard-refreshes between the two, `bestScore` is gone.
**Hypothesis:** Write `bestScore` to a separate localStorage key
that survives `clearSavedCity`, or call `scheduleSave` + flush
from the `btn-reset` handler.
**Impact:** Tiny window, rare, but the "best" stat is a
headline HUD element.

### [P4] `srcBlockId` field on house-spawned cars is never read
**Status:** open, new in v16
**Found:** 2026-04-24, v16 `2590590`
**Actual:** `tryDispatchFromHouse` sets `srcBlockId: house.id` on
the car object (`game.js:929`). Grep confirms nothing reads it.
Dead field.
**Hypothesis:** Either delete, or use it so a house car returning
via exit can be attributed to its origin (stat breakdowns,
future features).
**Impact:** Zero today.

## Resolved

### [P1] Persistence is write-only — saved city is never restored
**Status:** fixed-in-v14 (commit `21e3a5a`)
**Found:** 2026-04-24, v13 `3777dda`
**Fix:** `btn-start` handler now calls `loadState` if
`hasSavedCity()`. Splash flips "Start" → "Continue" and reveals
a "Start fresh" secondary button (`configureSplash`). RESEARCH.md
#1 shipped.
**Follow-ups:** Two adjacent issues moved to Open — *Corrupted
save never self-clears* (P3) and *Save debounce drops last
action on fast refresh* (P3).

### [P2] `loadState` skips `state.started`, so post-load writes won't persist
**Status:** effectively fixed in v14 (by call-site sequencing)
**Found:** 2026-04-24, v13 `3777dda`
**Fix path:** `loadState` itself still doesn't set
`state.started`, but every caller (`btn-start`, `btn-reset`)
invokes `startGame(...)` immediately after, and `startGame` sets
`state.started = true`. The originally feared scenario ("save
silently fails after Continue") is unreachable in the current
code paths. Closing as resolved; if future code paths call
`loadState` without `startGame`, reopen.
