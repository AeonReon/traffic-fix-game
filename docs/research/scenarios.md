# Scenarios — hand-authored starting layouts

Full spec for `optimization.md` A8 and RESEARCH Stage F.

**What this is:** A splash-screen picker that lets the player choose
one of several hand-crafted starting maps. Each scenario has its own
gate positions, starter roads, terrain features (rivers, parks), and
its own independent save slot.

**What this is not:** Procedural generation. Random starts. Difficulty
levels. Unlocks / progression gates. Every scenario is available
from the first boot, forever. Design reason: we committed to
*designer-driven* play. Random scenarios would reintroduce the Mini
Motorways chaos we rejected.

## Why ship this

- Second reason to open the app tomorrow. Without scenarios, "reopen
  my same city" is the only loop. Scenarios add "let me try a
  different one tonight".
- Free gameplay variety. Different terrain forces different design
  choices — a river that can only be bridged at N:M points changes
  how you think about flow.
- Sets the groundwork for Stage H (OSM import) — "Real: Fuengirola"
  becomes just another scenario once the picker exists.
- Cheap to add: scenarios are just data. The engine already handles
  everything they need (entries, roads, blocks). Only real new code
  is terrain rendering + validation.

## UX flow

```
    [ App boots ]
          │
          ▼
    [ Splash — Scenario Picker ]
          │
    ┌─────┴─────┬──────────────┬───────────────┐
    ▼           ▼              ▼               ▼
  Plains     Coastal      Two Districts       Ring
  (Resume)   (Start)      (Start)             (Resume)
          │
     [ tap a card ]
          │
          ▼
    [ Game starts with that scenario's state ]
```

### Splash changes

Replace the current single Start / Continue splash with a 2×2 grid
of scenario cards. Each card shows:
- The scenario name (big, 22px, weight 700).
- A one-line tagline ("A river splits the map").
- A tiny procedural preview — a 160×100 mini-render of the scenario's
  entries, starter roads, and terrain. Not a static image; rendered
  from the scenario data each time (so if we tweak a scenario, its
  preview updates automatically).
- Primary action button:
  - `Resume` (green, if that scenario has a save) — enters the
    scenario with saved state restored.
  - `Start` (terracotta, otherwise) — enters fresh.
- Secondary action (only when a save exists): `Start fresh` — clears
  the save for that scenario and starts from the base layout.

### Active-game changes

- The in-game "Start fresh" button in the pause menu now reads
  "Back to picker" — takes the player back to the splash to choose a
  different scenario. Doesn't clear any saves.
- Add an "Reset this scenario" item under a new "⋯" menu in the HUD.
  Triggers a confirmation toast: "Reset your [Coastal] city? Start
  fresh keeps your other scenarios." Two buttons, confirm/cancel.

### Mobile considerations

2×2 grid on tablet, 1-column scroll on phone. Each card ≥ 120px tall
for touch target. Cards use the existing panel style so zero CSS
reinvention.

## Schema

Store at `data/scenarios.json`. One object, keyed by id, values are
scenario definitions.

```json
{
  "schema": 1,
  "scenarios": {
    "plains": {
      "id": "plains",
      "name": "Plains",
      "tagline": "Open ground. Classic four gates.",
      "entries": [
        { "id": "N", "x": 600,  "y": 60,   "side": "N" },
        { "id": "S", "x": 600,  "y": 1500, "side": "S" },
        { "id": "W", "x": 60,   "y": 780,  "side": "W" },
        { "id": "E", "x": 1140, "y": 780,  "side": "E" }
      ],
      "starterRoads": [
        { "a": { "x": 60, "y": 780 }, "b": { "x": 1140, "y": 780 } }
      ],
      "terrain": [],
      "startingBuildings": []
    },

    "coastal": {
      "id": "coastal",
      "name": "Coastal",
      "tagline": "A river splits the map. Bridge to connect.",
      "entries": [
        { "id": "N",  "x": 600,  "y": 60,   "side": "N" },
        { "id": "S",  "x": 600,  "y": 1500, "side": "S" },
        { "id": "W",  "x": 60,   "y": 780,  "side": "W" }
      ],
      "starterRoads": [
        { "a": { "x": 60, "y": 780 }, "b": { "x": 540, "y": 780 } }
      ],
      "terrain": [
        {
          "type": "river",
          "shape": [
            { "x": 540, "y": 60   },
            { "x": 600, "y": 480  },
            { "x": 540, "y": 900  },
            { "x": 600, "y": 1320 },
            { "x": 540, "y": 1500 },
            { "x": 660, "y": 1500 },
            { "x": 720, "y": 1320 },
            { "x": 660, "y": 900  },
            { "x": 720, "y": 480  },
            { "x": 660, "y": 60   }
          ]
        },
        {
          "type": "sea",
          "shape": [
            { "x": 1100, "y": 0    },
            { "x": 1200, "y": 0    },
            { "x": 1200, "y": 1560 },
            { "x": 1100, "y": 1560 }
          ]
        }
      ],
      "startingBuildings": []
    },

    "two-districts": {
      "id": "two-districts",
      "name": "Two Districts",
      "tagline": "Two clusters. Unify them.",
      "entries": [
        { "id": "N", "x": 600,  "y": 60,   "side": "N" },
        { "id": "S", "x": 600,  "y": 1500, "side": "S" },
        { "id": "W", "x": 60,   "y": 780,  "side": "W" },
        { "id": "E", "x": 1140, "y": 780,  "side": "E" }
      ],
      "starterRoads": [
        { "a": { "x": 60, "y": 780 }, "b": { "x": 420, "y": 780 } },
        { "a": { "x": 420, "y": 480 }, "b": { "x": 420, "y": 1080 } },

        { "a": { "x": 1140, "y": 780 }, "b": { "x": 780, "y": 780 } },
        { "a": { "x": 780, "y": 480 }, "b": { "x": 780, "y": 1080 } }
      ],
      "startingBuildings": [
        { "type": "house", "x": 300, "y": 660 },
        { "type": "house", "x": 300, "y": 900 },
        { "type": "shop",  "x": 540, "y": 600 },
        { "type": "house", "x": 900, "y": 660 },
        { "type": "house", "x": 900, "y": 900 },
        { "type": "shop",  "x": 660, "y": 600 }
      ],
      "terrain": []
    },

    "ring": {
      "id": "ring",
      "name": "Ring",
      "tagline": "A park at the centre. Flow goes around.",
      "entries": [
        { "id": "N", "x": 600,  "y": 60,   "side": "N" },
        { "id": "S", "x": 600,  "y": 1500, "side": "S" },
        { "id": "W", "x": 60,   "y": 780,  "side": "W" },
        { "id": "E", "x": 1140, "y": 780,  "side": "E" }
      ],
      "starterRoads": [
        { "a": { "x": 60, "y": 780 }, "b": { "x": 360, "y": 780 } },
        { "a": { "x": 1140, "y": 780 }, "b": { "x": 840, "y": 780 } }
      ],
      "terrain": [
        {
          "type": "park",
          "shape": [
            { "x": 420, "y": 540  },
            { "x": 780, "y": 540  },
            { "x": 900, "y": 780  },
            { "x": 780, "y": 1020 },
            { "x": 420, "y": 1020 },
            { "x": 300, "y": 780  }
          ]
        }
      ],
      "startingBuildings": []
    }
  }
}
```

### Schema field reference

| Field | Type | Notes |
|---|---|---|
| `schema` | number | Top-level schema version. Bump if you ever change the shape. |
| `scenarios[id]` | object | One per scenario. |
| `.id` | string | Matches the key. Used as the localStorage save-slot suffix. |
| `.name` | string | Shown on the card. Keep ≤ 14 chars. |
| `.tagline` | string | One sentence, ≤ 40 chars. |
| `.entries` | array | Same shape as `LEVEL.entries` in game.js today. 2-4 entries. |
| `.starterRoads` | array | Same shape as `LEVEL.starterRoads` today. Segments placed on boot. |
| `.terrain` | array | Zero or more terrain polygons. |
| `.terrain[].type` | string | One of `river`, `park`, `sea`. |
| `.terrain[].shape` | array | Polygon vertices as `{x, y}` pairs. Auto-closed. |
| `.startingBuildings` | array | Zero or more buildings placed on boot. |
| `.startingBuildings[].type` | string | `house`, `shop`, `mall`. |
| `.startingBuildings[].x/y` | number | World coords. Must be on a road or anchor to grid. |

## Terrain rules

### River
- **Roads:** Bridge tool can cross. Road tool cannot — drag preview
  goes red the moment it crosses a river polygon edge.
- **Buildings:** Cannot be placed on a river polygon.
- **Render:** Fill with `#9cc7d0` (pale teal). Then a subtle
  horizontal wave detail — 2-3 short light-cream dashes across the
  polygon, offset 40u apart vertically. Looks like moving water.
- **Stack order:** Drawn *below* grid dots and roads so bridges sit
  on top (correct visual layering).

### Park
- **Roads:** Cannot cross. Neither Road nor Bridge can be dragged
  across a park polygon. Drag preview goes red.
- **Buildings:** Cannot be placed on a park polygon.
- **Render:** Fill with `#a8c890` (muted sage). Scatter ~5 tree
  glyphs (small canopy circles) procedurally inside the polygon for
  visual interest — deterministic seed from the scenario id so the
  layout is stable.
- **Stack order:** Drawn below roads so if the player *could* route
  around a park, road would clearly overlap park edge.

### Sea
- **Roads:** Cannot cross. Same as park — but visually distinct.
- **Buildings:** Cannot be placed.
- **Render:** Fill with `#7aa7c4` (deeper blue-teal). No wave detail
  (reserved for river). Polygon should touch the map edge to read
  as "coast, not pond".
- **Stack order:** Below grid dots, below roads.

### Generic polygon rules
- Polygon vertices stored CCW, auto-closed.
- Self-intersection not supported (keep scenarios well-authored).
- Point-in-polygon check for validation: standard even-odd
  fill rule. Implementation: walk edges, count crossings.

## Build-time validation helpers

Add to `game.js`:

```js
function roadWouldCrossTerrain(a, b, terrain) {
  // For every segment of the proposed road (a→b), check intersection
  // against every edge of every polygon in state.terrain.
  for (const t of state.terrain) {
    const pts = t.shape;
    for (let i = 0; i < pts.length; i++) {
      const c = pts[i];
      const d = pts[(i + 1) % pts.length];
      if (segIntersect(a, b, c, d)) {
        return { type: t.type, at: segIntersect(a, b, c, d) };
      }
    }
  }
  return null;
}

function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].y, xi = poly[i].x;
    const yj = poly[j].y, xj = poly[j].x;
    const intersect = ((yi > p.y) !== (yj > p.y))
      && (p.x < (xj - xi) * (p.y - yi) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function canPlaceOn(x, y) {
  for (const t of state.terrain) {
    if (pointInPolygon({x, y}, t.shape)) {
      if (t.type === 'park' || t.type === 'sea' || t.type === 'river') return false;
    }
  }
  return true;
}
```

Drag preview consults `roadWouldCrossTerrain`:
- If crosses a river and tool ≠ Bridge → preview red, reject.
- If crosses park or sea with *any* tool → preview red, reject.
- Otherwise green preview as today.

Building placement consults `canPlaceOn`:
- If `false` → reject with toast "Can't build on water / can't build
  in the park".

## Persistence — per-scenario save slots

Current save key: `traffic-flow:v1`.
New scheme: `traffic-flow:v1:<scenarioId>`.

So saves are isolated:
- `traffic-flow:v1:plains` — Plains city.
- `traffic-flow:v1:coastal` — Coastal city.
- etc.

### Migration

First boot after this feature ships:
- If `traffic-flow:v1` exists and no per-scenario keys exist, move
  its content to `traffic-flow:v1:plains` (assume user was playing
  the default).
- Delete the legacy key.
- Do this once; gate with a `traffic-flow:v1:migrated` flag.

### Active scenario

Track `state.scenarioId` (string). Set by the splash picker. All
save-related code reads/writes the correct keyed slot.

`saveState()` serialises to `localStorage[`traffic-flow:v1:${state.scenarioId}`]`.
`loadState(scenarioId)` reads from the matching key.

### Schema version in saves

Each save already has a `v:1` version. When we ship scenarios, we
add `scenarioId` to the save shape:

```json
{
  "v": 1,
  "scenarioId": "coastal",
  "nodes": [...],
  "edges": [...],
  "buildings": [...],
  "demandMult": 1.0,
  "delivered": 42,
  "visits": 17,
  "peopleCount": 8,
  "score": 73,
  "time": 312.4,
  "milestonesSeen": [...]
}
```

No breaking change — old saves without `scenarioId` get treated as
`plains` during migration.

## Milestones interaction (updates `milestones.md`)

**Decision:** Milestones are **per-scenario**, not per-player.

Reasoning: The joy of "First mall!" is a discovery moment. A player
picking up Coastal for the first time after 10 hours in Plains
should still get that moment. Otherwise scenarios are less fresh.

Implementation:
- `state.milestonesSeen` is a `Set` scoped to the active save slot.
- Saved into the per-scenario save blob (`save.milestonesSeen`).
- No shared "all scenarios" milestones file — each scenario has its
  own independent set.
- Delete `localStorage['tf:milestones']` on migration (the
  milestones-per-player key). Grandfather each pre-existing save
  independently on next load.

Update `milestones.md` §Persistence accordingly. I'll make that
edit in a follow-up commit so scenario spec lands cleanly.

## Implementation sequence

Ship this as **three separate ships**. Each one standalone.

### Ship S1: Terrain render + validation (no picker yet)
- Add `state.terrain[]` to engine.
- Load `data/scenarios.json` at boot.
- For now, always use `plains` (no picker UI).
- Add terrain render pass to `render()` between grid and roads.
- Add `roadWouldCrossTerrain` / `pointInPolygon` / `canPlaceOn`.
- Wire validation into `addRoad` and `placeBlock`.

Ships as v24. Visible change: *none* unless we swap the default to
Coastal for testing. But the scaffolding is in.

### Ship S2: Scenario picker on splash
- Replace the single splash card with the 2×2 scenario grid.
- Each card renders a mini-preview.
- Per-card Resume / Start logic based on per-scenario save-slot
  presence.
- Migrate old save to `plains` slot.
- Default active: whichever was last played (track in
  `localStorage['tf:last-scenario']`).

Ships as v25. Now scenarios exist from the player's POV.

### Ship S3: "Back to picker" / "Reset this scenario" UI
- Pause menu gets "Back to picker" instead of "Start fresh".
- HUD `⋯` menu with "Reset this scenario" (with confirmation).
- All "clear saved city" flows updated.

Ships as v26. Round-trip between scenarios works.

Total estimated work: **~4-5 hours spread across 3 ships**.

## Acceptance criteria

### Per ship

**S1:**
- [ ] `data/scenarios.json` loaded on boot, parsed, accessible as
      `state.scenarios`.
- [ ] `state.terrain` populated from active scenario.
- [ ] Terrain polygons render (river teal, sea deeper blue, park sage).
- [ ] Road drag across river → red preview with Road tool, green
      with Bridge.
- [ ] Road drag across park or sea → red preview regardless of tool.
- [ ] Building drag onto park / river / sea → rejected with toast.
- [ ] Existing Plains gameplay is unchanged.

**S2:**
- [ ] Splash shows 2×2 card grid with 4 scenarios.
- [ ] Each card shows a mini-preview rendered from scenario data.
- [ ] Resume button appears iff that scenario has a save.
- [ ] Tapping a card enters that scenario (fresh or resumed).
- [ ] Legacy save migrates to `plains` slot on first boot.
- [ ] Switching scenario doesn't affect other scenarios' saves.

**S3:**
- [ ] "Back to picker" in pause menu works.
- [ ] "Reset this scenario" shows confirmation, clears only that
      scenario's save on confirm.
- [ ] Navigating away and back preserves in-flight cars / state.

### Cross-cutting

- [ ] Milestones fire per-scenario (first mall in Plains doesn't
      block first mall in Coastal).
- [ ] All four starter scenarios complete-able (player can reach
      a sustainable flow state in each).
- [ ] No console errors on load, on scenario switch, or on reset.

## Playtesting notes (for playtest session)

When S1-S3 ships, specific things to probe:

- **Edge cases on terrain boundaries.** Road that clips a river
  polygon by 1u — red or green? (Should be red.)
- **Parks that touch the map edge.** Can the player build up to the
  edge without issues?
- **Scenario switch mid-city.** Does it really cleanly reset? No
  leftover car, no stale node?
- **Per-scenario milestones.** Play Plains to score 100, switch to
  Coastal — does "Score 100" fire again? Should.
- **Save-slot isolation.** Build in Coastal, switch to Plains, build
  there, switch back — both saves intact?
- **Broken save recovery.** Corrupt a save blob manually in
  devtools — the scenario's card should offer Start (not Resume) or
  at least not crash the app.

## What we're NOT doing

- **Procedural map generation.** All scenarios hand-authored.
- **Difficulty levels within a scenario.** Each scenario IS its own
  difficulty, implicitly, via layout.
- **Unlock progression.** All scenarios available from v1.
- **User-authored scenarios / level editor.** Maybe ever, not now.
- **Dynamic terrain changes at runtime.** Terrain is static per
  scenario.
- **Scoring leaderboards per scenario.** Best-score is per-scenario
  already (comes free with per-scenario save), but no external
  leaderboard UI.
- **Multiple saves per scenario.** One slot per scenario. If the
  player wants to start over, Reset clears that slot.

## Future hooks (out of scope for this ship)

Scenarios unlock the door to several later features without
requiring their design now:

- **OSM import scenario** (Stage H) — "Real: Fuengirola" becomes a
  5th card using the baked `data/fuengirola.json` from the shelved
  v1 project. No new machinery needed beyond a scenario-loader
  adapter.
- **Weekly rotating featured scenario** — a new scenario added per
  week as a soft live-ops lever. Add to `scenarios.json`, player
  gets a badge on the new card.
- **Community scenarios** — let players export their current city
  as a scenario JSON and import someone else's. All the format
  already exists.
- **Scenario-specific tunables.** A scenario could, in future,
  override tuning constants (e.g. higher base demand on a
  "Challenge" scenario). Not part of this ship.

## Sources

- Our own `docs/research/fun.md` — "Option C: Scenarios" hook.
- Our own `docs/research/design-pack.md` §F — earlier informal
  scenario sketches.
- Our own `docs/research/optimization.md` A8 — the priority call.
- `NOTES.md` — the two sibling projects note (`traffic-fix/` has
  the OSM baking pipeline for the eventual real-map scenario).
