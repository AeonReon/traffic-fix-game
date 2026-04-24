# Mini Motorways — mechanics breakdown + what we should steal

## TL;DR — what to pull in, ranked

1. **Weekly upgrade draft (pick 1 of 2)** — the single best pacing device in
   MM. Adapt it so the "draft" is our escalation pressure valve, not a
   panic response to random spawns.
2. **Per-destination pressure indicator (pins)** — visible build-up at each
   building tells the player *where* the bottleneck is. Cheap to add,
   huge gameplay clarity.
3. **Building size upgrades** (small → bigger footprint, more demand) — a
   *player-driven* version where the player chooses to upgrade a Shop to a
   Mall, which is more lucrative but generates more traffic.
4. **Tunable intersection speed penalty** — the hidden math that makes
   roundabouts vs traffic lights a real decision. We need this if we want
   our infrastructure upgrades to matter.
5. **Map-expansion / new-entry unlocks** — instead of houses dropping in
   random bad places, we have new *edge entries* opening up as the city
   grows. Adds external pressure without violating the designer-driven
   principle.

Explicitly **not** stealing: colour-matched origin/destination puzzle,
random house spawns, finite road-tile budget, hard-fail game-over.

## Full mechanics

### The core loop
- Houses and Destinations spawn semi-randomly over in-game time.
- Each has a colour; matching colours must be connected by roads.
- Each House permanently contains 2 Cars. Each Destination accumulates
  "pins" representing unmet demand.
- Cars drive House → Destination → House ("Trip"). Each Trip = 1 point.
- If pins pile up past a threshold, a warning timer starts. Fill the
  warning timer and the city shuts down = game over.

### Car pathfinding
- **Shortest-road-tile path**, computed at dispatch.
- **No rerouting mid-trip.** Once a car is on its path it commits.
  (We already do the same via `routeFromNode` — see `game.js`.)
- Dispatch picks the nearest free House-car by road-tile distance.
- Intersection speed penalty: cars slow down each time they pass
  through an intersection. The penalty compounds under congestion —
  two cars on a road: minor. Eight cars queueing: catastrophic.
  ([Frostilyte on compounding intersections](https://frostilyte.ca/2025/04/04/how-to-consistently-hit-2000-or-more-trips-in-mini-motorways/))

### Weekly upgrade draft
- Every in-game Sunday, the game pauses and offers **two upgrade cards**.
  Player picks one. Upgrades either grant infrastructure or a bundle of
  plain road tiles.
- Card types ([Mini Motorways Wiki — Upgrades](https://mini-motorways.fandom.com/wiki/Upgrades)):
  - **Motorway** — bends freely, cars ignore other roads while on it.
    Bundled with 10 road tiles. Community consensus: most powerful
    upgrade.
  - **Bridge** — crosses water. Bundled with 20 road tiles.
  - **Tunnel** — crosses mountains.
  - **Roundabout** — replaces a junction, eliminates intersection
    penalty. Bundled with 20 tiles.
  - **Traffic Light** — replaces a junction; straight-through cars sail
    but turners queue. Bundled with 20 tiles. Widely regarded as
    *worse* than Roundabouts.
  - **Plain road tiles** — 20 or 40 extra.

### Progression curve
- Weeks 1–2: very forgiving. Enough time to plan.
- Weeks 3–5: new colours added, map expands, density climbs.
- Weeks 9–10+: "top gear". Houses sometimes spawn 3 per week.
- Maps have a finite size; the map itself gradually *reveals* new tiles
  that are eligible for spawns — so the city grows outward.
- Scoring = total Trips at time of loss.

### Modifiers (replayability layer)
- **Buy One Get One Free** — doubles every upgrade card.
- **Mini Mysteries** — weekly picks are blind.
- **Dense** — smaller starting area.
- Modifiers stack on any map for variety runs.

### Design lessons community consensus keeps repeating
([Chuniversiteit on colour segregation](https://chuniversiteit.nl/well-played/mini-motorways),
[Steam Strategy Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2553726183),
[Frostilyte guide](https://frostilyte.ca/2025/04/04/how-to-consistently-hit-2000-or-more-trips-in-mini-motorways/)):

- **Segregate colours.** Never let two colours share road segments
  except at the last possible joining point. Traffic streams should
  not *interleave*.
- **Roundabouts > traffic lights.** Lights don't relieve the
  congestion-compounding effect as well.
- **Diagonals are 40% longer** for the same tile cost — prefer
  orthogonal.
- **Minimise the "longest road"**, not the average road. Pacing is
  dictated by the slowest commute.
- **Detours beat intersections.** Sometimes a slightly longer road
  that avoids an extra intersection is the fastest overall.

## What we should pull in (expanded rationale)

### 1. Weekly upgrade draft — our adaptation
**Problem it solves for us:** Right now the game has no *event rhythm*
beyond the manual demand slider. Nothing pulls the player's attention
in at a regular beat.

**How ours differs:** In MM, the draft is a response to panic — you got
a bad house drop, now you need more tiles. In ours, the draft is a
*celebration* — you survived another week of smooth flow, here's a new
toy to add to your toolkit.

Specifically:
- End-of-week summary card shows: Cars delivered this week, jam
  minutes, longest road length, peak concurrent cars.
- Player picks 1 of 2 upgrades. In the orderly-design spirit, options
  skew toward enabling new layouts rather than patching:
  - "Traffic light infrastructure unlocked — place anywhere."
  - "Highway tool unlocked."
  - "A new edge entry opens on the east side." (with map-preview)
  - "A new building type unlocked: Office."
  - "Roundabout tool unlocked." (later: "2-lane roundabout")
  - "One-way tool unlocked."

The set of offered upgrades is **deterministic** based on current
week (not random) so players learn the curve. Randomness over
*which two of three eligible this week* is fine for variety.

### 2. Per-destination pressure indicator
MM shows pins stacking on each destination. This is a *beautiful*
UX pattern — no numbers, just a visible pile that grows faster as
the bottleneck worsens.

For ours: each building shows its `waiting` count (cars en route to
it) as small circles or a fill-ring around its footprint. When
> threshold, it pulses gently red. No game-over, but the pulse is a
"hey, this needs help" nudge.

This also gives the player a reason to open a building menu: "why is
this mall overwhelmed? oh, all my highways merge into one road
before it."

### 3. Building size upgrades — opt-in
MM: destinations upgrade themselves over time (Square → Circle = more
widget demand).

Ours should stay player-driven. Propose:
- Each building has a "level" (1, 2, 3).
- Upgrading a building increases its visit frequency *and* footprint
  (Mall L3 is 2×2 grid, L1 is 1×1).
- Upgrading unlocks after X visits delivered — a *reward* for
  successfully serving it.
- Higher-level buildings are worth more points per visit.

This gives the player a scoring lever that they *control* — "do I
upgrade my downtown mall now, or build another neighbourhood first?" —
without any random spawning.

### 4. Intersection speed penalty (the hidden math)
This is the mechanic that makes roundabouts/lights *mean* something.
Right now our sim has leader-following but no explicit intersection
slowdown.

Proposed implementation:
- Each node caches its "throughput modifier":
  - Plain junction (3+ way): 0.7× speed multiplier to cars within 2
    car-lengths of node.
  - Roundabout: 0.9× (smaller penalty — matches MM).
  - Traffic light: 1.0× straight-through, 0.5× turners, but with a
    stop-at-red queue.
  - Simple crossing (2-way): 1.0×.
- The multiplier applies while the car is within the node's
  "approach zone" (tunable, e.g. 40 world units).
- Compounding: multiplier decreases by 0.05 per car currently in the
  approach zone (down to 0.3 floor).

This gives us:
- A real reason to place roundabouts.
- A visible difference between signalised and unsignalised junctions.
- A tuning knob for balance.

### 5. Map expansion via new entries
Instead of MM's "houses drop in new, gradually-revealed parts of the
map", ours: **new edge entries** fade in from outside on a week
schedule. Week 3: a new NW entry. Week 5: a new NE entry. Etc.

- Player sees them *before* they open (ghost gate with countdown).
- When they open, cars start arriving from them.
- Player decides whether to connect them to existing network or build
  a new arm.

This preserves "player designs everything" while giving the
escalation MM gets from random spawns.

## What we're explicitly not stealing

- **Random building spawns.** Violates the single most important
  design pillar. Any MM feature that depends on them must be adapted.
- **Colour-matched puzzle.** "Drivers are drivers" — locked in.
- **Tile budget economy.** Our roads are free-form polylines in a
  pixel-space graph. A tile count would be arbitrary and fiddly.
- **Hard-fail game-over.** Locked in: sandbox, jam bar is feedback.
- **Monthly reset / scored runs.** Open-ended sessions.

## Sources

- [Mini Motorways Wiki — Main](https://mini-motorways.fandom.com/wiki/Mini_Motorways)
- [Mini Motorways Wiki — Upgrades](https://mini-motorways.fandom.com/wiki/Upgrades)
- [Mini Motorways Wiki — Modifiers](https://mini-motorways.fandom.com/wiki/Modifiers)
- [Wikipedia — Mini Motorways](https://en.wikipedia.org/wiki/Mini_Motorways)
- [Chuniversiteit — Segregation by colour is a good thing](https://chuniversiteit.nl/well-played/mini-motorways)
- [Frostilyte — Consistently hitting 2000+ trips](https://frostilyte.ca/2025/04/04/how-to-consistently-hit-2000-or-more-trips-in-mini-motorways/)
- [Steam — Quick Strategy Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2553726183)
- [Steam — How to Win at Mini Motorways (2000+ achievements)](https://steamcommunity.com/sharedfiles/filedetails/?id=2647966505)
- [Scientific Gamer — Design critique](https://scientificgamer.com/thoughts-mini-motorways/)
- [Gamezebo — Strategy guide](https://www.gamezebo.com/walkthroughs/mini-motorways-guide-tips-cheats-and-strategies/)
- [GamePretty — Strategy tips](https://gamepretty.com/mini-motorways-strategy-guide-tips-for-you-to-start/)
