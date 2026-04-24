# Regression test plan

Manual checklist the build session runs before every deploy.
Maintained by the playtest session — add new cases as features ship,
remove ones that no longer apply.

Target: ≤80 items total. If it gets longer than that, nobody will
run it. Cull the least-valuable checks.

## Startup / load

- [ ] Page loads at https://traffic-fix-game.vercel.app without
      console errors.
- [ ] Splash card appears with title, blurb, Start button.
- [ ] Tapping Start dismisses splash and shows HUD + toolbar.
- [ ] Starter W↔E road is visible; N and S entries are disconnected.

## Roads

- [ ] Drag to build a road — appears on pointer-up.
- [ ] Road drag snaps end to nearest node / edge / grid point.
- [ ] Drag ending on an existing road creates a T-junction (edge
      splits, no visible glitches, cars on the old edge migrate).
- [ ] Drag through an existing road with **Road** tool → rejected
      with red-dashed preview.
- [ ] Drag through an existing road with **Bridge** tool → accepted,
      rendered as bridge.
- [ ] **Erase** tool removes a road; cars on it are removed or
      reroute safely (no "ghost" cars).
- [ ] Very short drags (< 30/scale px) are silently ignored (no
      toast, no road).

## Roundabout

- [ ] Tap a 3+ way junction with Roundabout tool → converts to CCW
      one-way ring.
- [ ] Cars navigate the roundabout without stopping or backtracking.
- [ ] Roundabout on a 2-way junction is rejected or does nothing.

## Buildings (v12+)

- [ ] Building palette shows House, Shop, Mall options.
- [ ] Placing a House near a road snaps to the road and is
      reachable.
- [ ] Placing on top of an existing building is rejected with
      "Building already here" toast.
- [ ] Placing on a gate (entry) is rejected with "Can't place on
      a gate" toast.
- [ ] Placing a building on an edge mid-span splits the edge —
      cars on it continue without visible glitch.
- [ ] Each building type renders distinctly (House has pitched
      roof, Shop has awning, Mall has 'M' glyph + glass front).
- [ ] Mall renders visibly larger than House/Shop (size 2).
- [ ] Car visits increment each building's `visits` counter.
- [ ] Dwell time at each type feels distinct: House ~2.6s, Shop
      ~2.0s, Mall ~4.0s before car leaves.

## Undo

- [ ] Undo a road — road disappears, cars on it are removed (no
      ghost cars left orbiting).
- [ ] Undo a building placed in open space — building disappears.
- [ ] Undo a building placed *onto a road* — building AND the
      split-point node it created on the road are both gone; the
      road is a single edge again (see known-issue P2).
- [ ] Undo a free-end road — the dead-end node created at the
      far end is also removed (see known-issue P2).
- [ ] Undo with nothing to undo — toast shows "Nothing to undo".
- [ ] Cmd/Ctrl-Z keyboard shortcut fires Undo.

## Weighted dispatch (v13+)

- [ ] No buildings placed — cars pass through edge-to-edge.
- [ ] Place one each of Mall / Shop / House — over 60s, Malls
      receive roughly Mall:Shop:House = 40:30:5 share of visits
      (allow ±20% wobble).
- [ ] Place only a House — House still gets some visits (the
      fallback picks it up); most cars pass through (see known-
      issue: fallback is uniform not weighted).
- [ ] Disconnect every building from the network — cars still
      spawn and exit; none get stuck trying to reach unreachable
      buildings.

## Pressure rings (v13+)

- [ ] Ring renders *behind* the building body, not on top.
- [ ] Ring is invisible (or near-invisible) when incoming = 0.
- [ ] Ring grows as cars are dispatched toward that building.
- [ ] Ring colour transitions green → amber → red as it fills.
- [ ] Ring drains immediately on car arrival (known limitation:
      does not account for dwell time).
- [ ] Mall ring reaches full at 5 incoming; Shop/House ring
      reaches full at 3 incoming.
- [ ] Ring never exceeds a full circle (cosmetic note: no
      differentiation past capacity — known-issue P2).
- [ ] Ring scales correctly when zooming in/out.

## Demand slider

- [ ] Slider 0× pauses new spawns entirely.
- [ ] Slider 3× produces visible queueing at entries.
- [ ] Slider value displays correctly (e.g. "1.5×").

## Persistence (RESEARCH.md #1 — currently NOT wired)

Once `loadState` is called from boot, these should pass. Until
then, they all fail (see known-issue P1).

- [ ] Place a building, refresh the page — building is still
      there.
- [ ] Drag a custom road, refresh — road is still there.
- [ ] Demand-slider position persists across refresh.
- [ ] `delivered` / `visits` counters persist across refresh.
- [ ] A "Resume city / Start fresh" choice appears on splash if
      a saved city exists.
- [ ] Saving works *after* a resume (second refresh retains
      post-resume work — see known-issue P2 on
      `state.started`).

## Camera / touch

- [ ] Two-finger pan moves the view.
- [ ] Pinch-zoom scales the view, staying anchored around the
      pinch centre.
- [ ] One-finger drag on empty space pans (or builds a road,
      depending on the spec — check whichever is current).
- [ ] Snap radii feel right at min zoom and at max zoom.

## Jam / game state

- [ ] Queue overflow at an entry fills the jam meter visibly.
- [ ] Jam meter drains when queues clear.
- [ ] No game-over popup fires (sandbox mode).
- [ ] Pressing Space toggles pause (once Start has been tapped).
- [ ] Queue dispatches in FIFO order (see known-issue P1 —
      currently LIFO via `queue.pop()`).

## Visual

- [ ] No NaN / undefined rendered as text anywhere.
- [ ] At default zoom, cars are recognizable as cars (post-design-
      pack Pass A).
- [ ] Drop shadows are consistent direction on all raised objects
      (post-design-pack Pass B).

## Mobile / tablet

- [ ] Opens correctly on iPad at portrait and landscape.
- [ ] HUD doesn't overflow or collide with safe-area insets.
- [ ] Toolbar accessible on small phones (iPhone SE width ≤ 380px).

## Cross-browser

- [ ] Works on iOS Safari (primary target).
- [ ] Works on Chrome desktop.
- [ ] Works on Firefox desktop.

---

_Last updated:_ 2026-04-24 — playtest session, post-v13 review
(added Persistence, Undo, Weighted dispatch, Pressure rings
sections; expanded Buildings; flagged known-issue cross-refs).
