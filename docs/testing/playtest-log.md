# Playtest log

One paragraph per playtest session. Newest at top. Include: date,
version tested, what you looked at, what you found.

## 2026-04-24 — backlog-drain pass on v14–v23 (head `4bec233`)

Six ships in a row to catch up on: v14 persistence, v15 orthogonal-
snap + rectangular cars + delivery bursts, v16 houses-as-origins +
People HUD, v17 one-way tool + SVG toolbar, v18 score + gate
colours + ambient decor, v19 pastel cars + gate-tinted queues,
v20 UI colour pass + floating "+N" popups. Code review only (no
browser MCP). Read the v14–v20 diffs in sequence, then re-tested
each still-open bug from the first pass against the current
`game.js` (now 2183 lines).

**Closed 2 of the 14 original bugs.** P1 persistence-is-write-only
is **fixed in v14** — `btn-start` now calls `loadState` when
`hasSavedCity()` returns true, and the splash flips "Start" →
"Continue" with a "Start fresh" secondary. The P2
`state.started`-not-set-in-loadState concern is **effectively
fixed by call-site sequencing**: every `loadState` caller now
invokes `startGame` right after, which sets `started = true`.
Moved both to Resolved.

**12 of the original 14 still open.** The two P1s + four P2s I
filed on v13 are all unchanged in v20: queue still drains LIFO
(`entry.queue.pop()` at `game.js:891`), undo still leaves orphan
nodes + split tails, pressure ring still saturates at capacity,
weighted-dispatch fallback is still uniform — and v16 cloned the
fallback bug into the new `tryDispatchFromHouse`, so the P2 now
applies to *two* call sites.

**Nine new bugs filed against v14–v20.** Headliners:

- **P2 new**: one-way toggle can produce double-rendered edges
  (v17). `toggleOneWay` re-adds a twin with `state.nextEdgeId++`
  without preserving the odd/even pair invariant `drawRoads` and
  `findNearestEdge` rely on. Once `nextEdgeId` is odd at the
  toggle moment, both halves of the pair end up odd → the road
  body, centre stripe, and shadow all draw twice. Persists across
  save/load.
- **P3 new**: one-way toggles don't push to `undoStack` — Undo
  silently steps past them.
- **P3 new**: toggling a twin off drops cars currently on that
  side without re-routing — easy to trigger at demand 2×+.
- **P3 new**: a corrupted / schema-mismatched save blob never
  self-clears. `hasSavedCity` still returns true, splash still
  shows "Continue", clicking it lands in the catch branch and
  falls through to a fresh start without calling
  `clearSavedCity` — so the splash is stuck on "Continue" that
  doesn't continue anything.
- **P3 new**: 600ms save debounce loses the last action on a
  fast refresh. No `beforeunload` flush.
- **P3 new**: HTML title + meta description still reference
  "Fuengirola" (pre-v3 direction). Splash blurb (v16-stale)
  doesn't mention that Houses generate their own traffic, so
  new players miss the whole point of the building.
- **P4 new**: house spawn timers aren't persisted — after
  Continue, every house fires in lockstep a few seconds later.
- **P4 new**: bestScore lives in memory only between Start-fresh
  and the first save action; hard-refresh in that window loses
  it.

Test plan bumped to 90 items (target ≤80 — close enough to
trim another pass later). Added One-way (v17), House-origin
traffic (v16), Score + bestScore (v18), Visuals (v15–v20)
sections; rewrote the Persistence section to reflect v14's
wire-up and cross-ref the new v14 known-issues. Merged the
stray dead Visual section into the new Visuals one. Dropped the
Firefox and "one-finger drag on empty" items as low-value.

**Lane note:** v23 (`4bec233`) committed 528 lines of changes
to `docs/testing/known-issues.md` and 102 lines to
`docs/testing/test-plan.md` — both files in this session's
lane. Content matches what I wrote independently this turn
(the build session appears to have run its own playtest review
using the same bug list). No rebase conflict because my local
content was equivalent, but flagging for coordination: the
Build session should leave `docs/testing/` alone.

Also scanned v21 (explicit Pause), v22 (flow sparkline +
peak-flow callout), and v23 (sound pass 1) while I was in the
code. Only two new bugs filed there — a P3 on inconsistent
audio feedback (only road/bridge builds play a click; block
placement, one-way toggle, roundabout, erase and undo are
silent) and a P4 on the `Audio` namespace name shadowing the
built-in `window.Audio` constructor inside the game's IIFE.
v21 and v22 both look clean on code review.

## 2026-04-24 — first playtest pass on v13 (`3777dda`)

No browser MCP available this session — pure static code review of
`js/game.js` (1632 lines, single file) against the v12 + v13 diffs
and the recent `NOTES.md` "Shipped log". Focus areas were (a) the
new weighted-dispatch category roll + fallback, (b) the new
Mini-Metro-style pressure rings, (c) the persistence layer which
the RESEARCH roadmap flags as top priority, (d) Undo interactions
with the typed-building placement that splits an edge in-flight.

Bugs filed (see `known-issues.md`): 14 total, 2×P1, 6×P2, 4×P3,
2×P4. Highlights: **persistence is write-only** — `loadState` /
`hasSavedCity` / `clearSavedCity` are all defined but `grep`
confirms no caller, so every refresh wipes the city despite the
save blob being written faithfully (P1). The **queue drains
LIFO** because `tryDispatchFromQueue` uses `entry.queue.pop()`
instead of `shift()` — currently invisible because wait-time
isn't displayed, but it's a latent correctness bug waiting for
the first "oldest wait" HUD (P1). **Undo is not a true inverse**
of placement: placing a building onto a road splits the edge and
creates a junction node; undo only drops the block, leaving the
split + orphan node behind. Same family of issue for free-end
road drags (orphan dead-end nodes persist after undo / erase)
(P2×2). The **pressure ring saturates at capacity** — a shop
with 3 incoming and a shop with 30 incoming render identical
full-red full-circle rings, so the "THIS is the bottleneck"
signal fails when you most need it (P2). **Weighted dispatch
falls back uniformly** not proportionally when the rolled
category has no instances — so in early-game layouts with no
Mall, Houses get 1/3 share instead of the intended 5/60 (P2).
Also logged several persistence-adjacent issues (`loadState`
doesn't restore `state.started`, dead `junction`/`degree`
fields in the save schema) so they get fixed *with* issue P1
rather than in a second pass.

Test plan extended with Persistence, Undo, Weighted-dispatch,
and Pressure-rings sections; Buildings section expanded to cover
the new collision/snap cases; cross-refs to known-issue IDs
added to the checklist items that are currently expected to
fail.
