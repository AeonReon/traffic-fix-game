# Playtest log

One paragraph per playtest session. Newest at top. Include: date,
version tested, what you looked at, what you found.

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
