# Regression test plan

Manual checklist the build session runs before every deploy.
Maintained by the playtest session — add new cases as features ship,
remove ones that no longer apply.

Target: ≤80 items total. If it gets longer than that, nobody will
run it. Cull the least-valuable checks.

## Startup / load

- [ ] Page loads at https://traffic-fix-game.vercel.app without
      console errors.
- [ ] Splash card appears with title, blurb, Start button (fresh
      profile / cleared localStorage).
- [ ] With a saved city present, splash shows "Continue" primary +
      "Start fresh" secondary.
- [ ] Tapping Start / Continue dismisses splash, shows HUD +
      toolbar.
- [ ] Starter W↔E road is visible on fresh start; N and S entries
      are disconnected.

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
- [ ] v15 orthogonal snap: a mostly-horizontal free-end drag ends
      perfectly horizontal (y unchanged from start). Mostly-vertical
      drag ends perfectly vertical. Diagonal drag snaps to 45°.

## One-way (v17)

- [ ] Tap a two-way road with One-way tool → becomes one-way in
      the direction the road was originally built. Dashed centre
      stripe is replaced by chevrons.
- [ ] Tap again → restored to two-way. Chevrons gone, stripe back.
- [ ] Toggle-toggle does NOT produce a double-rendered road
      (known-issue P2 — expect this to fail until fixed).
- [ ] Cars routing on a one-way road respect the direction (no
      reverse traversal).
- [ ] Undo a one-way toggle reverses it (known-issue P3 —
      expected to fail).
- [ ] Toggling a road with traffic on the twin side does NOT
      silently drop cars (known-issue P3 — expected to fail).

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

## House-origin traffic (v16)

- [ ] Place a few Houses; with one Mall and one Shop also placed,
      houses spawn their own cars heading to those destinations.
- [ ] House-spawn rate scales with Demand slider (0× → no house
      cars; 3× → ~3× faster).
- [ ] House-origin car at an exit gate awards delivery points and
      shows the "+1" popup.
- [ ] A House with no reachable Mall/Shop/Exit silently stops
      spawning that tick (no console errors).
- [ ] After Continue from save, houses don't all fire in
      lockstep (known-issue P4 — expected to fail).
- [ ] People stat = Houses × 2 in HUD.

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

## Persistence (v14 — wired)

- [ ] Place a building, refresh — building is still there.
- [ ] Drag a custom road, refresh — road is still there.
- [ ] Demand-slider position persists across refresh.
- [ ] Score + bestScore persist across refresh.
- [ ] "Start fresh" wipes saved city; splash reverts to "Start" on
      next boot.
- [ ] Saving still works *after* a Continue (second refresh retains
      post-resume work).
- [ ] Refresh within 600ms of a road placement — road still there
      (known-issue P3 debounce — expected to fail).
- [ ] A corrupted `localStorage['traffic-flow:v1']` doesn't soft-
      lock the splash on "Continue" forever (known-issue P3 —
      expected to fail).
- [ ] One-way toggles persist across refresh (no ghost twins
      reappear).

## Score + bestScore (v18)

- [ ] Mall visit = +3, Shop = +2, House = +1, Exit delivery = +1.
- [ ] Floating "+N" popup appears at the event location, rises
      and fades (v20).
- [ ] `best N` appears under current score only when the current
      run is below the personal best.
- [ ] bestScore is preserved across a "Start fresh" reset.

## Visuals (v15 + v18–v20)

- [ ] Cars render as oriented rectangles with windshield +
      headlights (v15), using 10-colour pastel palette (v19).
- [ ] Delivery burst ring: green at a building visit, orange at
      an exit.
- [ ] Queue dots at each gate are tinted in the gate's colour
      (sage N / blue S / peach E / lavender W).
- [ ] Ambient decor (trees, grass, flowers) renders between grid
      and roads — roads cover it cleanly.
- [ ] Canvas background uses a warm radial gradient (not flat
      cream).
- [ ] Toolbar icons show resting colour tints; active tool is
      full orange.
- [ ] Chevrons render along one-way roads; dashed centre stripe
      renders along two-way roads only.

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

_Last updated:_ 2026-04-24 — playtest session, post-v14–v20
backlog-drain pass (added One-way, House-origin traffic, Score +
bestScore, Visuals sections; rewrote Persistence to reflect v14
wire-up; flagged new v17 known-issue cross-refs).
