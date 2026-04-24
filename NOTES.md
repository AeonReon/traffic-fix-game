# Traffic Flow — dev notes

Running notes so we don't lose direction between sessions.

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
