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
- [ ] **Undo** reverses the last road addition (one-level undo).

## Roundabout

- [ ] Tap a 3+ way junction with Roundabout tool → converts to CCW
      one-way ring.
- [ ] Cars navigate the roundabout without stopping or backtracking.
- [ ] Roundabout on a 2-way junction is rejected or does nothing.

## Buildings (v12+)

- [ ] Building palette shows House, Shop, Mall options.
- [ ] Placing a House near a road snaps to the road and is
      reachable.
- [ ] Placing a Mall that would collide with another building is
      rejected.
- [ ] Each building type renders distinctly (House has pitched
      roof, Shop has awning, Mall has glass front).
- [ ] Car visits increment each building's `visits` counter.

## Weighted dispatch + pressure rings (v13+)

- [ ] Cars with no buildings placed: pass-through edge-to-edge only.
- [ ] Cars with buildings placed: some visit buildings, some pass
      through.
- [ ] Pressure ring around a building grows as cars queue to visit.
- [ ] Pressure ring drains when cars are delivered.
- [ ] Pressure ring colour transitions green → amber → red as it
      fills.

## Demand slider

- [ ] Slider 0× pauses new spawns entirely.
- [ ] Slider 3× produces visible queueing at entries.
- [ ] Slider value displays correctly (e.g. "1.5×").

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

_Last updated:_ (playtest session to update after each pass)
